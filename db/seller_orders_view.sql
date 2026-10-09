-- The view sellers read their orders through (see the Seller Dashboard).
--
-- Sellers used to read the `orders` table directly, which meant a buyer's
-- email address was in the data sent to the seller's browser for every order.
-- This view returns only the signed-in seller's own orders and leaves the
-- buyer's email out until an order has been picked up or closed. The
-- `guest_access_token` column (the secret in an old guest order link) is left
-- out altogether.
--
-- RE-RUN THIS WHOLE FILE in the Supabase SQL editor after adding a column to
-- `orders`. The view is built from the table's columns as they are at that
-- moment, so a column added later is missing from it until it is rebuilt.

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

-- Signed-in users only. The view itself limits each seller to their own orders.
revoke all on public.seller_orders from anon;
grant select on public.seller_orders to authenticated;
