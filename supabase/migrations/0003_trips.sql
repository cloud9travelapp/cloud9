-- Trips: each trip is a separate conversation, linked to a user.
-- Run in the Supabase SQL editor after 0002_chat.sql.

create table if not exists public.trips (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  name        text not null default 'New Trip',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists trips_user_created_idx
  on public.trips (user_id, created_at desc);

-- Associate each message with its trip.
alter table public.chat_messages
  add column if not exists trip_id uuid references public.trips(id) on delete cascade;

create index if not exists chat_messages_trip_created_idx
  on public.chat_messages (trip_id, created_at);

-- RLS + service-role grant (the app writes with the service-role key, which
-- bypasses RLS; without the GRANT, PostgREST returns 42501 "permission denied").
alter table public.trips enable row level security;
grant all privileges on table public.trips to service_role;
