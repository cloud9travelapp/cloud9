-- Hearted items on a trip. Generic by item_type from day one (stays first,
-- flights and attractions plugged in later with zero schema change) — the same
-- pattern trip_timeline_items follows.
--
-- BACK-FILLED 2026-07-27 from the verified pg_dump of production
-- (cloud9-schema-2026-07-27.sql). Created by hand from SQL handed over in chat;
-- transcribed exactly, including the unique-constraint column order, which
-- determines the auto-generated constraint name in production.

create table if not exists public.trip_favorites (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id) on delete cascade,
  trip_id       uuid not null references public.trips(id) on delete cascade,

  -- stay | flight | attraction | (future types). Deliberately not a check
  -- constraint, for the same reason as trip_timeline_items.item_type.
  item_type     text not null,
  item_provider text not null,
  item_code     text not null,
  item          jsonb not null,   -- offer snapshot; no default, a favorite is never empty

  created_at    timestamptz not null default now(),

  -- One heart per item per trip. Column order matters: it produces the
  -- production constraint name trip_favorites_trip_id_item_type_item_provider_item_code_key.
  unique (trip_id, item_type, item_provider, item_code)
);

-- FK indexes (Postgres does not create these automatically).
create index if not exists trip_favorites_trip_idx
  on public.trip_favorites (trip_id);

create index if not exists trip_favorites_user_idx
  on public.trip_favorites (user_id);

-- RLS enabled with ZERO policies (deny-by-default); the app reaches this table
-- only as service_role, which bypasses RLS. The GRANT is what keeps PostgREST
-- from returning 42501.
alter table public.trip_favorites enable row level security;
grant all privileges on table public.trip_favorites to service_role;
