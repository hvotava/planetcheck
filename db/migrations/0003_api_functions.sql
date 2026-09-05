-- planetcheck — SQL API. Every function takes one `p jsonb` and returns jsonb.
-- The application never writes to tables directly; it calls these functions
-- (via `pg` on Railway, via PGlite locally/in tests — identical semantics).
-- Append-only file; evolve functions with `create or replace` in later migrations.

-- ===========================================================================
-- Content sync (scripts/sync-content.ts)
-- ===========================================================================
create or replace function sync_countries(p jsonb) returns jsonb
language plpgsql as $$
declare n int;
begin
  insert into country_population (country_code, name_en, region, population, demographics, source, updated_at)
  select x.code, x.name_en, x.region, x.population, coalesce(x.demographics, '{}'::jsonb), coalesce(x.source, 'World Bank'), now()
  from jsonb_to_recordset(p) as x(code char(2), name_en text, region text, population bigint, demographics jsonb, source text)
  on conflict (country_code) do update
    set name_en = excluded.name_en, region = excluded.region, population = excluded.population,
        demographics = excluded.demographics, source = excluded.source, updated_at = now();
  get diagnostics n = row_count;
  return jsonb_build_object('count', n);
end $$;

create or replace function sync_round(p jsonb) returns jsonb
language plpgsql as $$
declare
  v_round uuid;
  q jsonb; o jsonb; c jsonb;
  v_q uuid;
  n_q int := 0; n_o int := 0; n_c int := 0;
  q_keys text[] := '{}';
  o_keys text[];
  c_keys text[];
begin
  insert into rounds (slug, kind, status, starts_at, ends_at, unlock_threshold, survival_weights, i18n)
  values (
    p->>'slug', (p->>'kind')::round_kind, coalesce((p->>'status')::round_status, 'draft'),
    (p->>'starts_at')::timestamptz, (p->>'ends_at')::timestamptz, coalesce((p->>'unlock_threshold')::int, 500),
    coalesce(p->'survival_weights', '{"consistency":0.4,"compromise":0.35,"realism":0.25}'::jsonb),
    coalesce(p->'i18n', '{}'::jsonb)
  )
  on conflict (slug) do update
    set kind = excluded.kind, status = excluded.status, starts_at = excluded.starts_at, ends_at = excluded.ends_at,
        unlock_threshold = excluded.unlock_threshold, survival_weights = excluded.survival_weights,
        i18n = excluded.i18n, updated_at = now()
  returning id into v_round;

  -- pass 1: questions + options
  for q in select x from jsonb_array_elements(coalesce(p->'questions', '[]'::jsonb)) x loop
    insert into questions (round_id, key, type, position, i18n, review_required, anchor, active)
    values (v_round, q->>'key', (q->>'type')::question_type, (q->>'position')::int, coalesce(q->'i18n', '{}'::jsonb),
            coalesce((q->>'review_required')::boolean, false), coalesce((q->>'anchor')::boolean, false), true)
    on conflict (round_id, key) do update
      set type = excluded.type, position = excluded.position, i18n = excluded.i18n,
          review_required = excluded.review_required, anchor = excluded.anchor, active = true
    returning id into v_q;
    n_q := n_q + 1;
    q_keys := q_keys || (q->>'key');

    o_keys := '{}';
    for o in select x from jsonb_array_elements(coalesce(q->'options', '[]'::jsonb)) x loop
      insert into options (question_id, key, position, i18n, icon, axis_weights, compromise, honeypot, active)
      values (v_q, o->>'key', (o->>'position')::int, coalesce(o->'i18n', '{}'::jsonb), o->>'icon',
              coalesce(o->'axis_weights', '{}'::jsonb), coalesce((o->>'compromise')::boolean, false),
              coalesce((o->>'honeypot')::boolean, false), true)
      on conflict (question_id, key) do update
        set position = excluded.position, i18n = excluded.i18n, icon = excluded.icon, axis_weights = excluded.axis_weights,
            compromise = excluded.compromise, honeypot = excluded.honeypot, active = true;
      n_o := n_o + 1;
      o_keys := o_keys || (o->>'key');
    end loop;
    update options set active = false where question_id = v_q and active and not (key = any (o_keys));
  end loop;
  update questions set active = false where round_id = v_round and active and not (key = any (q_keys));

  -- pass 2: meta targets
  for q in select x from jsonb_array_elements(coalesce(p->'questions', '[]'::jsonb)) x where x->>'type' = 'meta' loop
    update questions qq
       set meta_target_question_id = tq.id, meta_target_option_id = topt.id
      from questions tq
      join options topt on topt.question_id = tq.id
     where qq.round_id = v_round and qq.key = q->>'key'
       and tq.round_id = v_round and tq.key = q#>>'{target,question}' and topt.key = q#>>'{target,option}';
  end loop;

  -- contradiction pairs
  c_keys := '{}';
  for c in select x from jsonb_array_elements(coalesce(p->'contradictions', '[]'::jsonb)) x loop
    insert into contradiction_pairs (round_id, key, option_a_id, option_b_id, i18n, active)
    select v_round, c->>'key', oa.id, ob.id, coalesce(c->'i18n', '{}'::jsonb), true
      from options oa join questions qa on qa.id = oa.question_id,
           options ob join questions qb on qb.id = ob.question_id
     where qa.round_id = v_round and qa.key = c#>>'{a,question}' and oa.key = c#>>'{a,option}'
       and qb.round_id = v_round and qb.key = c#>>'{b,question}' and ob.key = c#>>'{b,option}'
    on conflict (round_id, key) do update
      set option_a_id = excluded.option_a_id, option_b_id = excluded.option_b_id, i18n = excluded.i18n, active = true;
    n_c := n_c + 1;
    c_keys := c_keys || (c->>'key');
  end loop;
  update contradiction_pairs set active = false where round_id = v_round and active and not (key = any (c_keys));

  return jsonb_build_object('round_id', v_round, 'slug', p->>'slug', 'questions', n_q, 'options', n_o, 'contradictions', n_c);
end $$;

-- ===========================================================================
-- Rounds
-- ===========================================================================
create or replace function round_payload(r rounds) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', r.id, 'slug', r.slug, 'kind', r.kind, 'status', r.status,
    'starts_at', r.starts_at, 'ends_at', r.ends_at, 'unlock_threshold', r.unlock_threshold,
    'survival_weights', r.survival_weights, 'i18n', r.i18n,
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', q.id, 'key', q.key, 'type', q.type, 'position', q.position, 'i18n', q.i18n,
        'review_required', q.review_required, 'anchor', q.anchor,
        'target', case when q.type = 'meta' then jsonb_build_object(
            'question_id', q.meta_target_question_id, 'option_id', q.meta_target_option_id,
            'question_key', (select key from questions where id = q.meta_target_question_id),
            'option_key', (select key from options where id = q.meta_target_option_id)) else null end,
        'options', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', o.id, 'key', o.key, 'position', o.position, 'i18n', o.i18n, 'icon', o.icon,
            'axis_weights', o.axis_weights, 'compromise', o.compromise, 'honeypot', o.honeypot) order by o.position)
          from options o where o.question_id = q.id and o.active), '[]'::jsonb)
      ) order by q.position)
      from questions q where q.round_id = r.id and q.active), '[]'::jsonb),
    'contradictions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'key', c.key, 'i18n', c.i18n,
        'a', jsonb_build_object('question_id', oa.question_id, 'option_id', c.option_a_id, 'question_key', qa.key, 'option_key', oa.key),
        'b', jsonb_build_object('question_id', ob.question_id, 'option_id', c.option_b_id, 'question_key', qb.key, 'option_key', ob.key)))
      from contradiction_pairs c
      join options oa on oa.id = c.option_a_id join questions qa on qa.id = oa.question_id
      join options ob on ob.id = c.option_b_id join questions qb on qb.id = ob.question_id
      where c.round_id = r.id and c.active), '[]'::jsonb)
  );
$$;

-- {id?} | {slug?} | {kind?: 'weekly', fallback_anchor?: true}
create or replace function get_round(p jsonb) returns jsonb
language plpgsql stable as $$
declare r rounds;
begin
  if p->>'id' is not null then
    select * into r from rounds where id = (p->>'id')::uuid;
  elsif p->>'slug' is not null then
    select * into r from rounds where slug = p->>'slug';
  else
    r := current_round(coalesce((p->>'kind')::round_kind, 'weekly'));
    if r.id is null and coalesce((p->>'fallback_anchor')::boolean, true) then
      r := current_round('anchor');
    end if;
  end if;
  if r.id is null then return null; end if;
  return round_payload(r);
end $$;

create or replace function list_rounds(p jsonb) returns jsonb
language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id, 'slug', r.slug, 'kind', r.kind, 'status', r.status, 'starts_at', r.starts_at, 'ends_at', r.ends_at,
    'i18n', r.i18n, 'unlock_threshold', r.unlock_threshold,
    'votes_total', coalesce((select votes_total from planet_stats ps where ps.round_id = r.id), 0)
  ) order by r.starts_at desc), '[]'::jsonb)
  from rounds r
  where (p->>'include_draft')::boolean is true or r.status <> 'draft';
$$;

-- Has this voter (anon cookie) already played the round? {round_id, anon_id}
create or replace function voter_status(p jsonb) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'voter_id', v.id, 'trust', v.trust, 'verified', v.auth_user_id is not null,
    'submission_id', (select s.id from submissions s where s.round_id = (p->>'round_id')::uuid and s.voter_id = v.id),
    'submissions_total', (select count(*) from submissions s where s.voter_id = v.id)
  )
  from voters v where v.anon_id = (p->>'anon_id')::uuid;
$$;

-- ===========================================================================
-- Live shares
-- ===========================================================================
-- {question_id, country?}
create or replace function question_shares(p jsonb) returns jsonb
language sql stable as $$
  with q as (select (p->>'question_id')::uuid as id, nullif(upper(p->>'country'), '') as country),
  planet as (
    select a.option_id, sum(a.cnt) as raw, sum(a.sum_weight) as weighted
    from agg_option_country a, q where a.question_id = q.id group by a.option_id
  ),
  ptot as (select coalesce(sum(raw), 0) as raw, coalesce(sum(weighted), 0) as weighted from planet),
  country as (
    select a.option_id, sum(a.cnt) as raw, sum(a.sum_weight) as weighted
    from agg_option_country a, q where a.question_id = q.id and q.country is not null and a.country_code = q.country group by a.option_id
  ),
  ctot as (select coalesce(sum(raw), 0) as raw, coalesce(sum(weighted), 0) as weighted from country),
  opts as (select o.id, o.key, o.position from options o, q where o.question_id = q.id and o.active)
  select jsonb_build_object(
    'question_id', (select id from q),
    'total_raw', (select raw from ptot),
    'total_weighted', round((select weighted from ptot), 2),
    'options', coalesce((select jsonb_agg(jsonb_build_object(
        'option_id', o.id, 'key', o.key, 'raw', coalesce(pl.raw, 0), 'weighted', round(coalesce(pl.weighted, 0), 2),
        'share_raw', case when pt.raw > 0 then round(100.0 * coalesce(pl.raw, 0) / pt.raw, 2) else null end,
        'share_weighted', case when pt.weighted > 0 then round(100.0 * coalesce(pl.weighted, 0) / pt.weighted, 2) else null end
      ) order by o.position) from opts o left join planet pl on pl.option_id = o.id, ptot pt), '[]'::jsonb),
    'country', case when (select country from q) is null then null else jsonb_build_object(
        'code', (select country from q), 'total_raw', (select raw from ctot),
        'options', coalesce((select jsonb_agg(jsonb_build_object(
          'option_id', o.id, 'key', o.key, 'raw', coalesce(c.raw, 0), 'weighted', round(coalesce(c.weighted, 0), 2),
          'share_raw', case when ct.raw > 0 then round(100.0 * coalesce(c.raw, 0) / ct.raw, 2) else null end,
          'share_weighted', case when ct.weighted > 0 then round(100.0 * coalesce(c.weighted, 0) / ct.weighted, 2) else null end
        ) order by o.position) from opts o left join country c on c.option_id = o.id, ctot ct), '[]'::jsonb)) end
  );
$$;

-- {round_id} → current weighted/raw share of each meta question's target option
create or replace function meta_actuals(p jsonb) returns jsonb
language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'question_id', q.id, 'question_key', q.key,
    'target_question_id', q.meta_target_question_id, 'target_option_id', q.meta_target_option_id,
    'actual_weighted', option_share(q.meta_target_option_id, true),
    'actual_raw', option_share(q.meta_target_option_id, false)
  ) order by q.position), '[]'::jsonb)
  from questions q
  where q.round_id = (p->>'round_id')::uuid and q.type = 'meta' and q.active and q.meta_target_option_id is not null;
$$;

-- ===========================================================================
-- Vote (ARCHITECTURE §6). Flags never block; the only hard block is the duplicate.
-- ===========================================================================
create or replace function submit_vote(p jsonb) returns jsonb
language plpgsql as $$
declare
  v_round     uuid := (p->>'round_id')::uuid;
  v_anon      uuid := (p->>'anon_id')::uuid;
  v_voter     voters;
  v_flags     text[] := coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p->'flags', '[]'::jsonb)) x), '{}');
  v_country   char(2);
  v_sub       uuid;
  v_existing  uuid;
  v_ip_n      int;
  v_anon_n    int;
  v_rate_ip   int := coalesce((p->>'rate_ip_per_hour')::int, 10);
  v_rate_anon int := coalesce((p->>'rate_anon_per_hour')::int, 3);
  v_skip_rate boolean := coalesce((p->>'skip_rate')::boolean, false);
  v_at        timestamptz := coalesce((p->>'submitted_at')::timestamptz, now());
begin
  if v_round is null or v_anon is null then
    raise exception 'round_id and anon_id are required';
  end if;

  insert into voters (anon_id) values (v_anon)
  on conflict (anon_id) do update set last_seen_at = now()
  returning * into v_voter;

  -- duplicate check (cookie identity and, if linked, verified identity)
  select id into v_existing from submissions where round_id = v_round and voter_id = v_voter.id;
  if v_existing is not null then
    return jsonb_build_object('ok', false, 'code', 'duplicate', 'submission_id', v_existing);
  end if;
  if v_voter.auth_user_id is not null then
    select id into v_existing from submissions where round_id = v_round and auth_user_id = v_voter.auth_user_id;
    if v_existing is not null then
      return jsonb_build_object('ok', false, 'code', 'duplicate', 'submission_id', v_existing);
    end if;
  end if;

  -- suspicion flags (never block)
  if not v_skip_rate then
    select count(*) into v_ip_n from submissions
      where ip_hash = p->>'ip_hash' and submitted_at > v_at - interval '1 hour';
    if v_ip_n >= v_rate_ip then v_flags := array_append(v_flags, 'rate_ip'); end if;
    select count(*) into v_anon_n from submissions
      where voter_id = v_voter.id and submitted_at > v_at - interval '1 hour';
    if v_anon_n >= v_rate_anon then v_flags := array_append(v_flags, 'rate_anon'); end if;
  end if;

  select country_code into v_country from country_population where country_code = upper(p->>'country');

  begin
    insert into submissions (
      round_id, voter_id, auth_user_id, trust, country_code, geo_country_code, declared_country,
      age_band, gender, settlement, ip_hash, ua_family, locale,
      axis_scores, realism, consistency, compromise, survival, archetype, contradictions_hit,
      flagged, flag_reasons, loaded_at, synthetic, submitted_at)
    values (
      v_round, v_voter.id, v_voter.auth_user_id, v_voter.trust, v_country,
      nullif(upper(p->>'geo_country'), ''), nullif(upper(p->>'declared_country'), ''),
      (p->>'age_band')::age_band, (p->>'gender')::gender_band, (p->>'settlement')::settlement_band,
      coalesce(p->>'ip_hash', ''), p->>'ua_family', coalesce(p->>'locale', 'en'),
      coalesce(p#>'{score,axes}', '{}'::jsonb), (p#>>'{score,realism}')::numeric, (p#>>'{score,consistency}')::numeric,
      (p#>>'{score,compromise}')::numeric, (p#>>'{score,survival}')::numeric, p#>>'{score,archetype}',
      coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p#>'{score,contradictions_hit}', '[]'::jsonb)) x), '{}'),
      cardinality(v_flags) > 0, v_flags, (p->>'loaded_at')::timestamptz,
      coalesce((p->>'synthetic')::boolean, false), v_at)
    returning id into v_sub;
  exception when unique_violation then
    select id into v_existing from submissions
     where round_id = v_round
       and (voter_id = v_voter.id or (v_voter.auth_user_id is not null and auth_user_id = v_voter.auth_user_id));
    return jsonb_build_object('ok', false, 'code', 'duplicate', 'submission_id', v_existing);
  end;

  insert into answers (submission_id, question_id, option_id)
  select v_sub, (x->>'question_id')::uuid, (x->>'option_id')::uuid
  from jsonb_array_elements(coalesce(p->'answers', '[]'::jsonb)) x;

  insert into meta_guesses (submission_id, question_id, guess, actual_at_submit)
  select v_sub, (x->>'question_id')::uuid, (x->>'guess')::smallint, (x->>'actual_at_submit')::numeric
  from jsonb_array_elements(coalesce(p->'meta_guesses', '[]'::jsonb)) x;

  return jsonb_build_object('ok', true, 'submission_id', v_sub, 'flags', to_jsonb(v_flags), 'trust', v_voter.trust, 'country', v_country);
end $$;

-- Batch insert for scripts/seed-synthetic.ts: {rows: [<submit_vote payload>...]}
create or replace function seed_submissions(p jsonb) returns jsonb
language plpgsql as $$
declare
  v_row jsonb; res jsonb; inserted int := 0; duplicates int := 0;
begin
  for v_row in select x from jsonb_array_elements(coalesce(p->'rows', '[]'::jsonb)) x loop
    res := submit_vote(v_row || '{"skip_rate": true, "synthetic": true}'::jsonb);
    if (res->>'ok')::boolean then inserted := inserted + 1; else duplicates := duplicates + 1; end if;
  end loop;
  return jsonb_build_object('inserted', inserted, 'duplicates', duplicates);
end $$;

-- {submission_id}
create or replace function get_submission(p jsonb) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', s.id,
    'round', jsonb_build_object('id', r.id, 'slug', r.slug, 'kind', r.kind, 'status', r.status, 'i18n', r.i18n,
                                'survival_weights', r.survival_weights, 'unlock_threshold', r.unlock_threshold, 'ends_at', r.ends_at),
    'country_code', s.country_code, 'trust', s.trust, 'locale', s.locale,
    'axis_scores', s.axis_scores, 'realism', s.realism, 'consistency', s.consistency, 'compromise', s.compromise,
    'survival', s.survival, 'archetype', s.archetype, 'contradictions_hit', to_jsonb(s.contradictions_hit),
    'submitted_at', s.submitted_at,
    'answers', coalesce((
      select jsonb_agg(jsonb_build_object('question_id', a.question_id, 'question_key', q.key, 'option_id', a.option_id, 'option_key', o.key) order by q.position)
      from answers a join questions q on q.id = a.question_id join options o on o.id = a.option_id
      where a.submission_id = s.id), '[]'::jsonb),
    'meta_guesses', coalesce((
      select jsonb_agg(jsonb_build_object('question_id', m.question_id, 'question_key', q.key, 'guess', m.guess,
        'actual_at_submit', m.actual_at_submit, 'actual_final', m.actual_final,
        'actual_now', option_share(q.meta_target_option_id, true)) order by q.position)
      from meta_guesses m join questions q on q.id = m.question_id where m.submission_id = s.id), '[]'::jsonb),
    'planet', (select jsonb_build_object('votes_total', ps.votes_total, 'survival_raw', ps.survival_raw,
        'survival_weighted', ps.survival_weighted, 'contradiction_weighted', ps.contradiction_weighted,
        'archetype_shares', ps.archetype_shares, 'axis_means', ps.axis_means)
        from planet_stats ps where ps.round_id = s.round_id),
    'country', (select jsonb_build_object('code', cs.country_code, 'name_en', cp.name_en, 'submissions_count', cs.submissions_count,
        'unlocked', cs.unlocked, 'survival_index', cs.survival_index, 'rank', cs.rank, 'titles', to_jsonb(cs.titles),
        'top_archetype', cs.top_archetype, 'axis_means', cs.axis_means)
        from country_stats cs join country_population cp on cp.country_code = cs.country_code
        where cs.round_id = s.round_id and cs.country_code = s.country_code)
  )
  from submissions s join rounds r on r.id = s.round_id
  where s.id = (p->>'submission_id')::uuid;
$$;

-- ===========================================================================
-- Results (ARCHITECTURE §10). Live computation over unflagged submissions,
-- optionally filtered ("kdyby vládli jen…"). API layer caches 15–60 s.
-- ===========================================================================
create or replace function planet_results(p jsonb) returns jsonb
language sql stable as $$
  with f as (
    select (p->>'round_id')::uuid as round_id,
           (p#>>'{filter,trust}')::trust_level as trust,
           (p#>>'{filter,age_band}')::age_band as age_band,
           (p#>>'{filter,gender}')::gender_band as gender,
           (p#>>'{filter,settlement}')::settlement_band as settlement,
           nullif(upper(p#>>'{filter,country}'), '')::char(2) as country
  ),
  base as (
    select s.* from submissions s, f
    where s.round_id = f.round_id and not s.flagged
      and (f.trust is null or s.trust = f.trust)
      and (f.age_band is null or s.age_band = f.age_band)
      and (f.gender is null or s.gender = f.gender)
      and (f.settlement is null or s.settlement = f.settlement)
      and (f.country is null or s.country_code = f.country)
  ),
  tot as (
    select count(*) as n, coalesce(sum(weight), 0) as w, count(*) filter (where trust = 'verified') as nv,
      avg(survival) as surv_raw, sum(survival * weight) / nullif(sum(weight), 0) as surv_w,
      avg(case when cardinality(contradictions_hit) > 0 then 1.0 else 0.0 end) as contra_raw,
      sum(case when cardinality(contradictions_hit) > 0 then weight else 0 end) / nullif(sum(weight), 0) as contra_w,
      avg(realism) as real_raw,
      sum(realism * weight) filter (where realism is not null) / nullif(sum(weight) filter (where realism is not null), 0) as real_w,
      avg(compromise) as comp_raw, sum(compromise * weight) / nullif(sum(weight), 0) as comp_w,
      avg(consistency) as cons_raw, sum(consistency * weight) / nullif(sum(weight), 0) as cons_w,
      avg((axis_scores->>'peace_force')::numeric) as pf_raw,
      sum((axis_scores->>'peace_force')::numeric * weight) / nullif(sum(weight), 0) as pf_w,
      avg((axis_scores->>'trust_paranoia')::numeric) as tp_raw,
      sum((axis_scores->>'trust_paranoia')::numeric * weight) / nullif(sum(weight), 0) as tp_w,
      avg((axis_scores->>'us_them')::numeric) as ut_raw,
      sum((axis_scores->>'us_them')::numeric * weight) / nullif(sum(weight), 0) as ut_w
    from base
  ),
  arch as (select archetype, count(*) as n, sum(weight) as w from base where archetype is not null group by archetype),
  opt as (
    select a.question_id, a.option_id, count(*) as n, sum(b.weight) as w
    from answers a join base b on b.id = a.submission_id group by a.question_id, a.option_id
  ),
  qtot as (select question_id, sum(n) as n, sum(w) as w from opt group by question_id),
  pairs as (
    select c.key, c.i18n, c.id,
      (select count(*) from base b where c.key = any (b.contradictions_hit)) as n,
      (select coalesce(sum(b.weight), 0) from base b where c.key = any (b.contradictions_hit)) as w
    from contradiction_pairs c, f where c.round_id = f.round_id and c.active
  )
  select jsonb_build_object(
    'round_id', (select round_id from f),
    'filtered', (select trust is not null or age_band is not null or gender is not null or settlement is not null or country is not null from f),
    'filter', coalesce(p->'filter', '{}'::jsonb),
    'computed_at', now(),
    'totals', (select jsonb_build_object('raw', n, 'weighted', round(w, 2), 'verified', nv) from tot),
    'survival', (select jsonb_build_object('raw', round(100 * surv_raw, 2), 'weighted', round(100 * surv_w, 2)) from tot),
    'contradiction', (select jsonb_build_object('raw', round(100 * contra_raw, 2), 'weighted', round(100 * contra_w, 2)) from tot),
    'realism', (select jsonb_build_object('raw', round(real_raw, 4), 'weighted', round(real_w, 4)) from tot),
    'compromise', (select jsonb_build_object('raw', round(comp_raw, 4), 'weighted', round(comp_w, 4)) from tot),
    'consistency', (select jsonb_build_object('raw', round(cons_raw, 4), 'weighted', round(cons_w, 4)) from tot),
    'axis_means', (select jsonb_build_object(
        'raw', jsonb_build_object('peace_force', round(pf_raw, 4), 'trust_paranoia', round(tp_raw, 4), 'us_them', round(ut_raw, 4)),
        'weighted', jsonb_build_object('peace_force', round(pf_w, 4), 'trust_paranoia', round(tp_w, 4), 'us_them', round(ut_w, 4))) from tot),
    'archetypes', coalesce((select jsonb_object_agg(a.archetype, jsonb_build_object(
        'raw', a.n, 'weighted', round(a.w, 2),
        'share_raw', round(100.0 * a.n / nullif(t.n, 0), 2), 'share_weighted', round(100.0 * a.w / nullif(t.w, 0), 2)))
        from arch a, tot t), '{}'::jsonb),
    'questions', coalesce((select jsonb_agg(jsonb_build_object(
        'question_id', q.id, 'key', q.key, 'position', q.position, 'i18n', q.i18n, 'anchor', q.anchor,
        'total_raw', coalesce(qt.n, 0), 'total_weighted', round(coalesce(qt.w, 0), 2),
        'options', (select jsonb_agg(jsonb_build_object(
            'option_id', o.id, 'key', o.key, 'icon', o.icon, 'i18n', o.i18n, 'compromise', o.compromise,
            'raw', coalesce(op.n, 0), 'weighted', round(coalesce(op.w, 0), 2),
            'share_raw', case when coalesce(qt.n, 0) > 0 then round(100.0 * coalesce(op.n, 0) / qt.n, 2) else null end,
            'share_weighted', case when coalesce(qt.w, 0) > 0 then round(100.0 * coalesce(op.w, 0) / qt.w, 2) else null end
          ) order by o.position)
          from options o left join opt op on op.option_id = o.id where o.question_id = q.id and o.active)
      ) order by q.position)
      from questions q left join qtot qt on qt.question_id = q.id, f
      where q.round_id = f.round_id and q.active and q.type = 'choice'), '[]'::jsonb),
    'pairs', coalesce((select jsonb_agg(jsonb_build_object(
        'key', pr.key, 'i18n', pr.i18n, 'raw', pr.n, 'weighted', round(pr.w, 2),
        'share_raw', round(100.0 * pr.n / nullif(t.n, 0), 2), 'share_weighted', round(100.0 * pr.w / nullif(t.w, 0), 2)
      ) order by pr.w desc, pr.key) from pairs pr, tot t), '[]'::jsonb)
  );
$$;

-- {round_id, minutes?: 60} → per-minute counts for the EKG
create or replace function pulse_series(p jsonb) returns jsonb
language sql stable as $$
  with f as (select (p->>'round_id')::uuid as round_id, least(greatest(coalesce((p->>'minutes')::int, 60), 5), 1440) as minutes),
  mins as (
    select generate_series(date_trunc('minute', now()) - ((select minutes from f) - 1) * interval '1 minute',
                           date_trunc('minute', now()), interval '1 minute') as minute
  )
  select jsonb_build_object(
    'round_id', (select round_id from f),
    'points', coalesce((select jsonb_agg(jsonb_build_object('minute', m.minute, 'cnt', coalesce(pb.cnt, 0)) order by m.minute)
              from mins m left join pulse_buckets pb on pb.minute = m.minute and pb.round_id = (select round_id from f)), '[]'::jsonb),
    'total', coalesce((select sum(cnt) from pulse_buckets pb, f where pb.round_id = f.round_id), 0)
  );
$$;

-- Cheap refresh of counters + pulse; at most every 10 s unless {force: true}. Returns the planet_stats row.
create or replace function refresh_planet_pulse(p jsonb) returns jsonb
language plpgsql as $$
declare
  v_round uuid := (p->>'round_id')::uuid;
  ps planet_stats;
  v_cur int; v_prev int; v_sec numeric;
begin
  select * into ps from planet_stats where round_id = v_round;
  if ps.round_id is null or ps.pulse_refreshed_at < now() - interval '10 seconds' or coalesce((p->>'force')::boolean, false) then
    select coalesce(sum(cnt) filter (where minute = date_trunc('minute', now())), 0),
           coalesce(sum(cnt) filter (where minute = date_trunc('minute', now()) - interval '1 minute'), 0)
      into v_cur, v_prev
      from pulse_buckets where round_id = v_round and minute >= date_trunc('minute', now()) - interval '1 minute';
    v_sec := extract(second from now());
    insert into planet_stats (round_id, votes_total, votes_verified, votes_flagged, pulse_per_min, pulse_refreshed_at)
    select v_round,
           count(*) filter (where not flagged),
           count(*) filter (where not flagged and trust = 'verified'),
           count(*) filter (where flagged),
           round(v_cur + v_prev * (60 - v_sec) / 60)::int,
           now()
      from submissions where round_id = v_round
    on conflict (round_id) do update
      set votes_total = excluded.votes_total, votes_verified = excluded.votes_verified,
          votes_flagged = excluded.votes_flagged, pulse_per_min = excluded.pulse_per_min, pulse_refreshed_at = now()
    returning * into ps;
  end if;
  return to_jsonb(ps);
end $$;

-- ===========================================================================
-- Recompute (cron, ARCHITECTURE §9–§10)
-- ===========================================================================
-- {round_id} → cells for computeWeights()
create or replace function submission_cells(p jsonb) returns jsonb
language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('country', t.country_code, 'age_band', t.age_band, 'gender', t.gender, 'n', t.n)), '[]'::jsonb)
  from (select country_code, age_band, gender, count(*) as n
        from submissions where round_id = (p->>'round_id')::uuid and not flagged
        group by 1, 2, 3) t;
$$;

-- {round_id, cells: [{country, age_band, gender, weight}]} → writes submissions.weight, rebuilds agg
create or replace function apply_cell_weights(p jsonb) returns jsonb
language plpgsql as $$
declare v_round uuid := (p->>'round_id')::uuid; n int;
begin
  update submissions s set weight = round(c.weight, 4)
  from jsonb_to_recordset(coalesce(p->'cells', '[]'::jsonb)) as c(country text, age_band age_band, gender gender_band, weight numeric)
  where s.round_id = v_round and not s.flagged
    and s.country_code is not distinct from c.country::char(2)
    and s.age_band is not distinct from c.age_band
    and s.gender is not distinct from c.gender;
  get diagnostics n = row_count;
  perform rebuild_agg_for_round(v_round);
  return jsonb_build_object('updated', n);
end $$;

-- {round_id} → per-country aggregates (input for titles/ranks in TS, then upsert_country_stats)
create or replace function country_aggregates(p jsonb) returns jsonb
language sql stable as $$
  with base as (
    select * from submissions where round_id = (p->>'round_id')::uuid and not flagged and country_code is not null
  ),
  agg as (
    select country_code, count(*) as n, count(*) filter (where trust = 'verified') as nv, sum(weight) as w,
      avg(survival) as surv_raw, sum(survival * weight) / nullif(sum(weight), 0) as surv_w,
      avg(case when cardinality(contradictions_hit) > 0 then 1.0 else 0.0 end) as contra_raw,
      sum(case when cardinality(contradictions_hit) > 0 then weight else 0 end) / nullif(sum(weight), 0) as contra_w,
      avg(realism) as real_raw,
      sum(realism * weight) filter (where realism is not null) / nullif(sum(weight) filter (where realism is not null), 0) as real_w,
      avg(compromise) as comp_raw, sum(compromise * weight) / nullif(sum(weight), 0) as comp_w,
      avg((axis_scores->>'peace_force')::numeric) as pf_raw, sum((axis_scores->>'peace_force')::numeric * weight) / nullif(sum(weight), 0) as pf_w,
      avg((axis_scores->>'trust_paranoia')::numeric) as tp_raw, sum((axis_scores->>'trust_paranoia')::numeric * weight) / nullif(sum(weight), 0) as tp_w,
      avg((axis_scores->>'us_them')::numeric) as ut_raw, sum((axis_scores->>'us_them')::numeric * weight) / nullif(sum(weight), 0) as ut_w
    from base group by country_code
  ),
  arch as (select country_code, archetype, count(*) as n, sum(weight) as w from base where archetype is not null group by 1, 2),
  pairs as (select b.country_code, k as key, count(*) as n, sum(b.weight) as w from base b, unnest(b.contradictions_hit) k group by 1, 2)
  select coalesce(jsonb_agg(jsonb_build_object(
    'country_code', a.country_code, 'n', a.n, 'verified_n', a.nv, 'weight_sum', round(a.w, 4),
    'survival', jsonb_build_object('raw', round(100 * a.surv_raw, 2), 'weighted', round(100 * a.surv_w, 2)),
    'contradiction', jsonb_build_object('raw', round(100 * a.contra_raw, 2), 'weighted', round(100 * a.contra_w, 2)),
    'realism', jsonb_build_object('raw', round(a.real_raw, 4), 'weighted', round(a.real_w, 4)),
    'compromise', jsonb_build_object('raw', round(a.comp_raw, 4), 'weighted', round(a.comp_w, 4)),
    'axis_means', jsonb_build_object(
      'raw', jsonb_build_object('peace_force', round(a.pf_raw, 4), 'trust_paranoia', round(a.tp_raw, 4), 'us_them', round(a.ut_raw, 4)),
      'weighted', jsonb_build_object('peace_force', round(a.pf_w, 4), 'trust_paranoia', round(a.tp_w, 4), 'us_them', round(a.ut_w, 4))),
    'archetypes', coalesce((select jsonb_object_agg(x.archetype, jsonb_build_object('raw', x.n, 'weighted', round(x.w, 2),
        'share_raw', round(100.0 * x.n / a.n, 2), 'share_weighted', round(100.0 * x.w / nullif(a.w, 0), 2)))
        from arch x where x.country_code = a.country_code), '{}'::jsonb),
    'pairs', coalesce((select jsonb_object_agg(x.key, jsonb_build_object('raw', x.n, 'weighted', round(x.w, 2),
        'share_raw', round(100.0 * x.n / a.n, 2), 'share_weighted', round(100.0 * x.w / nullif(a.w, 0), 2)))
        from pairs x where x.country_code = a.country_code), '{}'::jsonb),
    'top_archetype', (select x.archetype from arch x where x.country_code = a.country_code order by x.w desc, x.n desc, x.archetype limit 1)
  ) order by a.n desc), '[]'::jsonb)
  from agg a;
$$;

-- {round_id, rows: [...]} → upsert country_stats
create or replace function upsert_country_stats(p jsonb) returns jsonb
language plpgsql as $$
declare v_round uuid := (p->>'round_id')::uuid; n int;
begin
  insert into country_stats (round_id, country_code, submissions_count, verified_count, unlocked, insufficient_sample,
    survival_index, contradiction_index, realism_mean, compromise_mean, axis_means, archetype_shares, contradiction_shares,
    top_archetype, titles, rank, computed_at)
  select v_round, r.country_code, r.submissions_count, r.verified_count, r.unlocked, r.insufficient_sample,
    r.survival_index, r.contradiction_index, r.realism_mean, r.compromise_mean,
    coalesce(r.axis_means, '{}'::jsonb), coalesce(r.archetype_shares, '{}'::jsonb), coalesce(r.contradiction_shares, '{}'::jsonb),
    r.top_archetype, coalesce(r.titles, '{}'), r.rank, now()
  from jsonb_to_recordset(coalesce(p->'rows', '[]'::jsonb)) as r(
    country_code char(2), submissions_count int, verified_count int, unlocked boolean, insufficient_sample boolean,
    survival_index numeric, contradiction_index numeric, realism_mean numeric, compromise_mean numeric,
    axis_means jsonb, archetype_shares jsonb, contradiction_shares jsonb, top_archetype text, titles text[], rank int)
  on conflict (round_id, country_code) do update
    set submissions_count = excluded.submissions_count, verified_count = excluded.verified_count,
        unlocked = excluded.unlocked, insufficient_sample = excluded.insufficient_sample,
        survival_index = excluded.survival_index, contradiction_index = excluded.contradiction_index,
        realism_mean = excluded.realism_mean, compromise_mean = excluded.compromise_mean,
        axis_means = excluded.axis_means, archetype_shares = excluded.archetype_shares,
        contradiction_shares = excluded.contradiction_shares, top_archetype = excluded.top_archetype,
        titles = excluded.titles, rank = excluded.rank, computed_at = now();
  get diagnostics n = row_count;
  return jsonb_build_object('count', n);
end $$;

-- {round_id} → recompute planet_stats from unflagged submissions + snapshot
create or replace function recompute_planet_stats(p jsonb) returns jsonb
language plpgsql as $$
declare
  v_round uuid := (p->>'round_id')::uuid;
  r jsonb;
  ps planet_stats;
begin
  r := planet_results(jsonb_build_object('round_id', v_round));
  insert into planet_stats (round_id, votes_total, votes_verified, votes_flagged, countries_unlocked,
    survival_raw, survival_weighted, contradiction_raw, contradiction_weighted,
    realism_mean, compromise_mean, consistency_mean, axis_means, archetype_shares, contradiction_shares,
    pulse_per_min, pulse_refreshed_at, computed_at)
  values (v_round,
    (r#>>'{totals,raw}')::bigint, (r#>>'{totals,verified}')::bigint,
    (select count(*) from submissions where round_id = v_round and flagged),
    (select count(*) from country_stats where round_id = v_round and unlocked),
    (r#>>'{survival,raw}')::numeric, (r#>>'{survival,weighted}')::numeric,
    (r#>>'{contradiction,raw}')::numeric, (r#>>'{contradiction,weighted}')::numeric,
    (r#>>'{realism,weighted}')::numeric, (r#>>'{compromise,weighted}')::numeric, (r#>>'{consistency,weighted}')::numeric,
    coalesce(r->'axis_means', '{}'::jsonb), coalesce(r->'archetypes', '{}'::jsonb),
    coalesce((select jsonb_object_agg(x->>'key', x - 'i18n' - 'key') from jsonb_array_elements(r->'pairs') x), '{}'::jsonb),
    coalesce((select pulse_per_min from planet_stats where round_id = v_round), 0), now(), now())
  on conflict (round_id) do update
    set votes_total = excluded.votes_total, votes_verified = excluded.votes_verified, votes_flagged = excluded.votes_flagged,
        countries_unlocked = excluded.countries_unlocked,
        survival_raw = excluded.survival_raw, survival_weighted = excluded.survival_weighted,
        contradiction_raw = excluded.contradiction_raw, contradiction_weighted = excluded.contradiction_weighted,
        realism_mean = excluded.realism_mean, compromise_mean = excluded.compromise_mean, consistency_mean = excluded.consistency_mean,
        axis_means = excluded.axis_means, archetype_shares = excluded.archetype_shares, contradiction_shares = excluded.contradiction_shares,
        computed_at = now()
  returning * into ps;

  insert into planet_snapshots (round_id, at, votes_total, survival_raw, survival_weighted, contradiction_weighted, pulse_per_min)
  values (ps.round_id, now(), ps.votes_total, ps.survival_raw, ps.survival_weighted, ps.contradiction_weighted, ps.pulse_per_min);

  return to_jsonb(ps);
end $$;

-- {round_id} → sets meta_guesses.actual_final (after the round closes)
create or replace function finalize_meta_actuals(p jsonb) returns jsonb
language plpgsql as $$
declare n int;
begin
  with shares as (
    select q.id as qid, option_share(q.meta_target_option_id, true) as s
    from questions q where q.round_id = (p->>'round_id')::uuid and q.type = 'meta' and q.meta_target_option_id is not null
  )
  update meta_guesses m set actual_final = shares.s from shares where m.question_id = shares.qid;
  get diagnostics n = row_count;
  return jsonb_build_object('updated', n);
end $$;

-- {round_id, limit?: 288} → planet snapshot series (trend)
create or replace function planet_snapshot_series(p jsonb) returns jsonb
language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('at', x.at, 'votes_total', x.votes_total, 'survival_raw', x.survival_raw,
    'survival_weighted', x.survival_weighted, 'contradiction_weighted', x.contradiction_weighted, 'pulse_per_min', x.pulse_per_min) order by x.at), '[]'::jsonb)
  from (select * from planet_snapshots where round_id = (p->>'round_id')::uuid order by at desc limit coalesce((p->>'limit')::int, 288)) x;
$$;

-- {question_key} → the same anchor question across rounds (long-term trend)
create or replace function question_trend(p jsonb) returns jsonb
language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'round_id', r.id, 'slug', r.slug, 'kind', r.kind, 'starts_at', r.starts_at,
    'total_raw', coalesce((select sum(cnt) from agg_option_country a where a.question_id = q.id), 0),
    'options', coalesce((select jsonb_agg(jsonb_build_object('key', o.key, 'raw', coalesce(t.n, 0), 'weighted', round(coalesce(t.w, 0), 2),
        'share_weighted', case when coalesce(tt.w, 0) > 0 then round(100.0 * coalesce(t.w, 0) / tt.w, 2) else null end) order by o.position)
      from options o
      left join (select option_id, sum(cnt) n, sum(sum_weight) w from agg_option_country where question_id = q.id group by option_id) t on t.option_id = o.id,
      (select sum(sum_weight) w from agg_option_country where question_id = q.id) tt
      where o.question_id = q.id and o.active), '[]'::jsonb)
  ) order by r.starts_at), '[]'::jsonb)
  from questions q join rounds r on r.id = q.round_id
  where q.key = p->>'question_key' and q.active and r.status <> 'draft';
$$;

-- ===========================================================================
-- Countries
-- ===========================================================================
-- {round_id} → leaderboard incl. locked countries with progress
create or replace function country_board(p jsonb) returns jsonb
language sql stable as $$
  with f as (select (p->>'round_id')::uuid as round_id)
  select jsonb_build_object(
    'round_id', (select round_id from f),
    'unlock_threshold', (select unlock_threshold from rounds r, f where r.id = f.round_id),
    'computed_at', (select max(computed_at) from country_stats cs, f where cs.round_id = f.round_id),
    'countries', coalesce((select jsonb_agg(jsonb_build_object(
        'country_code', cs.country_code, 'name_en', cp.name_en, 'region', cp.region, 'population', cp.population,
        'submissions_count', cs.submissions_count, 'verified_count', cs.verified_count,
        'unlocked', cs.unlocked, 'insufficient_sample', cs.insufficient_sample,
        'survival_index', cs.survival_index, 'contradiction_index', cs.contradiction_index,
        'realism_mean', cs.realism_mean, 'compromise_mean', cs.compromise_mean,
        'axis_means', cs.axis_means, 'archetype_shares', cs.archetype_shares, 'top_archetype', cs.top_archetype,
        'titles', to_jsonb(cs.titles), 'rank', cs.rank
      ) order by cs.rank nulls last, cs.submissions_count desc, cs.country_code)
      from country_stats cs join country_population cp on cp.country_code = cs.country_code, f
      where cs.round_id = f.round_id), '[]'::jsonb)
  );
$$;

-- {round_id, country_code} → country page payload
create or replace function country_results(p jsonb) returns jsonb
language sql stable as $$
  with f as (select (p->>'round_id')::uuid as round_id, upper(p->>'country_code')::char(2) as code),
  cs as (select c.* from country_stats c, f where c.round_id = f.round_id and c.country_code = f.code),
  cp as (select c.* from country_population c, f where c.country_code = f.code),
  planet_opt as (select question_id, option_id, sum(cnt) as n, sum(sum_weight) as w from agg_option_country a, f where a.round_id = f.round_id group by 1, 2),
  country_opt as (select question_id, option_id, sum(cnt) as n, sum(sum_weight) as w from agg_option_country a, f where a.round_id = f.round_id and a.country_code = f.code group by 1, 2),
  pq as (select question_id, sum(n) as n, sum(w) as w from planet_opt group by 1),
  cq as (select question_id, sum(n) as n, sum(w) as w from country_opt group by 1),
  live as (select count(*) as n from submissions s, f where s.round_id = f.round_id and s.country_code = f.code and not s.flagged)
  select jsonb_build_object(
    'round_id', (select round_id from f),
    'country_code', (select code from f),
    'name_en', (select name_en from cp), 'population', (select population from cp), 'region', (select region from cp),
    'known', exists (select 1 from cp),
    'stats', (select to_jsonb(cs) - 'round_id' from cs),
    'live_count', (select n from live),
    'unlock_threshold', (select unlock_threshold from rounds r, f where r.id = f.round_id),
    'questions', coalesce((select jsonb_agg(jsonb_build_object(
        'question_id', q.id, 'key', q.key, 'position', q.position, 'i18n', q.i18n, 'anchor', q.anchor,
        'total_raw', coalesce(cq.n, 0),
        'options', (select jsonb_agg(jsonb_build_object(
            'option_id', o.id, 'key', o.key, 'icon', o.icon, 'i18n', o.i18n,
            'raw', coalesce(co.n, 0),
            'share_raw', case when coalesce(cq.n, 0) > 0 then round(100.0 * coalesce(co.n, 0) / cq.n, 2) else null end,
            'share_weighted', case when coalesce(cq.w, 0) > 0 then round(100.0 * coalesce(co.w, 0) / cq.w, 2) else null end,
            'planet_share_raw', case when coalesce(pq.n, 0) > 0 then round(100.0 * coalesce(po.n, 0) / pq.n, 2) else null end,
            'planet_share_weighted', case when coalesce(pq.w, 0) > 0 then round(100.0 * coalesce(po.w, 0) / pq.w, 2) else null end
          ) order by o.position)
          from options o left join country_opt co on co.option_id = o.id left join planet_opt po on po.option_id = o.id
          where o.question_id = q.id and o.active)
      ) order by q.position)
      from questions q left join cq on cq.question_id = q.id left join pq on pq.question_id = q.id, f
      where q.round_id = f.round_id and q.active and q.type = 'choice'), '[]'::jsonb),
    'rivals', coalesce((select jsonb_agg(jsonb_build_object('country_code', x.country_code, 'name_en', x.name_en,
        'survival_index', x.survival_index, 'rank', x.rank) order by x.rank)
        from (select c2.country_code, cp2.name_en, c2.survival_index, c2.rank
              from country_stats c2 join country_population cp2 on cp2.country_code = c2.country_code, cs
              where c2.round_id = cs.round_id and c2.unlocked and c2.country_code <> cs.country_code
                and c2.rank is not null and cs.rank is not null and abs(c2.rank - cs.rank) <= 1) x), '[]'::jsonb)
  );
$$;

-- ===========================================================================
-- Narrator (ARCHITECTURE §12) — never published without approved = true
-- ===========================================================================
create or replace function narrator_context(p jsonb) returns jsonb
language sql stable as $$
  with f as (select (p->>'round_id')::uuid as round_id)
  select jsonb_build_object(
    'round', (select jsonb_build_object('id', r.id, 'slug', r.slug, 'kind', r.kind, 'i18n', r.i18n, 'starts_at', r.starts_at, 'ends_at', r.ends_at) from rounds r, f where r.id = f.round_id),
    'planet', (select to_jsonb(ps) from planet_stats ps, f where ps.round_id = f.round_id),
    'top_countries', coalesce((select jsonb_agg(x order by (x->>'rank')::int) from (
        select jsonb_build_object('country_code', cs.country_code, 'name_en', cp.name_en, 'survival_index', cs.survival_index,
          'contradiction_index', cs.contradiction_index, 'top_archetype', cs.top_archetype, 'titles', to_jsonb(cs.titles),
          'rank', cs.rank, 'submissions_count', cs.submissions_count) as x
        from country_stats cs join country_population cp on cp.country_code = cs.country_code, f
        where cs.round_id = f.round_id and cs.unlocked and cs.rank is not null order by cs.rank limit 5) t), '[]'::jsonb),
    'bottom_countries', coalesce((select jsonb_agg(x order by (x->>'rank')::int desc) from (
        select jsonb_build_object('country_code', cs.country_code, 'name_en', cp.name_en, 'survival_index', cs.survival_index,
          'contradiction_index', cs.contradiction_index, 'top_archetype', cs.top_archetype, 'rank', cs.rank) as x
        from country_stats cs join country_population cp on cp.country_code = cs.country_code, f
        where cs.round_id = f.round_id and cs.unlocked and cs.rank is not null order by cs.rank desc limit 3) t), '[]'::jsonb),
    'movement_24h', (select jsonb_build_object('survival_weighted_now', a.survival_weighted, 'survival_weighted_24h_ago', b.survival_weighted,
        'votes_now', a.votes_total, 'votes_24h_ago', b.votes_total)
        from (select * from planet_snapshots s, f where s.round_id = f.round_id order by at desc limit 1) a
        left join (select * from planet_snapshots s, f where s.round_id = f.round_id and at <= now() - interval '24 hours' order by at desc limit 1) b on true),
    'strongest_contradiction', (select jsonb_build_object('key', c.key, 'i18n', c.i18n,
        'share_weighted', (ps.contradiction_shares->c.key->>'share_weighted')::numeric)
        from contradiction_pairs c, planet_stats ps, f
        where c.round_id = f.round_id and ps.round_id = f.round_id and c.active
        order by (ps.contradiction_shares->c.key->>'share_weighted')::numeric desc nulls last limit 1),
    'questions', coalesce((select jsonb_agg(jsonb_build_object('key', q.key, 'i18n', q.i18n,
        'top_option', (select jsonb_build_object('key', o.key, 'i18n', o.i18n, 'share_weighted',
            case when (select sum(sum_weight) from agg_option_country where question_id = q.id) > 0
                 then round(100.0 * (select sum(sum_weight) from agg_option_country where option_id = o.id) / (select sum(sum_weight) from agg_option_country where question_id = q.id), 2) end)
          from options o where o.question_id = q.id and o.active
          order by (select coalesce(sum(sum_weight), 0) from agg_option_country where option_id = o.id) desc limit 1)
      ) order by q.position) from questions q, f where q.round_id = f.round_id and q.active and q.type = 'choice'), '[]'::jsonb)
  );
$$;

-- {round_id, locale, body, model, context}
create or replace function insert_narrator_post(p jsonb) returns jsonb
language plpgsql as $$
declare v_id uuid;
begin
  insert into narrator_posts (round_id, locale, body, model, context, approved)
  values ((p->>'round_id')::uuid, p->>'locale', p->>'body', p->>'model', coalesce(p->'context', '{}'::jsonb), false)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'approved', false);
end $$;

-- {id, approved}
create or replace function set_narrator_approval(p jsonb) returns jsonb
language plpgsql as $$
declare r narrator_posts;
begin
  update narrator_posts
     set approved = (p->>'approved')::boolean,
         published_at = case when (p->>'approved')::boolean then coalesce(published_at, now()) else null end
   where id = (p->>'id')::uuid
  returning * into r;
  if r.id is null then return null; end if;
  return to_jsonb(r);
end $$;

-- {locale?, only_approved?: true, limit?: 5}
create or replace function narrator_posts(p jsonb) returns jsonb
language sql stable as $$
  select coalesce(jsonb_agg(case when coalesce((p->>'only_approved')::boolean, true) then to_jsonb(x) - 'context' else to_jsonb(x) end order by x.generated_at desc), '[]'::jsonb)
  from (
    select n.id, n.round_id, n.locale, n.body, n.model, n.approved, n.generated_at, n.published_at, n.context
    from narrator_posts n
    where (p->>'locale' is null or n.locale = p->>'locale')
      and (not coalesce((p->>'only_approved')::boolean, true) or n.approved)
    order by n.generated_at desc
    limit least(coalesce((p->>'limit')::int, 5), 50)
  ) x;
$$;

-- ===========================================================================
-- Export (aggregates only; countries under the sample threshold fold into '--')
-- ===========================================================================
create or replace function export_round(p jsonb) returns jsonb
language sql stable as $$
  with f as (select (p->>'round_id')::uuid as round_id, coalesce((p->>'min_country')::int, 30) as min_country),
  small as (select country_code from country_stats cs, f where cs.round_id = f.round_id and cs.submissions_count < f.min_country)
  select jsonb_build_object(
    'round', (select jsonb_build_object('id', r.id, 'slug', r.slug, 'kind', r.kind, 'status', r.status, 'starts_at', r.starts_at,
        'ends_at', r.ends_at, 'survival_weights', r.survival_weights, 'unlock_threshold', r.unlock_threshold) from rounds r, f where r.id = f.round_id),
    'exported_at', now(),
    'planet', (select to_jsonb(ps) from planet_stats ps, f where ps.round_id = f.round_id),
    'countries', coalesce((select jsonb_agg((to_jsonb(cs) - 'round_id') order by cs.rank nulls last, cs.country_code)
        from country_stats cs, f where cs.round_id = f.round_id and cs.submissions_count >= f.min_country), '[]'::jsonb),
    'options_by_country', coalesce((select jsonb_agg(jsonb_build_object(
        'question_key', x.qkey, 'option_key', x.okey, 'country_code', x.cc, 'trust', x.trust, 'raw', x.raw, 'weighted', x.weighted)
        order by x.qpos, x.opos, x.cc, x.trust)
      from (
        select q.key as qkey, q.position as qpos, o.key as okey, o.position as opos,
               case when a.country_code in (select country_code from small) or not exists (select 1 from country_stats cs2, f where cs2.round_id = f.round_id and cs2.country_code = a.country_code) then '--' else a.country_code end as cc,
               a.trust, sum(a.cnt) as raw, round(sum(a.sum_weight), 2) as weighted
        from agg_option_country a join questions q on q.id = a.question_id join options o on o.id = a.option_id, f
        where a.round_id = f.round_id
        group by 1, 2, 3, 4, 5, 6) x), '[]'::jsonb)
  );
$$;

-- ===========================================================================
-- Verified layer (ARCHITECTURE §7)
-- ===========================================================================
-- {anon_id, provider, subject_hash, session_ttl_seconds?} → links voter ↔ auth user, upgrades submissions
create or replace function link_auth_user(p jsonb) returns jsonb
language plpgsql as $$
declare
  v_anon uuid := (p->>'anon_id')::uuid;
  v_auth uuid;
  v_voter voters;
  v_other uuid;
  s record;
  upgraded int := 0;
  conflicts int := 0;
  touched uuid[] := '{}';
  rid uuid;
  v_session uuid;
begin
  insert into auth_users (provider, subject_hash) values (p->>'provider', p->>'subject_hash')
  on conflict (provider, subject_hash) do update set provider = excluded.provider
  returning id into v_auth;

  insert into voters (anon_id) values (v_anon)
  on conflict (anon_id) do update set last_seen_at = now()
  returning * into v_voter;

  -- the identity may already be bound to another cookie (cleared cookies / new device): move it here
  select id into v_other from voters where auth_user_id = v_auth and id <> v_voter.id;
  if v_other is not null then
    update voters set auth_user_id = null where id = v_other;
  end if;
  update voters set auth_user_id = v_auth, trust = 'verified' where id = v_voter.id;

  -- upgrade this voter's submissions; on (round, identity) collision keep the earlier vote, flag the later one
  for s in select id, round_id from submissions where voter_id = v_voter.id and auth_user_id is null order by submitted_at loop
    begin
      update submissions set auth_user_id = v_auth, trust = 'verified' where id = s.id;
      upgraded := upgraded + 1;
    exception when unique_violation then
      update submissions set flagged = true, flag_reasons = array_append(flag_reasons, 'duplicate_identity') where id = s.id;
      conflicts := conflicts + 1;
    end;
    if not (s.round_id = any (touched)) then touched := touched || s.round_id; end if;
  end loop;

  -- trust is a dimension of the live aggregates → rebuild touched rounds
  foreach rid in array touched loop
    perform rebuild_agg_for_round(rid);
  end loop;

  insert into auth_sessions (voter_id, auth_user_id, expires_at)
  values (v_voter.id, v_auth, now() + make_interval(secs => coalesce((p->>'session_ttl_seconds')::int, 60 * 60 * 24 * 365)))
  returning id into v_session;

  return jsonb_build_object('auth_user_id', v_auth, 'voter_id', v_voter.id, 'trust', 'verified',
                            'upgraded', upgraded, 'conflicts', conflicts, 'session_id', v_session);
end $$;

-- {session_id} → {valid, voter_id, auth_user_id}
create or replace function auth_session(p jsonb) returns jsonb
language sql stable as $$
  select coalesce((select jsonb_build_object('valid', true, 'voter_id', s.voter_id, 'auth_user_id', s.auth_user_id, 'expires_at', s.expires_at)
                   from auth_sessions s where s.id = (p->>'session_id')::uuid and s.expires_at > now()),
                  jsonb_build_object('valid', false));
$$;

-- ===========================================================================
-- Jobs (leader election for the internal scheduler)
-- ===========================================================================
-- {name, seconds} → {acquired}
create or replace function acquire_job_lease(p jsonb) returns jsonb
language plpgsql as $$
declare got text;
begin
  insert into job_leases (name) values (p->>'name') on conflict (name) do nothing;
  update job_leases
     set locked_until = now() + make_interval(secs => coalesce((p->>'seconds')::int, 540))
   where name = p->>'name' and (locked_until is null or locked_until < now())
  returning name into got;
  return jsonb_build_object('acquired', got is not null);
end $$;

-- {name, status, error?}
create or replace function release_job_lease(p jsonb) returns jsonb
language plpgsql as $$
begin
  update job_leases set locked_until = null, last_run_at = now(), last_status = p->>'status', last_error = p->>'error'
   where name = p->>'name';
  return jsonb_build_object('released', true);
end $$;

-- ===========================================================================
-- Health
-- ===========================================================================
create or replace function db_health(p jsonb) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'ok', true, 'now', now(),
    'rounds', (select count(*) from rounds),
    'live_round', (select slug from rounds where id = (current_round('weekly')).id),
    'submissions', (select count(*) from submissions),
    'countries', (select count(*) from country_population)
  );
$$;
