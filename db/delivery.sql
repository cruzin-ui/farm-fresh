-- Delivery and drop-off points (see lib/delivery.ts and lib/deliveryServer.ts).
--
-- A farm can deliver to buyers' homes itself, within an area it sets, on the
-- days and times it sets, for a delivery fee. Farm Box members can choose
-- delivery too. A farm can also post drop-off points: a spot it brings orders
-- to on a schedule, where buyers collect them (a "where to find us" post of
-- the kind 'dropoff', ordered for at checkout the way markets are).
--
-- Everything here is additive. New tables are read and written by the server
-- alone: row level security on, no policies.
--
-- AFTER RUNNING THIS, re-run db/seller_orders_view.sql: it adds columns to
-- `orders`, and the sellers' view of their orders must be rebuilt to include
-- them (sellers need the delivery address of their own delivery orders).

-- A farm's delivery settings.
create table if not exists public.farm_delivery (
  farmer_id uuid primary key references auth.users (id) on delete cascade,
  enabled boolean not null default false,
  -- How far the farm delivers, by road (estimated from zip codes).
  radius_miles integer not null default 10 check (radius_miles between 1 and 50),
  -- The fee: a flat amount, plus an optional amount per mile.
  fee_cents integer not null default 500 check (fee_cents between 0 and 5000),
  per_mile_cents integer not null default 0 check (per_mile_cents between 0 and 500),
  -- The smallest order (the farm's items, before fees) it delivers.
  min_order_cents integer not null default 0 check (min_order_cents between 0 and 50000),
  -- Delivery days, 0 = Sunday ... 6 = Saturday, and the time window, Arizona time.
  weekdays smallint[] not null default '{}',
  start_time text not null default '09:00' check (start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  end_time text not null default '12:00' check (end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  -- The farm confirmed it keeps eggs at 45°F or below until they are handed
  -- over (a cooler with ice packs). Without it, eggs are pickup only.
  delivers_eggs boolean not null default false,
  -- Shown to buyers: "I leave orders in a cooler by the front door", etc.
  note text not null default '' check (char_length(note) <= 300),
  -- When the farm agreed to the delivery rules in the Seller Terms.
  agreed_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.farm_delivery enable row level security;

-- One delivery: everything a buyer bought from one farm in one checkout (or
-- one Farm Box), taken to their door. It holds the delivery fee, which is paid
-- to the farm once the delivery is done (or refunded if every item is
-- cancelled). Created as 'unpaid' when the buyer starts paying; 'open' once
-- the payment succeeds.
create table if not exists public.order_deliveries (
  id uuid primary key default gen_random_uuid(),
  checkout_id uuid not null,
  farmer_id uuid not null,
  buyer_id uuid,
  buyer_email text,
  address text not null check (char_length(address) between 5 and 300),
  zip text not null check (zip ~ '^[0-9]{5}$'),
  note text not null default '' check (char_length(note) <= 300),
  delivery_date date not null,
  window_label text not null,
  miles numeric,
  fee_cents integer not null default 0 check (fee_cents >= 0),
  -- unpaid, open, paid (fee sent to the farm), refunded (fee back to the
  -- buyer), closed (nothing to settle).
  status text not null default 'unpaid' check (status in ('unpaid', 'open', 'paid', 'refunded', 'closed')),
  payment_intent_id text,
  payout_cents integer,
  transfer_id text,
  refund_id text,
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  unique (checkout_id, farmer_id)
);
create index if not exists order_deliveries_status on public.order_deliveries (status, created_at);
alter table public.order_deliveries enable row level security;

-- Orders: picked up (as before) or delivered, and for a delivery where, when,
-- and the proof it was left. The buyer's own address is on their own order,
-- and sellers see it on theirs through the seller_orders view.
alter table public.orders add column if not exists fulfillment text not null default 'pickup'
  check (fulfillment in ('pickup', 'delivery'));
alter table public.orders add column if not exists delivery_id uuid;
alter table public.orders add column if not exists delivery_address text;
alter table public.orders add column if not exists delivery_note text;
alter table public.orders add column if not exists delivery_date date;
alter table public.orders add column if not exists delivery_window text;
-- Left at the door with a photo (instead of handed over with the code). The
-- payment is released DELIVERY_RELEASE_HOURS later unless the buyer reports
-- a problem first.
alter table public.orders add column if not exists delivered_at timestamptz;
alter table public.orders add column if not exists delivery_photo_path text;

-- A listing the farm only offers for pickup (it doesn't travel well).
alter table public.produce_listings add column if not exists pickup_only boolean not null default false;

-- Farm Boxes: whether a plan offers delivery, and each member's choice.
alter table public.csa_plans add column if not exists offers_delivery boolean not null default false;
alter table public.csa_members add column if not exists delivery_address text;
alter table public.csa_members add column if not exists delivery_zip text;
alter table public.csa_members add column if not exists delivery_note text;

-- Drop-off points: a new kind of "where to find us" post.
alter table public.farm_appearances drop constraint if exists farm_appearances_kind_check;
alter table public.farm_appearances add constraint farm_appearances_kind_check
  check (kind in ('market', 'festival', 'popup', 'open_farm', 'other', 'dropoff'));

-- Photos of deliveries left at the door. Private; the server hands out links
-- that expire.
insert into storage.buckets (id, name, public)
values ('delivery-photos', 'delivery-photos', false)
on conflict (id) do update set public = false;
