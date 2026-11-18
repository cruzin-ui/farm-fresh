-- Made-to-order listings (see lib/categories MADE_TO_ORDER_CATEGORIES): for
-- baked goods and jams the seller makes when ordered. Such a listing never
-- sells out and stays on sale until the seller takes it down; its
-- available_quantity is the most one order can be for, so orders don't
-- reduce it and cancellations don't add to it. Additive; safe to run again.
alter table public.produce_listings
  add column if not exists made_to_order boolean not null default false;
