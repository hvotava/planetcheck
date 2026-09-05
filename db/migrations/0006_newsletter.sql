-- planetcheck — newsletter (termíny dalších kol). Append-only; never edit after apply.
--
-- This is the first table in the project that holds a personal identifier, so the rules are
-- written into the schema rather than left to the application:
--   * double opt-in: a row is `pending` until the reader clicks a link only they received,
--   * the confirmation token is stored HASHED, so a database leak cannot be used to confirm
--     anyone (same trick as auth_users.subject_hash),
--   * the unsubscribe token is not stored at all: it is an HMAC of the row id, recomputed on
--     each send and verified on use, so there is nothing in the database to leak,
--   * unsubscribing keeps a suppression row for a while, then it is purged entirely,
--   * a pending row that is never confirmed is deleted — an address nobody confirmed is an
--     address we were never given.
-- ARCHITECTURE §14 records the promise this changes.

create type subscriber_status as enum ('pending', 'confirmed', 'unsubscribed');

create table newsletter_subscribers (
  id                 uuid primary key default gen_random_uuid(),
  email              text not null unique,              -- always stored lowercased and trimmed
  locale             text not null default 'en',
  status             subscriber_status not null default 'pending',
  confirm_token_hash text,                              -- sha256(AUTH_SECRET || token); cleared on confirm
  ip_hash            text,                              -- abuse only; never a raw IP
  created_at         timestamptz not null default now(),
  confirmed_at       timestamptz,
  unsubscribed_at    timestamptz,
  last_sent_at       timestamptz,
  last_sent_slug     text                               -- the round we last told them about
);
create index newsletter_status_idx on newsletter_subscribers (status);
create index newsletter_pending_idx on newsletter_subscribers (created_at) where status = 'pending';

/**
 * Start (or restart) a subscription. Always returns ok so the endpoint cannot be used to
 * probe whether an address is already on the list; the caller only learns whether it needs
 * to send a confirmation mail.
 */
create or replace function newsletter_subscribe(p jsonb) returns jsonb
language plpgsql as $$
declare
  v_email text := lower(btrim(p->>'email'));
  v_row newsletter_subscribers;
begin
  if v_email is null or v_email = '' then return jsonb_build_object('ok', false, 'code', 'invalid'); end if;

  select * into v_row from newsletter_subscribers where email = v_email;

  if v_row.id is not null and v_row.status = 'confirmed' then
    -- already on the list: say nothing new, send nothing
    return jsonb_build_object('ok', true, 'code', 'already_confirmed', 'send_confirmation', false);
  end if;

  insert into newsletter_subscribers (email, locale, status, confirm_token_hash, ip_hash)
  values (v_email, coalesce(p->>'locale', 'en'), 'pending', p->>'confirm_token_hash', p->>'ip_hash')
  on conflict (email) do update
    set status = 'pending',
        locale = coalesce(excluded.locale, newsletter_subscribers.locale),
        confirm_token_hash = excluded.confirm_token_hash,
        ip_hash = excluded.ip_hash,
        created_at = now(),
        unsubscribed_at = null
  returning * into v_row;

  return jsonb_build_object('ok', true, 'code', 'pending', 'send_confirmation', true);
end $$;

create or replace function newsletter_confirm(p jsonb) returns jsonb
language plpgsql as $$
declare v_row newsletter_subscribers;
begin
  select * into v_row from newsletter_subscribers
   where confirm_token_hash = p->>'token_hash' and status = 'pending';
  if v_row.id is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_token');
  end if;

  update newsletter_subscribers
     set status = 'confirmed', confirmed_at = now(), confirm_token_hash = null
   where id = v_row.id;
  return jsonb_build_object('ok', true, 'code', 'confirmed', 'locale', v_row.locale, 'id', v_row.id);
end $$;

/** Removal by row id; the caller has already verified the HMAC that guards it. */
create or replace function newsletter_unsubscribe(p jsonb) returns jsonb
language plpgsql as $$
declare v_row newsletter_subscribers;
begin
  select * into v_row from newsletter_subscribers where id = (p->>'id')::uuid;
  if v_row.id is null then return jsonb_build_object('ok', false, 'code', 'invalid_token'); end if;
  if v_row.status = 'unsubscribed' then return jsonb_build_object('ok', true, 'code', 'already', 'locale', v_row.locale); end if;

  update newsletter_subscribers
     set status = 'unsubscribed', unsubscribed_at = now(), confirm_token_hash = null
   where id = v_row.id;
  return jsonb_build_object('ok', true, 'code', 'unsubscribed', 'locale', v_row.locale);
end $$;

/**
 * Confirmed readers who have not been told about this round yet.
 *
 * `confirmed_at < starts_at` matters: somebody who subscribes today, right after playing,
 * must not immediately receive "a new round has opened" about the round they just played.
 * They hear about the next one.
 */
create or replace function newsletter_recipients(p jsonb) returns jsonb
language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'email', s.email, 'locale', s.locale)), '[]'::jsonb)
  from (
    select * from newsletter_subscribers
    where status = 'confirmed'
      and (last_sent_slug is distinct from p->>'slug')
      and (p->>'starts_at' is null or confirmed_at < (p->>'starts_at')::timestamptz)
    order by created_at
    limit coalesce((p->>'limit')::int, 200)
  ) s;
$$;

create or replace function newsletter_mark_sent(p jsonb) returns jsonb
language plpgsql as $$
declare v_n int;
begin
  update newsletter_subscribers
     set last_sent_at = now(), last_sent_slug = p->>'slug'
   where id = any (select (jsonb_array_elements_text(coalesce(p->'ids', '[]'::jsonb)))::uuid);
  get diagnostics v_n = row_count;
  return jsonb_build_object('marked', v_n);
end $$;

/**
 * Retention. Unconfirmed addresses are deleted, not kept: nobody agreed to be on this list.
 * Unsubscribed rows are kept briefly as a suppression record, then deleted too.
 */
create or replace function newsletter_purge(p jsonb) returns jsonb
language plpgsql as $$
declare v_pending int; v_unsub int;
begin
  delete from newsletter_subscribers
   where status = 'pending' and created_at < now() - make_interval(days => coalesce((p->>'pending_days')::int, 14));
  get diagnostics v_pending = row_count;

  delete from newsletter_subscribers
   where status = 'unsubscribed' and unsubscribed_at < now() - make_interval(days => coalesce((p->>'unsubscribed_days')::int, 30));
  get diagnostics v_unsub = row_count;

  return jsonb_build_object('pending_deleted', v_pending, 'unsubscribed_deleted', v_unsub);
end $$;

create or replace function newsletter_stats(p jsonb) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'pending', count(*) filter (where status = 'pending'),
    'confirmed', count(*) filter (where status = 'confirmed'),
    'unsubscribed', count(*) filter (where status = 'unsubscribed')
  ) from newsletter_subscribers;
$$;
