-- A record of each time a seller cancels or reduces an order: when, why, and
-- what they did with the listing. Shown in the admin page. Run this once in the
-- Supabase SQL editor. It is safe to run again.
--
-- Only the server can read or write it.

create table if not exists seller_order_changes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  order_id uuid not null,
  farmer_id uuid not null,
  kind text not null check (kind in ('cancelled', 'reduced')),
  reason text not null,
  listing_action text not null,
  quantity_removed integer not null default 0
);
alter table seller_order_changes enable row level security;
create index if not exists seller_order_changes_farmer on seller_order_changes (farmer_id, created_at desc);
create index if not exists seller_order_changes_order on seller_order_changes (order_id);
