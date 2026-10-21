-- Shared Farm Boxes: a host farm and up to three nearby partner farms fill
-- one box together. Buyers pay once and pick up at the host farm; at pickup
-- each farm is paid for its own part. Also Flower Boxes: a Farm Box of cut
-- flowers instead of food. Run this once in the Supabase SQL editor, after
-- csa.sql. It is safe to run again.
--
-- Every table is read and written by the server alone, so row level security
-- is on with no policies.

-- What a Farm Box holds: food (produce and eggs) or cut flowers. Flower boxes
-- are taxed like other non-food goods.
alter table csa_plans add column if not exists box_type text not null default 'food';
alter table csa_plans drop constraint if exists csa_plans_box_type_check;
alter table csa_plans add constraint csa_plans_box_type_check check (box_type in ('food', 'flowers'));

-- solo: one farm's box. shared: a host farm and partner farms.
alter table csa_plans add column if not exists kind text not null default 'solo';
alter table csa_plans drop constraint if exists csa_plans_kind_check;
alter table csa_plans add constraint csa_plans_kind_check check (kind in ('solo', 'shared'));

-- When and where partners bring their part to the host, in the host's words.
alter table csa_plans add column if not exists dropoff_note text not null default '';

-- True when the host has said they will fill in with their own produce if a
-- partner's part doesn't arrive, instead of the buyer being refunded that part.
alter table csa_plans add column if not exists host_substitutes boolean not null default false;

-- A shared box is 'forming' while its partners are being invited: it isn't
-- shown to buyers until the host opens it.
alter table csa_plans drop constraint if exists csa_plans_status_check;
alter table csa_plans add constraint csa_plans_status_check check (status in ('forming', 'open', 'closed', 'ended'));

-- The farms in a shared box: the host, and each partner invited.
create table if not exists csa_plan_farms (
  plan_id uuid not null references csa_plans(id),
  farmer_id uuid not null,
  role text not null check (role in ('host', 'partner')),
  -- invited: waiting for an answer. accepted: in the box. declined: said no.
  -- left: left the box. removed: taken out by the host.
  status text not null default 'invited' check (status in ('invited', 'accepted', 'declined', 'left', 'removed')),
  -- What this farm puts in each box, as buyers see it, and the price of it.
  contribution text not null default '',
  share_cents integer not null default 0 check (share_cents between 0 and 50000),
  includes_eggs boolean not null default false,
  -- The host's note with the invitation.
  invite_message text not null default '',
  invited_at timestamptz not null default now(),
  responded_at timestamptz,
  -- The shared-box terms this farm agreed to, word for word, and when and
  -- from where.
  terms_version text,
  agreed_text text,
  agreed_at timestamptz,
  agreed_ip text,
  left_at timestamptz,
  left_reason text,
  primary key (plan_id, farmer_id)
);
create index if not exists csa_plan_farms_farmer on csa_plan_farms (farmer_id);

-- Each partner's answer for each pickup date. A date with no row hasn't been
-- asked about yet.
create table if not exists csa_farm_weeks (
  plan_id uuid not null references csa_plans(id),
  box_date date not null,
  farmer_id uuid not null,
  -- asked: emailed, no answer yet. confirmed: their part is coming. cant:
  -- they said they can't that week. no_reply: they didn't confirm in time, so
  -- their part was left out. missing: the host reported it never arrived.
  status text not null check (status in ('asked', 'confirmed', 'cant', 'no_reply', 'missing')),
  -- How many times they have been emailed about this date (so each email
  -- goes once).
  asks smallint not null default 0,
  note text,
  updated_at timestamptz not null default now(),
  primary key (plan_id, box_date, farmer_id)
);
create index if not exists csa_farm_weeks_farmer on csa_farm_weeks (farmer_id, status, updated_at);

-- How a paid shared box's produce price splits between the farms, so each is
-- paid its own part at pickup.
create table if not exists order_farm_shares (
  order_id uuid not null references orders(id),
  farmer_id uuid not null,
  role text not null check (role in ('host', 'partner')),
  -- This farm's part of the box price.
  share_cents integer not null check (share_cents >= 0),
  -- included: paid at pickup. refunded: it never arrived and the buyer got it
  -- back. substituted: the host filled in, and is paid for it instead.
  status text not null default 'included' check (status in ('included', 'refunded', 'substituted')),
  -- What was transferred at pickup (or as a restocking fee), and the transfer.
  payout_cents integer,
  stripe_transfer_id text,
  created_at timestamptz not null default now(),
  primary key (order_id, farmer_id)
);

alter table csa_plan_farms enable row level security;
alter table csa_farm_weeks enable row level security;
alter table order_farm_shares enable row level security;
