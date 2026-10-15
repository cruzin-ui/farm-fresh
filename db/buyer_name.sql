-- The buyer's name on each order, so the farmer can label the bag. Run this
-- whole file once in the Supabase SQL editor. It is safe to run again.
--
-- Signed-in buyers can add an optional name to their account; it is copied
-- onto each order when the order is placed, so the farmer sees who it is for.
-- Orders placed before this, and guest orders, have no name.

alter table orders add column if not exists buyer_name text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'orders_buyer_name_length') then
    alter table orders add constraint orders_buyer_name_length
      check (buyer_name is null or char_length(buyer_name) <= 60);
  end if;
end $$;

-- Rebuilds the view sellers read their orders through (the same as
-- db/seller_orders_view.sql), so it includes the new column. The farmer sees
-- the buyer's name; the buyer's email stays hidden until the order is closed.
do $$
declare
  cols text;
begin
  select string_agg(format('o.%I', column_name), ', ' order by ordinal_position)
    into cols
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'orders'
     and column_name not in ('buyer_email', 'guest_access_token');

  execute 'drop view if exists public.seller_orders';
  execute format(
    'create view public.seller_orders as
       select %s,
              case when o.status in (''completed'', ''cancelled'') then o.buyer_email end as buyer_email
         from public.orders o
         join public.produce_listings l on l.id = o.listing_id
        where l.farmer_id = auth.uid()',
    cols
  );
end $$;

revoke all on public.seller_orders from anon;
grant select on public.seller_orders to authenticated;
