-- Admin controls: suspending sellers, blocking buyers, and a record of what
-- admins do. Run this once in the Supabase SQL editor. It is safe to run again.

-- Who is suspended (sellers) or blocked (buyers). Kept in its own table, which
-- only the server can read or write, so nobody can lift their own block.
create table if not exists account_blocks (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('seller', 'buyer')),
  user_id uuid,
  email text,
  reason text,
  created_by text,
  created_at timestamptz not null default now()
);
alter table account_blocks enable row level security;
create unique index if not exists account_blocks_scope_user
  on account_blocks (scope, user_id) where user_id is not null;
create index if not exists account_blocks_scope_email
  on account_blocks (scope, lower(email)) where email is not null;

-- The one thing the public pages need to know: which sellers are suspended,
-- so their listings can be left out. It exposes the seller's id and nothing
-- else (not the reason, not who did it, and nothing about buyers).
create or replace view suspended_sellers as
  select user_id as seller_id
  from account_blocks
  where scope = 'seller' and user_id is not null;
grant select on suspended_sellers to anon, authenticated;

-- What each admin did and when.
create table if not exists admin_actions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  admin_email text not null,
  action text not null,
  target text,
  detail text
);
alter table admin_actions enable row level security;
create index if not exists admin_actions_created_at on admin_actions (created_at desc);
