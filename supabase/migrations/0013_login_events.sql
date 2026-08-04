-- Login log. Auth.js runs JWT sessions, so until now NO login ever touched the
-- database and we recorded nothing at all — signups were only inferrable from
-- users.created_at, and returning visits were invisible.
--
-- SECURITY purpose, and that is what justifies keeping IP and user-agent here:
-- account protection, unauthorised-access detection, and diagnosing sign-in
-- failures. Legal basis is legitimate interest, NOT consent (see
-- docs/LEGAL-QUESTIONS.md).
--
-- DATA MINIMISATION — a deliberate asymmetry with 0014_user_events: IP and
-- user-agent live HERE ONLY. Product analytics does not need them, and not
-- collecting beats collecting-and-protecting. Do not add them to user_events.
--
-- RETENTION: 12 months, enforced by pg_cron (see the schedule at the bottom of
-- 0014). Personal data with no expiry is a liability, not an asset.

create table if not exists public.login_events (
  id         uuid primary key default gen_random_uuid(),
  -- CASCADE is the right-to-erasure mechanism: deleting the user deletes these
  -- rows atomically, with no cleanup step anyone has to remember.
  user_id    uuid not null references public.users(id) on delete cascade,
  at         timestamptz not null default now(),
  -- inet, not text: validates on write and supports subnet queries ("logins
  -- from this network") without reparsing strings. Null when the proxy header
  -- is missing or unparseable — never store a placeholder.
  ip         inet,
  user_agent text,
  -- First-ever login for this user = the signup moment. Derived at write time
  -- from whether any earlier row exists, so it survives the users row being
  -- upserted on every sign-in.
  is_first   boolean not null default false
);

-- "This user's login history, newest first" — the account-security question.
create index if not exists login_events_user_at_idx
  on public.login_events (user_id, at desc);

-- "Signups and logins per day" — every analytics query scans by time.
create index if not exists login_events_at_idx
  on public.login_events (at desc);

-- RLS enabled with ZERO policies (deny-by-default); the app connects as
-- service_role, which bypasses RLS. Without the GRANT, PostgREST returns 42501
-- — the failure that silently killed stay_search_cache for days.
alter table public.login_events enable row level security;
grant all privileges on table public.login_events to service_role;
