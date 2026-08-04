-- Product funnel events. ONE generic table, following the trip_favorites and
-- trip_timeline_items precedent: event_type is free text, NOT a check
-- constraint, so a new event never needs a migration. That is the whole point
-- of the abstraction.
--
-- WHY NOT REUSE diag_events (which already has kind + detail and needs no
-- migration): user_id and trip_id would live inside jsonb, so there would be no
-- FOREIGN KEY and therefore no cascade on account deletion. Erasure would become
-- a manual "delete where detail->>'user' = …" that someone has to remember.
-- Real columns make deletion automatic and provable. Secondary reason:
-- diag_events is operational debugging with a different natural retention, and
-- mixing the two makes both queries and the retention policy fragile.
--
-- DELIBERATELY NOT a click stream. Seven events that mark real intent. Logging
-- every interaction bloats the database and complicates privacy for no insight.
--
-- NO PERSONAL DATA HERE: no IP, no user-agent, no message content. Search
-- CRITERIA (destination, dates) are recorded because they are the funnel; what
-- the traveler typed to the concierge is not.
--
-- Event types in use (extend freely, no migration needed):
--   trip_created         payload {}
--   stay_search          payload {destination, checkIn, checkOut, guests, budgetLevel, resultCount, source}
--   attraction_search    payload {destination, from, to, category, resultCount, source}
--   flight_search        payload {origin, destination, date, resultCount}
--   offer_selected       payload {itemType, provider, code, price, currency}
--   favorite_added       payload {itemType, provider, code}
--   timeline_item_added  payload {itemType, source, category}
--
-- offer_selected is derived from the STRUCTURED timelineItem in the chat POST
-- body, never from sniffing a localized "בחרתי"/"Selected" message prefix — a
-- prefix would rot the moment the copy changes. Documented coupling: this metric
-- depends on the timeline capture path.

create table if not exists public.user_events (
  id         uuid primary key default gen_random_uuid(),
  -- Both CASCADE: deleting a user, or a trip, takes its events with it.
  user_id    uuid not null references public.users(id) on delete cascade,
  trip_id    uuid references public.trips(id) on delete cascade, -- null = not trip-scoped
  event_type text not null,
  payload    jsonb not null default '{}'::jsonb,
  at         timestamptz not null default now()
);

-- The funnel query: "how many stay_search events this week", "how many
-- offer_selected". Every metric filters by type over a time range.
create index if not exists user_events_type_at_idx
  on public.user_events (event_type, at desc);

-- Retention and per-user behaviour ("did this user come back and do anything").
create index if not exists user_events_user_at_idx
  on public.user_events (user_id, at desc);

-- FK index (Postgres does not create these automatically; without it every
-- trip delete becomes a sequential scan over this table).
create index if not exists user_events_trip_idx
  on public.user_events (trip_id);

alter table public.user_events enable row level security;
grant all privileges on table public.user_events to service_role;

-- ── Retention: 12 months, enforced in the DATABASE ──────────────────────────
-- Database-side rather than app-side so it survives redeploys, refactors and
-- the app being down. Requires the pg_cron extension: enable it ONCE in
-- Dashboard → Database → Extensions, then run the block below.
--
-- Aggregates computed from these rows may be kept longer, because once
-- aggregated they no longer identify anyone.
--
-- RUN SEPARATELY, after enabling pg_cron:
--
--   select cron.schedule(
--     'purge-old-events',
--     '0 3 * * *',
--     $$
--       delete from public.user_events  where at < now() - interval '12 months';
--       delete from public.login_events where at < now() - interval '12 months';
--     $$
--   );
--
-- Verify with:  select jobname, schedule, active from cron.job;
-- Remove with:  select cron.unschedule('purge-old-events');
