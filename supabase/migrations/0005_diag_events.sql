-- Runtime self-reporting: logDiag(kind, detail) writes one row per event
-- (lib/diag.ts). Vercel's ~1h log retention makes log-hunting a dead end, so
-- runtime diagnosis in this project is SQL over this table, not logs.
--
-- BACK-FILLED 2026-07-27 from the verified pg_dump of production
-- (cloud9-schema-2026-07-27.sql). The table was created by hand from SQL handed
-- over in chat and existed only in production until now. Transcribed exactly:
-- no columns, defaults or indexes were "tidied" on the way in.

create table if not exists public.diag_events (
  id     uuid primary key default gen_random_uuid(),
  at     timestamptz not null default now(),
  kind   text not null,
  detail jsonb not null default '{}'::jsonb
);

-- Every diag query is "what happened recently?", so the index is DESC.
create index if not exists diag_events_at_idx
  on public.diag_events (at desc);

-- RLS + service-role grant (the app writes with the service-role key, which
-- bypasses RLS; without the GRANT, PostgREST returns 42501 "permission denied").
-- Production has RLS enabled with ZERO policies: deliberate deny-by-default for
-- anon/authenticated, since only service_role ever touches this table.
alter table public.diag_events enable row level security;
grant all privileges on table public.diag_events to service_role;
