-- planetcheck — Proroctví (forecasting), ARCHITECTURE §15 phase 5.
-- Append-only. Never edit after apply.
--
-- A prophecy is a yes/no claim about the future with a closing date. Players give a
-- probability (0–100). When it resolves, every guess gets a Brier score, (p − outcome)²,
-- so the planet's forecasting skill becomes a number like its survival index.
--
-- Deliberate differences from votes:
--   * a prophecy is not tied to a round — it outlives them,
--   * one guess per voter per prophecy, a repeat is a 409 (same hard rule as votes),
--   * an outcome is never set by content or by a job; only an admin call sets it.

create type prophecy_status as enum ('open', 'closed', 'resolved', 'void');

create table prophecies (
  id                uuid primary key default gen_random_uuid(),
  key               text not null unique,
  i18n              jsonb not null default '{}'::jsonb,   -- {"cs": {"title":…, "blurb":…}, …}
  category          text,                                  -- free label from content, e.g. "climate"
  opens_at          timestamptz not null,
  closes_at         timestamptz not null,                  -- guesses accepted strictly before this
  resolves_at       timestamptz not null,                  -- when we expect to know
  status            prophecy_status not null default 'open',
  outcome           boolean,                               -- null until resolved
  resolved_at       timestamptz,
  resolution_note   text,                                  -- public, auditable: what happened and where we read it
  review_required   boolean not null default false,
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint prophecies_window check (closes_at > opens_at and resolves_at >= closes_at),
  constraint prophecies_outcome_needs_resolution check ((outcome is null) = (status <> 'resolved'))
);
create index prophecies_status_idx on prophecies (status, closes_at desc);

create table prophecy_guesses (
  id            uuid primary key default gen_random_uuid(),
  prophecy_id   uuid not null references prophecies(id) on delete cascade,
  voter_id      uuid not null references voters(id) on delete cascade,
  probability   int not null check (probability between 0 and 100),
  trust         trust_level not null default 'anon',
  country_code  char(2) references country_population(country_code),
  ip_hash       text not null,                             -- sha256(IP_SALT || ip), never a raw IP
  locale        text not null default 'en',
  brier         numeric(6,5),                              -- filled in at resolution
  flagged       boolean not null default false,
  flag_reasons  text[] not null default '{}',
  created_at    timestamptz not null default now(),
  unique (prophecy_id, voter_id)
);
create index prophecy_guesses_prophecy_idx on prophecy_guesses (prophecy_id) where flagged = false;
create index prophecy_guesses_country_idx on prophecy_guesses (prophecy_id, country_code) where flagged = false;

-- ---------------------------------------------------------------------------
-- SQL API (same shape as 0003: fn(p jsonb) returns jsonb)
-- ---------------------------------------------------------------------------

-- Upsert prophecies from content/prophecies.yaml. Never deletes and never touches
-- status/outcome — resolution is an operator decision, not content.
create or replace function sync_prophecies(p jsonb) returns jsonb
language plpgsql as $$
declare v_item jsonb; v_n int := 0;
begin
  for v_item in select * from jsonb_array_elements(coalesce(p->'prophecies', '[]'::jsonb)) loop
    insert into prophecies (key, i18n, category, opens_at, closes_at, resolves_at, review_required, active)
    values (
      v_item->>'key',
      coalesce(v_item->'i18n', '{}'::jsonb),
      v_item->>'category',
      (v_item->>'opens_at')::timestamptz,
      (v_item->>'closes_at')::timestamptz,
      (v_item->>'resolves_at')::timestamptz,
      coalesce((v_item->>'review_required')::boolean, false),
      true
    )
    on conflict (key) do update
      set i18n = excluded.i18n,
          category = excluded.category,
          opens_at = excluded.opens_at,
          closes_at = excluded.closes_at,
          resolves_at = excluded.resolves_at,
          review_required = excluded.review_required,
          active = true,
          updated_at = now();
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('count', v_n);
end $$;

-- Country post-stratification weight for one prophecy, using the §9 country formula
-- (population share / sample share, clamped). Demographic raking is deliberately not
-- applied here: prophecy guesses carry no demographics.
create or replace function prophecy_country_weights(p_prophecy uuid, p_lo numeric, p_hi numeric)
returns table (country_code char(2), n bigint, w numeric)
language sql stable as $$
  with g as (
    select g.country_code as code, count(*)::bigint as n
    from prophecy_guesses g
    where g.prophecy_id = p_prophecy and g.flagged = false and g.country_code is not null
    group by g.country_code
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

-- One prophecy with its aggregate. Raw and weighted side by side (CLAUDE.md rule 5).
create or replace function prophecy_stats(p jsonb) returns jsonb
language plpgsql stable as $$
declare
  v_id uuid;
  v_lo numeric := coalesce((p->>'clamp_lo')::numeric, 0.2);
  v_hi numeric := coalesce((p->>'clamp_hi')::numeric, 5.0);
  v_row prophecies;
  v_out jsonb;
begin
  select * into v_row from prophecies
  where (p->>'id' is not null and id = (p->>'id')::uuid)
     or (p->>'id' is null and p->>'key' is not null and key = p->>'key')
  limit 1;
  if v_row.id is null then return null; end if;
  v_id := v_row.id;

  with w as (select * from prophecy_country_weights(v_id, v_lo, v_hi)),
  g as (
    select gg.probability, gg.trust, gg.country_code, coalesce(w.w, 1) as weight
    from prophecy_guesses gg left join w on w.country_code = gg.country_code
    where gg.prophecy_id = v_id and gg.flagged = false
  ),
  agg as (
    select count(*)::bigint as n,
           count(*) filter (where trust = 'verified')::bigint as n_verified,
           avg(probability)::numeric as mean_raw,
           case when sum(weight) > 0 then sum(probability * weight) / sum(weight) else null end as mean_weighted
    from g
  ),
  briers as (
    select avg(brier)::numeric as brier_raw,
           case when sum(coalesce(w.w, 1)) > 0 then sum(brier * coalesce(w.w, 1)) / sum(coalesce(w.w, 1)) else null end as brier_weighted
    from prophecy_guesses gg left join w on w.country_code = gg.country_code
    where gg.prophecy_id = v_id and gg.flagged = false and gg.brier is not null
  ),
  buckets as (
    select jsonb_agg(jsonb_build_object('bucket', b, 'n', n) order by b) as hist
    from (
      select least(9, probability / 10) as b, count(*)::bigint as n
      from g group by least(9, probability / 10)
    ) t
  ),
  by_country as (
    select jsonb_agg(jsonb_build_object('country_code', country_code, 'n', n, 'mean_raw', round(mean_raw, 2)) order by n desc) as rows
    from (
      select country_code, count(*)::bigint as n, avg(probability)::numeric as mean_raw
      from g where country_code is not null group by country_code
    ) t
  )
  select jsonb_build_object(
    'id', v_row.id, 'key', v_row.key, 'i18n', v_row.i18n, 'category', v_row.category,
    'opens_at', v_row.opens_at, 'closes_at', v_row.closes_at, 'resolves_at', v_row.resolves_at,
    'status', v_row.status, 'outcome', v_row.outcome, 'resolved_at', v_row.resolved_at,
    'resolution_note', v_row.resolution_note, 'review_required', v_row.review_required,
    'n', agg.n, 'n_verified', agg.n_verified,
    'mean', jsonb_build_object('raw', round(agg.mean_raw, 2), 'weighted', round(agg.mean_weighted, 2)),
    'brier', jsonb_build_object('raw', round(briers.brier_raw, 5), 'weighted', round(briers.brier_weighted, 5)),
    'histogram', coalesce(buckets.hist, '[]'::jsonb),
    'countries', coalesce(by_country.rows, '[]'::jsonb)
  ) into v_out
  from agg, briers, buckets, by_country;

  return v_out;
end $$;

create or replace function list_prophecies(p jsonb) returns jsonb
language sql stable as $$
  select coalesce(jsonb_agg(prophecy_stats(jsonb_build_object('id', x.id, 'clamp_lo', p->'clamp_lo', 'clamp_hi', p->'clamp_hi'))
           order by x.status, x.closes_at), '[]'::jsonb)
  from (
    select id, status, closes_at from prophecies
    where active
      and (p->>'status' is null or status = (p->>'status')::prophecy_status)
      and (coalesce((p->>'include_future')::boolean, false) or opens_at <= now())
  ) x;
$$;

-- One guess per voter per prophecy. A repeat is a 409 at the API layer, never a silent
-- replacement — the same rule as votes (ARCHITECTURE §6).
create or replace function submit_prophecy_guess(p jsonb) returns jsonb
language plpgsql as $$
declare
  v_prophecy prophecies;
  v_voter voters;
  v_existing uuid;
  v_id uuid;
begin
  select * into v_prophecy from prophecies where key = p->>'key' and active;
  if v_prophecy.id is null then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  if v_prophecy.status <> 'open' or v_prophecy.closes_at <= now() or v_prophecy.opens_at > now() then
    return jsonb_build_object('ok', false, 'code', 'closed');
  end if;

  insert into voters (anon_id) values ((p->>'anon_id')::uuid)
  on conflict (anon_id) do update set last_seen_at = now()
  returning * into v_voter;

  select id into v_existing from prophecy_guesses where prophecy_id = v_prophecy.id and voter_id = v_voter.id;
  if v_existing is not null then
    return jsonb_build_object('ok', false, 'code', 'duplicate', 'guess_id', v_existing);
  end if;

  insert into prophecy_guesses (prophecy_id, voter_id, probability, trust, country_code, ip_hash, locale, flagged, flag_reasons)
  values (
    v_prophecy.id, v_voter.id, (p->>'probability')::int,
    v_voter.trust,
    nullif(p->>'country', ''),
    p->>'ip_hash',
    coalesce(p->>'locale', 'en'),
    coalesce(jsonb_array_length(p->'flags'), 0) > 0,
    coalesce((select array_agg(value::text) from jsonb_array_elements_text(coalesce(p->'flags', '[]'::jsonb)) as t(value)), '{}')
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'guess_id', v_id, 'prophecy_id', v_prophecy.id);
end $$;

-- Operator action: set the outcome and score every guess. Idempotent for the same outcome.
create or replace function resolve_prophecy(p jsonb) returns jsonb
language plpgsql as $$
declare
  v_row prophecies;
  v_outcome boolean := (p->>'outcome')::boolean;
  v_n int;
begin
  select * into v_row from prophecies where key = p->>'key';
  if v_row.id is null then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;

  if p->>'void' = 'true' then
    update prophecies set status = 'void', outcome = null, resolved_at = now(),
      resolution_note = coalesce(p->>'note', resolution_note), updated_at = now()
    where id = v_row.id;
    update prophecy_guesses set brier = null where prophecy_id = v_row.id;
    return jsonb_build_object('ok', true, 'status', 'void', 'scored', 0);
  end if;

  if v_outcome is null then return jsonb_build_object('ok', false, 'code', 'outcome_required'); end if;

  update prophecies
    set status = 'resolved', outcome = v_outcome, resolved_at = now(),
        resolution_note = coalesce(p->>'note', resolution_note), updated_at = now()
  where id = v_row.id;

  -- Brier score: (p − outcome)², p in 0..1. Lower is better; 0.25 is a coin flip.
  update prophecy_guesses
    set brier = round(power((probability::numeric / 100) - (case when v_outcome then 1 else 0 end), 2), 5)
  where prophecy_id = v_row.id;
  get diagnostics v_n = row_count;

  return jsonb_build_object('ok', true, 'status', 'resolved', 'outcome', v_outcome, 'scored', v_n);
end $$;

-- Closes prophecies whose window has passed, so the UI never offers a stale slider.
create or replace function close_due_prophecies(p jsonb) returns jsonb
language plpgsql as $$
declare v_n int;
begin
  update prophecies set status = 'closed', updated_at = now()
  where status = 'open' and closes_at <= now();
  get diagnostics v_n = row_count;
  return jsonb_build_object('closed', v_n);
end $$;
