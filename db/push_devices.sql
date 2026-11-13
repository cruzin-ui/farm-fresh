-- Phones signed in to the Farm Fresh Direct app that agreed to notifications.
-- One row per phone (its push token). A token moves to whoever signs in on
-- that phone, and is removed when they sign out or the phone stops accepting
-- notifications. Only the server reads and writes it (lib/push.ts), so row
-- level security is on with no policies: the public API can't see it.

create table if not exists public.push_devices (
  token text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists push_devices_user_id_idx on public.push_devices (user_id);

alter table public.push_devices enable row level security;
