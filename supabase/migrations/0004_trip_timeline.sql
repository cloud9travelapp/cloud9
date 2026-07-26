-- Timeline ("המסע"): every planned or booked item on a trip, from any source.
-- Generic by item_type like trip_favorites, so future sources (restaurants,
-- transfers, …) plug in with no schema change.
-- Run in the Supabase SQL editor after 0003_trips.sql.

create table if not exists public.trip_timeline_items (
  id           uuid primary key default gen_random_uuid(),
  trip_id      uuid not null references public.trips(id) on delete cascade,
  user_id      uuid not null references public.users(id) on delete cascade,

  -- stay | flight | attraction | restaurant | manual | (future types)
  -- Deliberately NOT a check constraint: a closed set would force a migration
  -- for every new source, which is exactly what this table is designed to avoid.
  item_type    text not null,
  source       text not null default 'manual' check (source in ('agent', 'manual')),
  -- shopping | beach | nature | food | culture | rest | lodging | transport | other
  category     text not null default 'other',
  state        text not null default 'planned' check (state in ('planned', 'booked')),

  day_date     date,                                -- null = not scheduled yet
  start_time   time,                                -- null = loose day bucket, never invented
  duration_min integer,
  sort_order   integer not null default 0,

  title        text not null,
  notes        text,
  lat          double precision,
  lng          double precision,

  item         jsonb,                               -- agent offer snapshot (trip_favorites pattern)
  -- Wallet slot (documents land here in a later round): pointers + wrapped
  -- keys only, never document bytes. Present now so the wallet needs no ALTER.
  attachments  jsonb not null default '[]'::jsonb,
  -- Client-generated id for one user action. Makes a retried write idempotent,
  -- so recovering from a failed selection can never duplicate the item.
  client_ref   text,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- The timeline query: everything for a trip, in itinerary order. Undated items
-- sort last (they render in the "not scheduled yet" bucket).
create index if not exists trip_timeline_items_trip_day_idx
  on public.trip_timeline_items (trip_id, day_date nulls last, start_time nulls last, sort_order);

-- FK index (Postgres does not create these automatically; a missing one turns
-- every user delete into a sequential scan).
create index if not exists trip_timeline_items_user_idx
  on public.trip_timeline_items (user_id);

-- Idempotency for retried writes; partial so hand-added rows may omit the ref.
create unique index if not exists trip_timeline_items_client_ref_idx
  on public.trip_timeline_items (trip_id, client_ref)
  where client_ref is not null;

-- RLS + service-role grant (the app writes with the service-role key, which
-- bypasses RLS; without the GRANT, PostgREST returns 42501 "permission denied").
alter table public.trip_timeline_items enable row level security;
grant all privileges on table public.trip_timeline_items to service_role;
