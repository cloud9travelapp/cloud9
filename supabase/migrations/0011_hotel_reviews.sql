-- First-party verified hotel reviews. The foundation for the BOTH/AND review
-- strategy: no review data exists in either Hotelbeds availability OR the
-- Content API (CONFIRMED x4 — the last time by the content_api_fields diag
-- across 20 live opens, all reporting reviewFields: []), so first-party reviews
-- collected after a stay are THE path. Collection and display are later rounds;
-- the table is empty today (0 rows at back-fill time).
--
-- BACK-FILLED 2026-07-27 from the verified pg_dump of production
-- (cloud9-schema-2026-07-27.sql). This one was a surprise: the handoff listed it
-- as a PENDING handover for a week, but the dump proves it was run — it exists
-- with RLS and grants. Reading the database answered what asking had not.

create table if not exists public.hotel_reviews (
  id             uuid primary key default gen_random_uuid(),

  -- NOTE: these FKs have NO "on delete cascade", unlike every other table in
  -- this schema. Transcribed as-is. It means a user or trip cannot be deleted
  -- while a review references it — the delete errors rather than cascading.
  -- That is arguably correct for a verified review (it should outlive the trip
  -- it came from), but it is UNVERIFIED intent, so it is preserved and flagged
  -- rather than "fixed" to match the others.
  user_id        uuid not null references public.users(id),
  trip_id        uuid references public.trips(id),

  hotel_provider text not null default 'hotelbeds',
  hotel_code     text not null,
  hotel_name     text not null,   -- denormalised: the name at review time

  -- 1..10, matching the scale travel inventory uses (not 1..5).
  rating         smallint not null check (rating >= 1 and rating <= 10),
  review_text    text,
  stay_checkin   date,
  -- True only when the stay is provably ours (a completed booking) — the whole
  -- point of "first-party VERIFIED reviews".
  verified       boolean not null default false,

  created_at     timestamptz not null default now(),

  -- One review per user per hotel per trip. Column order produces the
  -- production constraint name
  -- hotel_reviews_user_id_hotel_provider_hotel_code_trip_id_key.
  unique (user_id, hotel_provider, hotel_code, trip_id)
);

-- No FK indexes in production on user_id / trip_id, unlike trip_favorites which
-- has both. Preserved as-is; worth revisiting when reviews actually carry rows.

-- RLS enabled with ZERO policies (deny-by-default); service_role bypasses RLS.
alter table public.hotel_reviews enable row level security;
grant all privileges on table public.hotel_reviews to service_role;
