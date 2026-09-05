-- planetcheck — schema additions for the Railway/SQL-API design.
-- Append-only. Never edit after apply.

-- Synthetic (seed) submissions are only ever created locally / in staging.
alter table submissions add column synthetic boolean not null default false;

-- Time series of planet stats (every recompute), for the trend line and "biggest move in 24h".
create table planet_snapshots (
  id                     bigint generated always as identity primary key,
  round_id               uuid not null references rounds(id),
  at                     timestamptz not null default now(),
  votes_total            bigint not null default 0,
  survival_raw           numeric(5,2),
  survival_weighted      numeric(5,2),
  contradiction_weighted numeric(5,2),
  pulse_per_min          int not null default 0
);
create index planet_snapshots_round_at_idx on planet_snapshots (round_id, at desc);

-- Leader election for scheduled jobs across replicas / pooled connections.
create table job_leases (
  name          text primary key,
  locked_until  timestamptz,
  last_run_at   timestamptz,
  last_status   text,
  last_error    text
);

-- Session store for the verified layer (OAuth). Holds only the voter link, no personal data.
create table auth_sessions (
  id            uuid primary key default gen_random_uuid(),
  voter_id      uuid not null references voters(id) on delete cascade,
  auth_user_id  uuid not null references auth_users(id) on delete cascade,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null
);
create index auth_sessions_expires_idx on auth_sessions (expires_at);
