-- A farm's pickup address, set once on the Farm Profile and used for every
-- listing the farm posts. Run this once in the Supabase SQL editor. It is safe
-- to run again.
--
-- The full address is private: only the server reads it. Buyers see just the
-- farm's city and zip code until their order is ready, as before.

create table if not exists seller_pickup_addresses (
  farmer_id uuid primary key,
  address text not null,
  updated_at timestamptz not null default now()
);
alter table seller_pickup_addresses enable row level security;
