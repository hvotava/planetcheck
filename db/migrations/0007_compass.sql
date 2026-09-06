-- planetcheck — Kompas: the second index, next to survival. ARCHITECTURE §17.
-- Append-only. Never edit after apply.
--
-- The Kompas asks two different kinds of question in one deck:
--   * `fact`  — three options, exactly one correct, sourced. Scored.
--   * `values` / `trust` — no correct answer; they move the same three axes as a round.
--
-- Deliberately NOT modelled as a round:
--   * a dilemma must never have a correct answer, and rounds enforce that everywhere
--     (planet_results filters q.type = 'choice', the answers trigger feeds the public
--     opinion shares, the deck validator wants 3–9 dilemmas and one honeypot);
--   * a fact is not weekly. It changes when the world changes, not on Monday;
--   * the survival index and its published methodology must keep meaning exactly what
--     they meant before this file existed.
--
-- Shared with the rest of the product: the `voters` table via the pc_anon cookie, the
-- country post-stratification formula from §9, and the flag-never-block rule from §6.

create type compass_section as enum ('fact', 'values', 'trust');

create table compass_questions (
  id               uuid primary key default gen_random_uuid(),
  key              text not null unique,
  section          compass_section not null,
  position         int not null,
  i18n             jsonb not null default '{}'::jsonb,   -- {"cs": {"text":…, "scenario":…}, …}
  i18n_answer      jsonb,                                 -- facts only: the true value in words
  source           jsonb,                                 -- facts only: {name, url, as_of, review_by}
  review_required  boolean not null default false,
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- A fact without a source is a quiz question. The database refuses to hold one.
  constraint compass_fact_needs_source check (section <> 'fact' or source is not null)
);
create index compass_questions_position_idx on compass_questions (position) where active;

create table compass_options (
  id            uuid primary key default gen_random_uuid(),
  question_id   uuid not null references compass_questions(id) on delete cascade,
  key           text not null,
  position      int not null,
  i18n          jsonb not null default '{}'::jsonb,
  icon          text,
  correct       boolean not null default false,
  bias          text,                                     -- 'pessimistic' | 'optimistic', wrong options only
  axis_weights  jsonb not null default '{}'::jsonb,
  active        boolean not null default true,
  unique (question_id, key),
  constraint compass_bias_values check (bias is null or bias in ('pessimistic', 'optimistic'))
);
create unique index compass_one_correct_per_question on compass_options (question_id) where correct and active;

create table compass_submissions (
  id             uuid primary key default gen_random_uuid(),
  voter_id       uuid not null references voters(id) on delete cascade,
  version        int not null,
  trust          trust_level not null default 'anon',
  country_code   char(2) references country_population(country_code),
  ip_hash        text not null,                           -- sha256(IP_SALT || ip), never a raw IP
  ua_family      text,
  locale         text not null default 'en',
  facts_total    int not null default 0,
  facts_correct  int not null default 0,
  knowledge      numeric(5,4),                            -- share correct, null when no fact answered
  chance         numeric(5,4),                            -- what random clicking would have scored
  skill          numeric(6,4),                            -- (knowledge − chance) / (1 − chance), may be negative
  bias           jsonb not null default '{}'::jsonb,      -- {"pessimistic": n, "optimistic": n}
  axis_scores    jsonb not null default '{}'::jsonb,
  flagged        boolean not null default false,
  flag_reasons   text[] not null default '{}',
  synthetic      boolean not null default false,          -- seeded locally; never true in production
  loaded_at      timestamptz,
  submitted_at   timestamptz not null default now(),
  -- One run per person per version. Bumping the version in content lets everyone retake it.
  unique (voter_id, version)
);
create index compass_submissions_version_idx on compass_submissions (version) where not flagged;
create index compass_submissions_country_idx on compass_submissions (version, country_code) where not flagged;

create table compass_answers (
  id             uuid primary key default gen_random_uuid(),
  submission_id  uuid not null references compass_submissions(id) on delete cascade,
  question_id    uuid not null references compass_questions(id),
  option_id      uuid not null references compass_options(id),
  correct        boolean not null default false,          -- denormalised at insert: aggregates stay cheap
  unique (submission_id, question_id)
);
create index compass_answers_question_idx on compass_answers (question_id, option_id);

-- ---------------------------------------------------------------------------
-- SQL API (same shape as 0003: fn(p jsonb) returns jsonb)
-- ---------------------------------------------------------------------------

-- Upsert the deck from content/compass.yaml. Never deletes; deactivates instead, so that
-- answers already given keep pointing at a real question.
create or replace function sync_compass(p jsonb) returns jsonb
language plpgsql as $$
declare
  q jsonb; o jsonb;
  v_q uuid;
  n_q int := 0; n_o int := 0;
  q_keys text[] := '{}';
  o_keys text[];
begin
  for q in select x from jsonb_array_elements(coalesce(p->'questions', '[]'::jsonb)) x loop
    -- The partial unique index on `correct` fires per question, so clear the old winner first.
    update compass_options set correct = false
     where question_id = (select id from compass_questions where key = q->>'key');

    insert into compass_questions (key, section, position, i18n, i18n_answer, source, review_required, active)
    values (q->>'key', (q->>'section')::compass_section, (q->>'position')::int,
            coalesce(q->'i18n', '{}'::jsonb), q->'i18n_answer', q->'source',
            coalesce((q->>'review_required')::boolean, false), true)
    on conflict (key) do update
      set section = excluded.section, position = excluded.position, i18n = excluded.i18n,
          i18n_answer = excluded.i18n_answer, source = excluded.source,
          review_required = excluded.review_required, active = true, updated_at = now()
    returning id into v_q;
    n_q := n_q + 1;
    q_keys := q_keys || (q->>'key');

    o_keys := '{}';
    for o in select x from jsonb_array_elements(coalesce(q->'options', '[]'::jsonb)) x loop
      insert into compass_options (question_id, key, position, i18n, icon, correct, bias, axis_weights, active)
      values (v_q, o->>'key', (o->>'position')::int, coalesce(o->'i18n', '{}'::jsonb), o->>'icon',
              coalesce((o->>'correct')::boolean, false), o->>'bias',
              coalesce(o->'axis_weights', '{}'::jsonb), true)
      on conflict (question_id, key) do update
        set position = excluded.position, i18n = excluded.i18n, icon = excluded.icon,
            correct = excluded.correct, bias = excluded.bias, axis_weights = excluded.axis_weights, active = true;
      n_o := n_o + 1;
      o_keys := o_keys || (o->>'key');
    end loop;
    update compass_options set active = false where question_id = v_q and active and not (key = any (o_keys));
  end loop;
  update compass_questions set active = false where active and not (key = any (q_keys));

  return jsonb_build_object('questions', n_q, 'options', n_o);
end $$;

-- The full deck, correct answers included. SERVER ONLY — the browser gets the stripped
-- shape from src/lib/compass/deck.ts, exactly as a round hides its honeypot.
create or replace function get_compass(p jsonb) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'version', coalesce((p->>'version')::int, 1),
    'i18n', coalesce(p->'i18n', '{}'::jsonb),
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', q.id, 'key', q.key, 'section', q.section, 'position', q.position,
        'i18n', q.i18n, 'i18n_answer', q.i18n_answer, 'source', q.source,
        'review_required', q.review_required,
        'options', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', o.id, 'key', o.key, 'position', o.position, 'i18n', o.i18n, 'icon', o.icon,
            'correct', o.correct, 'bias', o.bias, 'axis_weights', o.axis_weights) order by o.position)
          from compass_options o where o.question_id = q.id and o.active), '[]'::jsonb)
      ) order by q.position)
      from compass_questions q where q.active), '[]'::jsonb)
  );
$$;

-- {anon_id, version} → has this device already taken this version?
create or replace function compass_status(p jsonb) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'voter_id', v.id,
    'submission_id', (select c.id from compass_submissions c where c.voter_id = v.id and c.version = coalesce((p->>'version')::int, 1))
  )
  from voters v where v.anon_id = (p->>'anon_id')::uuid;
$$;

-- One run of the Kompas. The score arrives already computed (src/lib/compass/score.ts);
-- correctness per answer is re-read from the options table, so the client cannot claim it.
create or replace function submit_compass(p jsonb) returns jsonb
language plpgsql as $$
declare
  v_version int := coalesce((p->>'version')::int, 1);
  v_voter voters;
  v_existing uuid;
  v_sub uuid;
  v_country char(2);
  v_flags text[] := coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p->'flags', '[]'::jsonb)) x), '{}');
begin
  if p->>'anon_id' is null then raise exception 'anon_id is required'; end if;

  insert into voters (anon_id) values ((p->>'anon_id')::uuid)
  on conflict (anon_id) do update set last_seen_at = now()
  returning * into v_voter;

  select id into v_existing from compass_submissions where voter_id = v_voter.id and version = v_version;
  if v_existing is not null then
    return jsonb_build_object('ok', false, 'code', 'duplicate', 'submission_id', v_existing);
  end if;

  select country_code into v_country from country_population where country_code = upper(p->>'country');

  begin
    insert into compass_submissions (
      voter_id, version, trust, country_code, ip_hash, ua_family, locale,
      facts_total, facts_correct, knowledge, chance, skill, bias, axis_scores,
      flagged, flag_reasons, synthetic, loaded_at, submitted_at)
    values (
      v_voter.id, v_version, v_voter.trust, v_country,
      coalesce(p->>'ip_hash', ''), p->>'ua_family', coalesce(p->>'locale', 'en'),
      coalesce((p#>>'{score,facts_total}')::int, 0), coalesce((p#>>'{score,facts_correct}')::int, 0),
      (p#>>'{score,knowledge}')::numeric, (p#>>'{score,chance}')::numeric, (p#>>'{score,skill}')::numeric,
      coalesce(p#>'{score,bias}', '{}'::jsonb), coalesce(p#>'{score,axes}', '{}'::jsonb),
      cardinality(v_flags) > 0, v_flags, coalesce((p->>'synthetic')::boolean, false),
      (p->>'loaded_at')::timestamptz, coalesce((p->>'submitted_at')::timestamptz, now()))
    returning id into v_sub;
  exception when unique_violation then
    select id into v_existing from compass_submissions where voter_id = v_voter.id and version = v_version;
    return jsonb_build_object('ok', false, 'code', 'duplicate', 'submission_id', v_existing);
  end;

  insert into compass_answers (submission_id, question_id, option_id, correct)
  select v_sub, (x->>'question_id')::uuid, (x->>'option_id')::uuid,
         coalesce((select o.correct from compass_options o where o.id = (x->>'option_id')::uuid), false)
  from jsonb_array_elements(coalesce(p->'answers', '[]'::jsonb)) x;

  return jsonb_build_object('ok', true, 'submission_id', v_sub, 'flags', to_jsonb(v_flags), 'country', v_country);
end $$;

-- Country post-stratification for one Kompas version, using the §9 country formula.
-- Demographic raking is deliberately not applied: the Kompas asks no demographics, so
-- there is nothing to rake on. The methodology page says so in as many words.
create or replace function compass_country_weights(p_version int, p_lo numeric, p_hi numeric)
returns table (country_code char(2), n bigint, w numeric)
language sql stable as $$
  with g as (
    select s.country_code as code, count(*)::bigint as n
    from compass_submissions s
    where s.version = p_version and s.flagged = false and s.country_code is not null
    group by s.country_code
  ),
  tot as (select coalesce(sum(n), 0)::numeric as n_all from g),
  pop as (select sum(cp.population)::numeric as pop_all from country_population cp where cp.country_code in (select code from g))
  select g.code,
         g.n,
         case
           when tot.n_all = 0 or pop.pop_all is null or pop.pop_all = 0 then 1::numeric
           else least(p_hi, greatest(p_lo, ((cp.population::numeric / pop.pop_all) / (g.n::numeric / tot.n_all))))
         end as w
  from g
  join country_population cp on cp.country_code = g.code
  cross join tot cross join pop;
$$;

-- Per-question option shares. Shown during the deck so the rhythm survives, and it leaks
-- nothing: what the planet answered is not the same thing as what is true.
create or replace function compass_shares(p jsonb) returns jsonb
language plpgsql stable as $$
declare
  v_version int := coalesce((p->>'version')::int, 1);
  v_lo numeric := coalesce((p->>'clamp_lo')::numeric, 0.2);
  v_hi numeric := coalesce((p->>'clamp_hi')::numeric, 5.0);
  v_out jsonb;
begin
  with cw as (select * from compass_country_weights(v_version, v_lo, v_hi)),
  sub as (
    select s.id, coalesce(cw.w, 1::numeric) as w
    from compass_submissions s
    left join cw on cw.country_code = s.country_code
    where s.version = v_version and not s.flagged
  ),
  ans as (
    select a.question_id, a.option_id, count(*)::bigint as n, sum(sub.w) as w
    from compass_answers a join sub on sub.id = a.submission_id
    group by a.question_id, a.option_id
  ),
  qtot as (select question_id, sum(n) as n, sum(w) as w from ans group by question_id)
  select jsonb_build_object(
    'version', v_version,
    'questions', coalesce(jsonb_agg(jsonb_build_object(
      'question_id', q.id, 'key', q.key,
      'total_raw', coalesce(qt.n, 0), 'total_weighted', round(coalesce(qt.w, 0), 2),
      'options', coalesce((
        select jsonb_agg(jsonb_build_object(
          'option_id', o.id, 'key', o.key,
          'raw', coalesce(an.n, 0), 'weighted', round(coalesce(an.w, 0), 2),
          'share_raw', case when coalesce(qt.n, 0) > 0 then round(100.0 * coalesce(an.n, 0) / qt.n, 2) else null end,
          'share_weighted', case when coalesce(qt.w, 0) > 0 then round(100.0 * coalesce(an.w, 0) / qt.w, 2) else null end
        ) order by o.position)
        from compass_options o left join ans an on an.option_id = o.id
        where o.question_id = q.id and o.active), '[]'::jsonb)
    ) order by q.position), '[]'::jsonb))
    into v_out
  from compass_questions q left join qtot qt on qt.question_id = q.id
  where q.active;
  return v_out;
end $$;

-- The planet's Kompas. Raw and weighted side by side (CLAUDE.md rule 5).
create or replace function compass_stats(p jsonb) returns jsonb
language plpgsql stable as $$
declare
  v_version int := coalesce((p->>'version')::int, 1);
  v_lo numeric := coalesce((p->>'clamp_lo')::numeric, 0.2);
  v_hi numeric := coalesce((p->>'clamp_hi')::numeric, 5.0);
  v_chance numeric;
  v_out jsonb;
begin
  -- What random clicking scores on this deck: the mean of 1/options over the facts.
  select avg(1.0 / nullif(cnt, 0)) into v_chance
  from (select count(*) as cnt from compass_options o join compass_questions q on q.id = o.question_id
        where q.active and o.active and q.section = 'fact' group by q.id) t;

  with cw as (select * from compass_country_weights(v_version, v_lo, v_hi)),
  sub as (
    select s.*, coalesce(cw.w, 1::numeric) as w
    from compass_submissions s
    left join cw on cw.country_code = s.country_code
    where s.version = v_version and not s.flagged
  ),
  tot as (
    select count(*)::bigint as n, coalesce(sum(w), 0) as w_all,
      avg(knowledge) as k_raw,
      sum(knowledge * w) filter (where knowledge is not null) / nullif(sum(w) filter (where knowledge is not null), 0) as k_w,
      avg(skill) as s_raw,
      sum(skill * w) filter (where skill is not null) / nullif(sum(w) filter (where skill is not null), 0) as s_w,
      coalesce(sum((bias->>'pessimistic')::int), 0) as b_pess,
      coalesce(sum((bias->>'optimistic')::int), 0) as b_opt,
      avg((axis_scores->>'peace_force')::numeric) as pf_raw,
      sum((axis_scores->>'peace_force')::numeric * w) / nullif(sum(w), 0) as pf_w,
      avg((axis_scores->>'trust_paranoia')::numeric) as tp_raw,
      sum((axis_scores->>'trust_paranoia')::numeric * w) / nullif(sum(w), 0) as tp_w,
      avg((axis_scores->>'us_them')::numeric) as ut_raw,
      sum((axis_scores->>'us_them')::numeric * w) / nullif(sum(w), 0) as ut_w
    from sub
  ),
  ans as (
    select a.question_id, a.option_id, a.correct, count(*)::bigint as n, sum(sub.w) as w
    from compass_answers a join sub on sub.id = a.submission_id
    group by a.question_id, a.option_id, a.correct
  ),
  qtot as (select question_id, sum(n) as n, sum(w) as w from ans group by question_id)
  select jsonb_build_object(
    'version', v_version,
    'n', (select n from tot),
    'n_weighted', round((select w_all from tot), 2),
    'chance', round(v_chance, 4),
    'knowledge', (select jsonb_build_object('raw', round(k_raw, 4), 'weighted', round(k_w, 4)) from tot),
    'skill', (select jsonb_build_object('raw', round(s_raw, 4), 'weighted', round(s_w, 4)) from tot),
    'bias', (select jsonb_build_object('pessimistic', b_pess, 'optimistic', b_opt) from tot),
    'axis_means', (select jsonb_build_object(
        'raw', jsonb_build_object('peace_force', round(pf_raw, 4), 'trust_paranoia', round(tp_raw, 4), 'us_them', round(ut_raw, 4)),
        'weighted', jsonb_build_object('peace_force', round(pf_w, 4), 'trust_paranoia', round(tp_w, 4), 'us_them', round(ut_w, 4))) from tot),
    'questions', coalesce((select jsonb_agg(jsonb_build_object(
        'question_id', q.id, 'key', q.key, 'section', q.section,
        'correct_option_id', (select o.id from compass_options o where o.question_id = q.id and o.correct and o.active limit 1),
        'total_raw', coalesce(qt.n, 0),
        'correct_share', jsonb_build_object(
          'raw', case when coalesce(qt.n, 0) > 0 then round(100.0 * coalesce((select sum(n) from ans where ans.question_id = q.id and ans.correct), 0) / qt.n, 2) else null end,
          'weighted', case when coalesce(qt.w, 0) > 0 then round(100.0 * coalesce((select sum(w) from ans where ans.question_id = q.id and ans.correct), 0) / qt.w, 2) else null end),
        'options', coalesce((
          select jsonb_agg(jsonb_build_object(
            'option_id', o.id, 'key', o.key,
            'raw', coalesce(an.n, 0), 'weighted', round(coalesce(an.w, 0), 2),
            'share_raw', case when coalesce(qt.n, 0) > 0 then round(100.0 * coalesce(an.n, 0) / qt.n, 2) else null end,
            'share_weighted', case when coalesce(qt.w, 0) > 0 then round(100.0 * coalesce(an.w, 0) / qt.w, 2) else null end
          ) order by o.position)
          from compass_options o left join ans an on an.option_id = o.id
          where o.question_id = q.id and o.active), '[]'::jsonb)
      ) order by q.position)
      from compass_questions q left join qtot qt on qt.question_id = q.id
      where q.active), '[]'::jsonb),
    'countries', coalesce((select jsonb_agg(jsonb_build_object(
        'country_code', x.country_code, 'n', x.n, 'knowledge', round(x.k, 4)) order by x.n desc)
      from (select s.country_code, count(*)::bigint as n, avg(s.knowledge) as k
            from sub s where s.country_code is not null group by s.country_code) x), '[]'::jsonb)
  ) into v_out;
  return v_out;
end $$;

-- One player's Kompas, with the correct answers revealed. Only ever called for a
-- submission that already exists, which is what keeps the answers out of the deck.
create or replace function get_compass_submission(p jsonb) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', s.id, 'version', s.version, 'country_code', s.country_code, 'trust', s.trust, 'locale', s.locale,
    'facts_total', s.facts_total, 'facts_correct', s.facts_correct,
    'knowledge', s.knowledge, 'chance', s.chance, 'skill', s.skill,
    'bias', s.bias, 'axis_scores', s.axis_scores, 'submitted_at', s.submitted_at,
    'answers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'question_id', a.question_id, 'question_key', q.key, 'section', q.section, 'position', q.position,
        'option_id', a.option_id, 'option_key', o.key, 'correct', a.correct) order by q.position)
      from compass_answers a
      join compass_questions q on q.id = a.question_id
      join compass_options o on o.id = a.option_id
      where a.submission_id = s.id), '[]'::jsonb)
  )
  from compass_submissions s
  where s.id = (p->>'submission_id')::uuid;
$$;

-- ---------------------------------------------------------------------------
-- The crossing: does knowing how the world is change how people decide?
-- Splits a round's voters into thirds by their Kompas score and reports, per option,
-- how each third answered. This is the one number in the product that no opinion poll
-- and no fact quiz can produce on its own.
-- ---------------------------------------------------------------------------
create or replace function round_by_knowledge(p jsonb) returns jsonb
language sql stable as $$
  with params as (
    select (p->>'round_id')::uuid as rid,
           coalesce((p->>'version')::int, 1) as ver,
           coalesce((p->>'min_n')::int, 30) as min_n
  ),
  banded as (
    select s.id as submission_id, c.knowledge, s.survival, s.weight,
           case ntile(3) over (order by c.knowledge, c.id) when 1 then 'low' when 2 then 'mid' else 'high' end as band
    from submissions s
    join compass_submissions c on c.voter_id = s.voter_id
    join params on true
    where s.round_id = params.rid and not s.flagged
      and c.version = params.ver and not c.flagged and c.knowledge is not null
  ),
  n as (select count(*)::int as n from banded),
  band_tot as (select band, count(*)::bigint as n, sum(weight) as w, avg(knowledge) as k, avg(survival) as sv from banded group by band),
  opt as (
    select a.question_id, a.option_id, b.band, sum(b.weight) as w
    from answers a join banded b on b.submission_id = a.submission_id
    group by a.question_id, a.option_id, b.band
  ),
  qtot as (select question_id, band, sum(w) as w from opt group by question_id, band),
  bands as (select distinct band from banded),
  -- Every option is crossed with every band on purpose: an option nobody in a third chose
  -- is a 0, not a missing number, and the gap between thirds only reads correctly that way.
  shares as (
    select o.question_id, o.id as option_id, b.band,
           case when qt.w > 0 then 100.0 * coalesce(op.w, 0) / qt.w else null end as share
    from options o
    join questions q on q.id = o.question_id
    join params on true
    cross join bands b
    left join opt op on op.option_id = o.id and op.band = b.band
    left join qtot qt on qt.question_id = o.question_id and qt.band = b.band
    where q.round_id = params.rid and q.active and o.active
  )
  select jsonb_build_object(
    'round_id', (select rid from params),
    'version', (select ver from params),
    'min_n', (select min_n from params),
    'n', (select n from n),
    'enough', (select n from n) >= (select min_n from params),
    'tertiles', case when (select n from n) < (select min_n from params) then '[]'::jsonb else
      coalesce((select jsonb_agg(jsonb_build_object(
        'band', b.band, 'n', b.n, 'knowledge_mean', round(b.k, 4), 'survival_mean', round(b.sv, 4))
        order by case b.band when 'low' then 1 when 'mid' then 2 else 3 end) from band_tot b), '[]'::jsonb) end,
    'questions', case when (select n from n) < (select min_n from params) then '[]'::jsonb else
      coalesce((select jsonb_agg(jsonb_build_object(
        'question_id', q.id, 'key', q.key, 'i18n', q.i18n,
        'options', coalesce((
          select jsonb_agg(jsonb_build_object(
            'option_id', o.id, 'key', o.key, 'i18n', o.i18n,
            'low', round((select share from shares where option_id = o.id and band = 'low'), 2),
            'mid', round((select share from shares where option_id = o.id and band = 'mid'), 2),
            'high', round((select share from shares where option_id = o.id and band = 'high'), 2),
            'gap', round((select share from shares where option_id = o.id and band = 'high')
                       - (select share from shares where option_id = o.id and band = 'low'), 2)
          ) order by o.position)
          from options o where o.question_id = q.id and o.active), '[]'::jsonb)
      ) order by q.position)
      from questions q join params on true
      where q.round_id = params.rid and q.active and q.type = 'choice'), '[]'::jsonb) end
  );
$$;
