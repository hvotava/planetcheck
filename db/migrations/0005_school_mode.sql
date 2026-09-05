-- planetcheck — školní mód (ARCHITECTURE §15 phase 5). Append-only; never edit after apply.
--
-- A class code is a pseudo-country: a teacher generates a code, students play with it, and
-- the class gets its own results page. Class votes still count for the planet and for their
-- real country — the students are real people; the class is only an extra lens.
--
-- Privacy: a class is small, so a class page shows nothing at all below CLASS_MIN_N votes,
-- and never shows demographics — only the answer distributions, which is what a lesson needs.

create table class_codes (
  code         char(6) primary key,
  label        text,
  locale       text not null default 'en',
  created_ip_hash text,                    -- sha256(IP_SALT || ip); never a raw IP
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

alter table submissions add column class_code char(6) references class_codes(code);
create index submissions_class_idx on submissions (class_code, round_id) where class_code is not null;

-- Unambiguous alphabet: no I, L, O, 0 or 1, because these get read aloud in a classroom.
create or replace function generate_class_code() returns char(6)
language plpgsql as $$
declare
  v_alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text;
  v_try int := 0;
begin
  loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from class_codes c where c.code = v_code);
    v_try := v_try + 1;
    if v_try > 50 then raise exception 'could not allocate a class code'; end if;
  end loop;
  return v_code;
end $$;

create or replace function create_class_code(p jsonb) returns jsonb
language plpgsql as $$
declare v_code char(6);
begin
  v_code := generate_class_code();
  insert into class_codes (code, label, locale, created_ip_hash)
  values (v_code, nullif(p->>'label', ''), coalesce(p->>'locale', 'en'), p->>'ip_hash');
  return jsonb_build_object('code', v_code, 'label', nullif(p->>'label', ''));
end $$;

create or replace function class_code_info(p jsonb) returns jsonb
language sql stable as $$
  select jsonb_build_object('code', c.code, 'label', c.label, 'created_at', c.created_at, 'active', c.active)
  from class_codes c where c.code = upper(p->>'code');
$$;

/**
 * Aggregate for one class in one round. Raw only, on purpose: post-stratification weights a
 * sample towards a population, and a class is not a sample of anything — reporting a
 * "weighted" class number would be a lie dressed as rigour, so it is explicitly null.
 */
create or replace function class_results(p jsonb) returns jsonb
language plpgsql stable as $$
declare
  v_code char(6) := upper(p->>'code');
  v_round uuid := (p->>'round_id')::uuid;
  v_min int := coalesce((p->>'min_n')::int, 5);
  v_info jsonb;
  v_n int;
  v_out jsonb;
begin
  select jsonb_build_object('code', c.code, 'label', c.label, 'created_at', c.created_at) into v_info
  from class_codes c where c.code = v_code;
  if v_info is null then return null; end if;

  select count(*) into v_n from submissions s
   where s.class_code = v_code and s.round_id = v_round and s.flagged = false;

  if v_n < v_min then
    return jsonb_build_object('class', v_info, 'round_id', v_round, 'n', v_n, 'min_n', v_min, 'enough', false,
                              'survival', null, 'axis_means', '{}'::jsonb, 'archetypes', '{}'::jsonb, 'questions', '[]'::jsonb);
  end if;

  with s as (
    select * from submissions
    where class_code = v_code and round_id = v_round and flagged = false
  ),
  arch_n as (select archetype, count(*)::int as n from s where archetype is not null group by archetype),
  arch_total as (select coalesce(sum(n), 0)::numeric as total from arch_n),
  arch as (
    select jsonb_object_agg(a.archetype, jsonb_build_object(
             'raw', a.n,
             'share_raw', case when t.total > 0 then round(100.0 * a.n / t.total, 2) else null end)) as shares
    from arch_n a cross join arch_total t
  ),
  q as (
    select jsonb_agg(jsonb_build_object(
             'question_id', qq.id, 'key', qq.key, 'position', qq.position, 'i18n', qq.i18n, 'anchor', qq.anchor,
             'total_raw', (select count(*) from answers a2 join s s2 on s2.id = a2.submission_id where a2.question_id = qq.id),
             'options', (
               select jsonb_agg(jsonb_build_object(
                 'option_id', o.id, 'key', o.key, 'icon', o.icon, 'i18n', o.i18n,
                 'raw', coalesce(cnt.n, 0),
                 'share_raw', case when tot.t > 0 then round(100.0 * coalesce(cnt.n, 0) / tot.t, 2) else null end,
                 'planet_share_weighted', option_share(o.id, true),
                 'planet_share_raw', option_share(o.id, false)
               ) order by o.position)
               from options o
               left join lateral (
                 select count(*)::int as n from answers a join s s3 on s3.id = a.submission_id where a.option_id = o.id
               ) cnt on true
               cross join lateral (
                 select count(*)::int as t from answers a4 join s s4 on s4.id = a4.submission_id where a4.question_id = qq.id
               ) tot
               where o.question_id = qq.id and o.active
             )
           ) order by qq.position) as rows
    from questions qq where qq.round_id = v_round and qq.active and qq.type = 'choice'
  )
  select jsonb_build_object(
    'class', v_info, 'round_id', v_round, 'n', v_n, 'min_n', v_min, 'enough', true,
    'survival', jsonb_build_object(
      'raw', round(avg(s.survival) * 100, 2),
      'weighted', null,                      -- deliberately null: see the comment above
      'consistency', round(avg(s.consistency) * 100, 2),
      'compromise', round(avg(s.compromise) * 100, 2),
      'realism', round(avg(s.realism) * 100, 2)
    ),
    'contradiction_raw', round(100.0 * count(*) filter (where cardinality(s.contradictions_hit) > 0) / nullif(count(*), 0), 2),
    'axis_means', jsonb_build_object('raw', jsonb_build_object(
      'peace_force', round(avg((s.axis_scores->>'peace_force')::numeric), 4),
      'trust_paranoia', round(avg((s.axis_scores->>'trust_paranoia')::numeric), 4),
      'us_them', round(avg((s.axis_scores->>'us_them')::numeric), 4)
    )),
    'archetypes', coalesce((select shares from arch), '{}'::jsonb),
    'questions', coalesce((select rows from q), '[]'::jsonb)
  ) into v_out
  from s;

  return v_out;
end $$;

-- submit_vote, evolved to carry the class code (0003 is an append-only file; its header
-- prescribes `create or replace` in a later migration). Everything else is unchanged.
create or replace function submit_vote(p jsonb) returns jsonb
language plpgsql as $$
declare
  v_round     uuid := (p->>'round_id')::uuid;
  v_anon      uuid := (p->>'anon_id')::uuid;
  v_voter     voters;
  v_flags     text[] := coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p->'flags', '[]'::jsonb)) x), '{}');
  v_country   char(2);
  v_class     char(6);
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

  select code into v_class from class_codes where code = upper(p->>'class_code') and active;

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
      age_band, gender, settlement, ip_hash, ua_family, locale, class_code,
      axis_scores, realism, consistency, compromise, survival, archetype, contradictions_hit,
      flagged, flag_reasons, loaded_at, synthetic, submitted_at)
    values (
      v_round, v_voter.id, v_voter.auth_user_id, v_voter.trust, v_country,
      nullif(upper(p->>'geo_country'), ''), nullif(upper(p->>'declared_country'), ''),
      (p->>'age_band')::age_band, (p->>'gender')::gender_band, (p->>'settlement')::settlement_band,
      coalesce(p->>'ip_hash', ''), p->>'ua_family', coalesce(p->>'locale', 'en'), v_class,
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

  return jsonb_build_object('ok', true, 'submission_id', v_sub, 'flags', to_jsonb(v_flags), 'trust', v_voter.trust,
                            'country', v_country, 'class_code', v_class);
end $$;
