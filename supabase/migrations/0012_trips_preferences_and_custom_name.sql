-- Two columns added to public.trips after 0003 by hand-run ALTER statements
-- handed over in chat, and never written to a migration file:
--
--   name_is_custom  set when the user renames a trip via the sidebar pencil
--                   (PATCH /api/trips/[id]); locks the title against the haiku
--                   auto-titler for the rest of the trip's life.
--   preferences     trip-scoped preferences recorded by remember_preference
--                   (scope "trip"); rides the prompt's dynamic tail and dies
--                   with the trip. The stable equivalent lives on users.
--
-- BACK-FILLED 2026-07-27. These were NOT found by reading the schema dump —
-- both look like ordinary columns there. They surfaced only when the full
-- migration chain was applied to a scratch database and the result diffed
-- against production, which is the argument for doing the restore drill rather
-- than inspecting the file: a column added by ALTER is invisible as drift until
-- something tries to rebuild without it.
--
-- Idempotent: safe on production (where both already exist) and on a fresh
-- database built from 0001-0011.

alter table public.trips
  add column if not exists name_is_custom boolean not null default false;

alter table public.trips
  add column if not exists preferences jsonb not null default '[]'::jsonb;
