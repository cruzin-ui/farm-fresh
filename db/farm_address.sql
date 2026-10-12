-- A farm's own web address: farmfreshdirect.online/<name>. Run this once in
-- the Supabase SQL editor. It is safe to run again.
--
-- Three rules are enforced here, in the database, so they hold however the
-- address is written:
--   1. it is lower-case letters, numbers and hyphens, 3 to 30 characters;
--   2. no two farms can have the same one;
--   3. only the server can set or change it. A seller chooses theirs through
--      the site, which checks it against the reserved names and sets it once;
--      after that only an admin can change it.

alter table seller_profiles add column if not exists slug text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'seller_profiles_slug_format') then
    alter table seller_profiles
      add constraint seller_profiles_slug_format
      check (slug is null or (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 30));
  end if;
end $$;

create unique index if not exists seller_profiles_slug_unique
  on seller_profiles (slug) where slug is not null;

create or replace function guard_farm_address()
returns trigger
language plpgsql
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.slug is not null then
      raise exception 'A farm web address can only be set through the site.';
    end if;
  elsif new.slug is distinct from old.slug then
    raise exception 'A farm web address can only be set through the site, and cannot be changed once it is set.';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_farm_address on seller_profiles;
create trigger guard_farm_address
  before insert or update on seller_profiles
  for each row execute function guard_farm_address();
