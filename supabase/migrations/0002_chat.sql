-- Chat feature: per-user message history + learned travel preferences.
-- Run this in the Supabase SQL editor after 0001_create_users.sql.

-- 1. Learned preferences on the user (e.g. ["hotel","budget","family"]).
alter table public.users
  add column if not exists preferences jsonb not null default '[]'::jsonb;

-- 2. Conversation history, one row per message, linked to the user.
create table if not exists public.chat_messages (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  role        text not null check (role in ('user', 'assistant')),
  content     text not null,
  created_at  timestamptz not null default now()
);

-- Fast lookup of a user's conversation in chronological order.
create index if not exists chat_messages_user_created_idx
  on public.chat_messages (user_id, created_at);

-- Row Level Security: the app reads/writes with the service-role key (which
-- bypasses RLS). Enable RLS and grant the service role explicit table
-- privileges — without the GRANT, PostgREST returns 42501 "permission denied".
alter table public.chat_messages enable row level security;
grant all privileges on table public.chat_messages to service_role;
