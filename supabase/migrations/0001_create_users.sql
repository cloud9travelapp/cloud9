-- Users table populated on first Google login by the Auth.js signIn callback.
-- Run this in the Supabase SQL editor (or via the Supabase CLI).

create table if not exists public.users (
  id          uuid primary key default gen_random_uuid(),
  google_id   text not null unique,
  email       text unique,
  name        text,
  image       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Keep updated_at fresh whenever a row changes (e.g. repeat logins).
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists users_set_updated_at on public.users;
create trigger users_set_updated_at
  before update on public.users
  for each row
  execute function public.set_updated_at();

-- Row Level Security: the app writes with the service-role key, which bypasses
-- RLS, so it is safe to enable RLS and add narrower policies for client access.
alter table public.users enable row level security;

-- Table privileges. The service-role key bypasses RLS but still needs table-level
-- GRANTs; without this, PostgREST returns "permission denied for table users"
-- (error 42501). anon/authenticated get no grants here — client access, if any,
-- should go through explicit RLS policies.
grant all privileges on table public.users to service_role;
