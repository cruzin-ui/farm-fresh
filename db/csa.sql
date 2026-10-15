-- CSA farm shares: a farm offers a box on a set day each week (or every two
-- weeks) through a season, and members pay for each box with a card they
-- saved when they joined. Run this once in the Supabase SQL editor. It is safe
-- to run again.
--
-- Each box that is paid for becomes an ordinary order, placed on a hidden
-- listing that belongs to the plan (category 'CSA Box', never shown in the
-- shop), so pickup codes, the Pick List, payouts, refunds and cancellations
-- all work for boxes exactly as they do for everything else.
--
-- Card details never reach this database: Stripe keeps them, and only Stripe's
-- reference numbers are stored here. Every table is read and written by the
-- server alone, so row level security is on with no policies.

-- The Stripe customer that holds a buyer's saved card.
create table if not exists buyer_stripe_customers (
  user_id uuid primary key,
  stripe_customer_id text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists csa_plans (
  id uuid primary key default gen_random_uuid(),
  farmer_id uuid not null,
  -- The hidden listing each box's order is placed on.
  listing_id uuid not null unique references produce_listings(id),
  name text not null,
  description text not null default '',
  -- The price of one box. Members pay the price they agreed to when joining.
  price_cents integer not null check (price_cents between 500 and 50000),
  frequency text not null default 'weekly' check (frequency in ('weekly', 'biweekly')),
  -- 0 = Sunday … 6 = Saturday.
  pickup_weekday smallint not null check (pickup_weekday between 0 and 6),
  pickup_window text not null default '',
  season_start date not null,
  season_end date not null,
  max_members integer check (max_members is null or max_members between 1 and 1000),
  -- open: taking members. closed: no new members, boxes carry on. ended: no
  -- more boxes for anyone.
  status text not null default 'open' check (status in ('open', 'closed', 'ended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (season_end >= season_start)
);
create index if not exists csa_plans_farmer on csa_plans (farmer_id);

create table if not exists csa_members (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references csa_plans(id),
  -- Empty once the member deletes their account.
  buyer_id uuid,
  buyer_email text not null,
  status text not null default 'active' check (status in ('active', 'paused', 'cancelled')),
  price_cents integer not null,
  stripe_customer_id text not null,
  stripe_payment_method_id text not null,
  -- e.g. "Visa ending 4242", for showing the member which card is used.
  card_label text not null default '',
  -- The recurring-payment agreement, word for word, and when and from where
  -- the member agreed to it.
  terms_version text not null,
  agreed_text text not null,
  agreed_at timestamptz not null,
  agreed_ip text,
  cancelled_at timestamptz,
  cancel_reason text,
  created_at timestamptz not null default now()
);
-- One live membership per buyer per plan.
create unique index if not exists csa_members_one_live
  on csa_members (plan_id, buyer_id) where status <> 'cancelled';
create index if not exists csa_members_buyer on csa_members (buyer_id);
create index if not exists csa_members_plan on csa_members (plan_id);

-- What happened to each member's box on each pickup date. A date with no row
-- is simply still to come.
create table if not exists csa_boxes (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references csa_members(id),
  plan_id uuid not null references csa_plans(id),
  box_date date not null,
  -- reminded: the reminder email has gone. skipped: the member skipped it.
  -- charging: a charge is under way. paid: charged, and its order exists.
  -- failed: the card was declined (retried until the cutoff). farm_skipped:
  -- the farm called the week off, or couldn't be paid that week.
  status text not null check (status in ('reminded', 'skipped', 'charging', 'paid', 'failed', 'farm_skipped')),
  attempts integer not null default 0,
  last_error text,
  payment_intent_id text,
  order_id uuid,
  reminder_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (member_id, box_date)
);
create index if not exists csa_boxes_plan_date on csa_boxes (plan_id, box_date);

-- The farm's note for each pickup date ("This week: kale, carrots…") and
-- whether the farm has called that week off.
create table if not exists csa_box_weeks (
  plan_id uuid not null references csa_plans(id),
  box_date date not null,
  note text not null default '',
  skipped boolean not null default false,
  skip_reason text,
  updated_at timestamptz not null default now(),
  primary key (plan_id, box_date)
);

alter table buyer_stripe_customers enable row level security;
alter table csa_plans enable row level security;
alter table csa_members enable row level security;
alter table csa_boxes enable row level security;
alter table csa_box_weeks enable row level security;
