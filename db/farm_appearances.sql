-- "Where to find us": a farm's posts about the farmers markets, festivals,
-- pop-ups and open days it will be at, shown on its farm page. Followers can
-- choose to be emailed about them. Buyers can also order ahead and pick up at
-- one of these places instead of at the farm. Run this once in the Supabase
-- SQL editor; it is safe to run again.
--
-- Every new table is read and written by the server alone, so row level
-- security is on with no policies.
--
-- AFTER RUNNING THIS, re-run db/seller_orders_view.sql: it adds columns to
-- `orders`, and the sellers' view of their orders must be rebuilt to include
-- them.

create table if not exists farm_appearances (
  id uuid primary key default gen_random_uuid(),
  farmer_id uuid not null,
  -- market, festival, popup, open_farm or other.
  kind text not null check (kind in ('market', 'festival', 'popup', 'open_farm', 'other')),
  -- "Downtown Phoenix Farmers Market"
  name text not null,
  -- The place, as buyers see it. A public venue, never the farm's own address.
  address text not null,
  city text not null default '',
  zip text not null default '',
  latitude double precision,
  longitude double precision,
  -- The (first) date, and for a weekly one the last; one-off dates have
  -- ends_on = starts_on. Times are Arizona time, "08:00" to "12:00".
  starts_on date not null,
  repeats_weekly boolean not null default false,
  ends_on date not null,
  start_time text not null,
  end_time text not null,
  note text not null default '',
  -- Buyers can order ahead and pick up here.
  takes_orders boolean not null default true,
  -- active, or removed (by the farm, or by an admin).
  status text not null default 'active' check (status in ('active', 'removed')),
  removed_by text,
  removed_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);
create index if not exists farm_appearances_farmer on farm_appearances (farmer_id, status, ends_on);
create index if not exists farm_appearances_active on farm_appearances (status, ends_on);

-- A date of a weekly appearance the farm won't be there ("not there this week").
create table if not exists farm_appearance_skips (
  appearance_id uuid not null references farm_appearances(id),
  skip_date date not null,
  reason text not null default '',
  created_at timestamptz not null default now(),
  primary key (appearance_id, skip_date)
);

-- Emails already sent, so each goes once: 'new' for a new post (date is the
-- day it was sent, which also limits a farm to one such email a day), and
-- 'reminder' for the day-before reminder of each date.
create table if not exists farm_appearance_emails (
  farmer_id uuid not null,
  appearance_id uuid,
  kind text not null check (kind in ('new', 'reminder')),
  email_date date not null,
  sent_at timestamptz not null default now()
);
create unique index if not exists farm_appearance_emails_new on farm_appearance_emails (farmer_id, email_date) where kind = 'new';
create unique index if not exists farm_appearance_emails_reminder on farm_appearance_emails (appearance_id, email_date) where kind = 'reminder';

-- Followers choose to get these emails; off unless they turn it on.
alter table farm_follows add column if not exists market_emails boolean not null default false;

-- Orders picked up at one of these places instead of the farm: which one, on
-- which date, and how it reads ("Downtown Phoenix Farmers Market, 721 N
-- Central Ave, Phoenix · Sat, Oct 24, 8:00 am – 12:00 pm").
alter table orders add column if not exists market_appearance_id uuid;
alter table orders add column if not exists market_date date;
alter table orders add column if not exists market_label text;

alter table farm_appearances enable row level security;
alter table farm_appearance_skips enable row level security;
alter table farm_appearance_emails enable row level security;
