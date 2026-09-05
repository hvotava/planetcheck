-- planetcheck — initial schema (plain Postgres ≥ 15, Railway).
-- Matches ARCHITECTURE.md §5–§10. Append-only: never edit this file after it is applied.
--
-- Platform note: the first draft of this file targeted Supabase (auth.users, RLS roles,
-- pg_cron, realtime publication). The project moved to Railway Postgres before any
-- database existed, so this initial migration was rewritten for plain Postgres:
--   * identity lives in auth_users (hashed OAuth subject, nothing personal),
--   * no RLS (a single application role connects; the browser never talks to the DB),
--   * scheduling is done by the app (internal scheduler / cron endpoints), not pg_cron,
--   * live updates are pushed by the app over SSE, not a replication publication.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type round_kind      as enum ('anchor', 'weekly', 'flash');
create type round_status    as enum ('draft', 'live', 'closed');
create type question_type   as enum ('choice', 'meta');
create type trust_level     as enum ('anon', 'verified');
create type age_band        as enum ('18-24', '25-34', '35-44', '45-54', '55-64', '65+');
create type gender_band     as enum ('f', 'm', 'x');
create type settlement_band as enum ('city', 'town', 'rural');

-- ---------------------------------------------------------------------------
-- Static reference data (synced from data/countries.json)
-- ---------------------------------------------------------------------------
create table country_population (
  country_code  char(2) primary key,          -- ISO 3166-1 alpha-2
  name_en       text not null,
  region        text,
  population    bigint not null,
  -- target shares for raking among adults: {"age_band": {"18-24": 0.09, ...}, "gender": {"f": 0.51, "m": 0.49}}
  demographics  jsonb not null default '{}'::jsonb,
  source        text not null default 'World Bank',
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Content
-- ---------------------------------------------------------------------------
create table rounds (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique,
  kind              round_kind not null,
  status            round_status not null default 'draft',
  starts_at         timestamptz not null,
  ends_at           timestamptz,
  unlock_threshold  int not null default 500,
  -- {"consistency": 0.4, "compromise": 0.35, "realism": 0.25}
  survival_weights  jsonb not null default '{"consistency":0.4,"compromise":0.35,"realism":0.25}'::jsonb,
  i18n              jsonb not null default '{}'::jsonb,   -- {"cs": {"title": ..., "blurb": ...}}
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table questions (
  id              uuid primary key default gen_random_uuid(),
  round_id        uuid not null references rounds(id) on delete cascade,
  key             text not null,
  type            question_type not null,
  position        int not null,
  i18n            jsonb not null default '{}'::jsonb,     -- {"cs": {"text": ..., "scenario": ...}, "en": {...}}
  -- meta questions only: which option's share the player is guessing
  meta_target_question_id uuid references questions(id),
  meta_target_option_id   uuid,                           -- FK added after options exists
  review_required boolean not null default false,
  anchor          boolean not null default false,         -- copied from the anchor library
  active          boolean not null default true,
  unique (round_id, key)
);

create table options (
  id            uuid primary key default gen_random_uuid(),
  question_id   uuid not null references questions(id) on delete cascade,
  key           text not null,
  position      int not null,
  i18n          jsonb not null default '{}'::jsonb,
  icon          text,
  -- {"peace_force": -1, "trust_paranoia": 1, "us_them": 0}
  axis_weights  jsonb not null default '{}'::jsonb,
  compromise    boolean not null default false,
  honeypot      boolean not null default false,
  active        boolean not null default true,
  unique (question_id, key)
);

alter table questions
  add constraint questions_meta_target_option_fk
  foreign key (meta_target_option_id) references options(id);

-- Pairs of options that are logically in tension (basis of the contradiction meter)
create table contradiction_pairs (
  id          uuid primary key default gen_random_uuid(),
  round_id    uuid not null references rounds(id) on delete cascade,
  key         text not null,
  option_a_id uuid not null references options(id),
  option_b_id uuid not null references options(id),
  i18n        jsonb not null default '{}'::jsonb,         -- label shown in UI
  active      boolean not null default true,
  unique (round_id, key)
);

-- ---------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------
-- Verified layer. Only a salted hash of the OAuth subject is stored — no email, no name.
create table auth_users (
  id            uuid primary key default gen_random_uuid(),
  provider      text not null,                            -- 'google' | 'apple'
  subject_hash  text not null,                            -- sha256(AUTH_SECRET || provider || subject)
  created_at    timestamptz not null default now(),
  unique (provider, subject_hash)
);

create table voters (
  id               uuid primary key default gen_random_uuid(),
  anon_id          uuid not null unique,                   -- httpOnly cookie pc_anon
  auth_user_id     uuid unique references auth_users(id) on delete set null,
  trust            trust_level not null default 'anon',
  first_seen_at    timestamptz not null default now(),
  last_seen_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Submissions (one per voter per round)
-- ---------------------------------------------------------------------------
create table submissions (
  id                 uuid primary key default gen_random_uuid(),
  round_id           uuid not null references rounds(id),
  voter_id           uuid not null references voters(id),
  auth_user_id       uuid,                                 -- denormalised for the unique below
  trust              trust_level not null default 'anon',
  country_code       char(2) references country_population(country_code),  -- what we count
  geo_country_code   char(2),                              -- cf-ipcountry, audit only
  declared_country   char(2),
  age_band           age_band,
  gender             gender_band,
  settlement         settlement_band,
  ip_hash            text not null,                        -- sha256(IP_SALT || ip), never raw IP
  ua_family          text,                                 -- coarse browser family only, never the UA string
  locale             text not null default 'en',
  -- scoring output (ARCHITECTURE §8)
  axis_scores        jsonb not null default '{}'::jsonb,   -- {"peace_force": -0.3, ...}
  realism            numeric(5,4),
  consistency        numeric(5,4),
  compromise         numeric(5,4),
  survival           numeric(5,4),
  archetype          text,
  contradictions_hit text[] not null default '{}',
  -- weighting output (ARCHITECTURE §9)
  weight             numeric(8,4) not null default 1,
  -- abuse handling: flag, never block
  flagged            boolean not null default false,
  flag_reasons       text[] not null default '{}',
  loaded_at          timestamptz,                          -- when the round was fetched by the client
  submitted_at       timestamptz not null default now(),
  unique (round_id, voter_id)
);

create unique index submissions_round_auth_user_uq
  on submissions (round_id, auth_user_id) where auth_user_id is not null;
create index submissions_round_country_idx on submissions (round_id, country_code) where not flagged;
create index submissions_round_demo_idx    on submissions (round_id, age_band, gender, settlement) where not flagged;
create index submissions_submitted_idx     on submissions (submitted_at);
create index submissions_ip_hash_idx       on submissions (ip_hash, submitted_at);
create index submissions_voter_idx         on submissions (voter_id, submitted_at);

create table answers (
  id             uuid primary key default gen_random_uuid(),
  submission_id  uuid not null references submissions(id) on delete cascade,
  question_id    uuid not null references questions(id),
  option_id      uuid not null references options(id),
  unique (submission_id, question_id)
);
create index answers_question_option_idx on answers (question_id, option_id);

create table meta_guesses (
  id               uuid primary key default gen_random_uuid(),
  submission_id    uuid not null references submissions(id) on delete cascade,
  question_id      uuid not null references questions(id),
  guess            smallint not null check (guess between 0 and 100),
  actual_at_submit numeric(5,2),                           -- weighted share at time of submit
  actual_final     numeric(5,2),                           -- filled by cron after round closes
  unique (submission_id, question_id)
);

-- ---------------------------------------------------------------------------
-- Aggregates (trigger-maintained; live charts read these)
-- ---------------------------------------------------------------------------
create table agg_option_country (
  round_id      uuid not null references rounds(id),
  question_id   uuid not null references questions(id),
  option_id     uuid not null references options(id),
  country_code  char(2) not null default '--',             -- '--' = unknown
  trust         trust_level not null,
  cnt           bigint not null default 0,
  sum_weight    numeric(14,4) not null default 0,
  primary key (round_id, question_id, option_id, country_code, trust)
);

create table pulse_buckets (
  round_id   uuid not null references rounds(id),
  minute     timestamptz not null,                         -- date_trunc('minute', submitted_at)
  cnt        int not null default 0,
  primary key (round_id, minute)
);

-- ---------------------------------------------------------------------------
-- Computed stats (cron-maintained)
-- ---------------------------------------------------------------------------
create table planet_stats (
  round_id               uuid primary key references rounds(id),
  votes_total            bigint not null default 0,
  votes_verified         bigint not null default 0,
  votes_flagged          bigint not null default 0,
  countries_unlocked     int not null default 0,
  survival_raw           numeric(5,2),
  survival_weighted      numeric(5,2),
  contradiction_raw      numeric(5,2),
  contradiction_weighted numeric(5,2),
  realism_mean           numeric(5,4),
  compromise_mean        numeric(5,4),
  consistency_mean       numeric(5,4),
  axis_means             jsonb not null default '{}'::jsonb,   -- {"raw": {...}, "weighted": {...}}
  archetype_shares       jsonb not null default '{}'::jsonb,   -- {"raw": {"diplomat": 0.3}, "weighted": {...}}
  contradiction_shares   jsonb not null default '{}'::jsonb,   -- {"pair_key": {"raw": 0.1, "weighted": 0.12}}
  pulse_per_min          int not null default 0,
  pulse_refreshed_at     timestamptz not null default now(),
  computed_at            timestamptz not null default now()
);

create table country_stats (
  round_id             uuid not null references rounds(id),
  country_code         char(2) not null references country_population(country_code),
  submissions_count    int not null default 0,
  verified_count       int not null default 0,
  unlocked             boolean not null default false,
  insufficient_sample  boolean not null default true,
  survival_index       numeric(5,2),
  contradiction_index  numeric(5,2),
  realism_mean         numeric(5,4),
  compromise_mean      numeric(5,4),
  axis_means           jsonb not null default '{}'::jsonb,
  archetype_shares     jsonb not null default '{}'::jsonb,
  contradiction_shares jsonb not null default '{}'::jsonb,
  top_archetype        text,
  titles               text[] not null default '{}',       -- keys from content/titles.yaml
  rank                 int,
  computed_at          timestamptz not null default now(),
  primary key (round_id, country_code)
);

create table narrator_posts (
  id            uuid primary key default gen_random_uuid(),
  round_id      uuid references rounds(id),
  locale        text not null,
  body          text not null,
  model         text,
  context       jsonb not null default '{}'::jsonb,        -- the numbers the text was generated from (audit)
  approved      boolean not null default false,
  generated_at  timestamptz not null default now(),
  published_at  timestamptz
);
create index narrator_posts_locale_idx on narrator_posts (locale, approved, generated_at desc);

-- ---------------------------------------------------------------------------
-- Triggers: aggregate + pulse on insert
-- Only unflagged submissions feed the public aggregates.
-- ---------------------------------------------------------------------------
create or replace function trg_answers_aggregate() returns trigger
language plpgsql as $$
declare
  s submissions%rowtype;
begin
  select * into s from submissions where id = new.submission_id;
  if s.flagged then
    return new;
  end if;

  insert into agg_option_country (round_id, question_id, option_id, country_code, trust, cnt, sum_weight)
  values (s.round_id, new.question_id, new.option_id, coalesce(s.country_code, '--'), s.trust, 1, s.weight)
  on conflict (round_id, question_id, option_id, country_code, trust)
  do update set cnt = agg_option_country.cnt + 1,
                sum_weight = agg_option_country.sum_weight + excluded.sum_weight;
  return new;
end $$;

create trigger answers_aggregate
  after insert on answers
  for each row execute function trg_answers_aggregate();

create or replace function trg_submissions_pulse() returns trigger
language plpgsql as $$
begin
  insert into pulse_buckets (round_id, minute, cnt)
  values (new.round_id, date_trunc('minute', new.submitted_at), 1)
  on conflict (round_id, minute) do update set cnt = pulse_buckets.cnt + 1;
  return new;
end $$;

create trigger submissions_pulse
  after insert on submissions
  for each row execute function trg_submissions_pulse();

-- Weight changes from the recompute cron must be reflected in sum_weight.
-- Recompute rebuilds agg_option_country for the round wholesale (simpler than delta updates).
create or replace function rebuild_agg_for_round(p_round uuid) returns void
language sql as $$
  delete from agg_option_country where round_id = p_round;
  insert into agg_option_country (round_id, question_id, option_id, country_code, trust, cnt, sum_weight)
  select s.round_id, a.question_id, a.option_id, coalesce(s.country_code, '--'), s.trust,
         count(*), sum(s.weight)
  from answers a
  join submissions s on s.id = a.submission_id
  where s.round_id = p_round and not s.flagged
  group by 1,2,3,4,5;
$$;

-- ---------------------------------------------------------------------------
-- Helpers used by API routes
-- ---------------------------------------------------------------------------
create or replace function current_round(p_kind round_kind default 'weekly') returns rounds
language sql stable as $$
  select * from rounds
  where kind = p_kind and status = 'live'
    and starts_at <= now() and (ends_at is null or ends_at > now())
  order by starts_at desc limit 1;
$$;

-- Weighted share of an option (0–100), used for meta question "actual" values.
create or replace function option_share(p_option uuid, p_weighted boolean default true) returns numeric
language sql stable as $$
  with q as (select question_id, round_id from options o join questions qq on qq.id = o.question_id where o.id = p_option),
  tot as (
    select sum(case when p_weighted then sum_weight else cnt end) as t
    from agg_option_country a, q where a.question_id = q.question_id
  ),
  own as (
    select sum(case when p_weighted then sum_weight else cnt end) as o
    from agg_option_country a where a.option_id = p_option
  )
  select case when coalesce(tot.t,0) = 0 then null else round(100.0 * own.o / tot.t, 2) end
  from tot, own;
$$;
