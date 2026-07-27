-- Hotelbeds Activities search cache (24h TTL enforced in code). Mirrors
-- stay_search_cache: one generic key/offers table whose key prefix carries the
-- generation ("hba5|…") plus the per-activity modality capture ("hbamod|<code>").
-- The daily quota counter matches "hba_|%" so modality rows can never inflate it.
--
-- BACK-FILLED 2026-07-27 from the verified pg_dump of production
-- (cloud9-schema-2026-07-27.sql).
--
-- NOTE: `offers` DOES default to '[]'::jsonb here, unlike stay_search_cache
-- (0007) where it has no default. Preserved rather than harmonised.

create table if not exists public.attraction_search_cache (
  key        text primary key,
  offers     jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- Present in production (the stays equivalent has none — also preserved as-is).
create index if not exists attraction_search_cache_created_at_idx
  on public.attraction_search_cache (created_at);

-- RLS enabled with ZERO policies (deny-by-default); service_role bypasses RLS.
alter table public.attraction_search_cache enable row level security;
grant all privileges on table public.attraction_search_cache to service_role;
