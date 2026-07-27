-- Hotelbeds Activities Content cache: images and descriptions, batch-prefetched
-- once per live search so cards and the modal read cache instead of firing a
-- live call each. PERMANENT (no TTL); the mapped payload carries a version
-- field `v` so a mapping change can invalidate entries without a migration.
--
-- BACK-FILLED 2026-07-27 from the verified pg_dump of production
-- (cloud9-schema-2026-07-27.sql).
--
-- NOTE: key columns are provider/code here, but hotel_provider/hotel_code in
-- hotel_content_cache (0008). Preserved, not unified — the code reads these
-- exact names.

create table if not exists public.attraction_content_cache (
  provider   text not null,
  code       text not null,
  content    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  primary key (provider, code)
);

-- Present in production (hotel_content_cache has no equivalent — preserved).
create index if not exists attraction_content_cache_created_at_idx
  on public.attraction_content_cache (created_at);

-- RLS enabled with ZERO policies (deny-by-default); service_role bypasses RLS.
alter table public.attraction_content_cache enable row level security;
grant all privileges on table public.attraction_content_cache to service_role;
