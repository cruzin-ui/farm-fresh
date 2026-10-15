-- Plants & Seedlings: the details buyers want about a plant, on its listing.
-- Run this once in the Supabase SQL editor. It is safe to run again.
--
-- All four are optional and only used for the "Plants & Seedlings" category;
-- existing listings are left exactly as they are. Listings are still written
-- only by the server, and buyers can read these like the rest of a listing,
-- so no security rules change.

alter table produce_listings add column if not exists pot_size text;
alter table produce_listings add column if not exists sun_needs text;
alter table produce_listings add column if not exists water_needs text;
-- Set when the seller says the plant is native to where it is grown; the state
-- is worked out from the farm's pickup zip code, e.g. "Arizona".
alter table produce_listings add column if not exists native_state text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'produce_listings_sun_needs_check') then
    alter table produce_listings add constraint produce_listings_sun_needs_check
      check (sun_needs is null or sun_needs in ('full_sun', 'part_sun', 'shade'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'produce_listings_water_needs_check') then
    alter table produce_listings add constraint produce_listings_water_needs_check
      check (water_needs is null or water_needs in ('low', 'moderate', 'high'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'produce_listings_pot_size_length') then
    alter table produce_listings add constraint produce_listings_pot_size_length
      check (pot_size is null or char_length(pot_size) <= 40);
  end if;
end $$;
