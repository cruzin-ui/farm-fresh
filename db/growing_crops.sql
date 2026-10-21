-- "What we're growing": crops a farm has in the ground and roughly when each
-- should be ready, shown on its farm page. Run this once in the Supabase SQL
-- editor; it is safe to run again.
--
-- Read and written by the server alone, so row level security is on with no
-- policies.

create table if not exists growing_crops (
  id uuid primary key default gen_random_uuid(),
  farmer_id uuid not null,
  name text not null,
  variety text not null default '',
  category text not null,
  -- When it should start to be ready, and (optionally) the end of that window.
  expected_from date not null,
  expected_until date,
  note text not null default '',
  -- growing: shown. listed: the farm has since posted it for sale.
  -- removed: taken off by the farm, or by an admin.
  status text not null default 'growing' check (status in ('growing', 'listed', 'removed')),
  removed_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expected_until is null or expected_until >= expected_from)
);
create index if not exists growing_crops_farmer on growing_crops (farmer_id, status);

alter table growing_crops enable row level security;
