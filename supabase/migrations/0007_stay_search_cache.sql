-- Hotelbeds stay-search cache (24h TTL enforced in code, not by the schema).
-- Also holds the per-hotel room capture ("hbrooms|<code>") and by-name
-- availability ("hbh|") rows — one generic key/offers table, keyed by prefix.
-- Without this table every search burns live quota, which is exactly what
-- happened while the handover sat unrun.
--
-- BACK-FILLED 2026-07-27 from the verified pg_dump of production
-- (cloud9-schema-2026-07-27.sql).
--
-- NOTE, transcribed deliberately: `offers` has NO default here, unlike
-- attraction_search_cache.offers which defaults to '[]'::jsonb (see 0009). That
-- asymmetry is real in production. It is NOT tidied here — the whole point of
-- this back-fill is that the repo matches the database, and a "harmless"
-- improvement would silently make the file stop describing the live table.

create table if not exists public.stay_search_cache (
  key        text primary key,
  offers     jsonb not null,
  created_at timestamptz not null default now()
);

-- No secondary index in production: reads are by primary key, and the daily
-- quota guard's created_at scan runs over a small table. Left as-is.

-- RLS enabled with ZERO policies (deny-by-default); service_role bypasses RLS.
-- The missing GRANT on this exact table silently killed the cache with 42501 on
-- every write from creation until 2026-07-20 — every search hit live quota.
alter table public.stay_search_cache enable row level security;
grant all privileges on table public.stay_search_cache to service_role;
