-- Hotelbeds Content API cache: photos, description, amenities, room images,
-- plus the facilities catalog under the reserved code "__facilities__" and the
-- destination/hotel-name indexes. PERMANENT (no TTL) — content barely changes,
-- and the eval tier's 50-requests/day quota returns 403 on exceed.
--
-- This is the table whose handover sat unrun for days while cache reads failed
-- silently, so every modal open and card gallery hit Hotelbeds directly and
-- burned the full daily Content quota — presenting as "the gallery broke".
--
-- BACK-FILLED 2026-07-27 from the verified pg_dump of production
-- (cloud9-schema-2026-07-27.sql).
--
-- NOTE: the key columns are hotel_provider/hotel_code here, but plain
-- provider/code in attraction_content_cache (0010). Same shape, different
-- names — transcribed as-is rather than unified, because the code reads these
-- exact column names and the repo must describe the live table.

create table if not exists public.hotel_content_cache (
  hotel_provider text not null,
  hotel_code     text not null,
  content        jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),

  primary key (hotel_provider, hotel_code)
);

-- No secondary index in production: every read is by the full primary key.

-- RLS enabled with ZERO policies (deny-by-default); service_role bypasses RLS.
alter table public.hotel_content_cache enable row level security;
grant all privileges on table public.hotel_content_cache to service_role;
