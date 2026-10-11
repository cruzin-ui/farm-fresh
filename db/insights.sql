-- Counts of how far shoppers get through checkout each day, for the Insights
-- section of the admin page. Run this once in the Supabase SQL editor. It is
-- safe to run again.
--
-- Only totals are kept: how many times checkout was opened, how many times
-- Pay was pressed, and how many payments went through. Nothing about who.

create table if not exists daily_counts (
  day date not null,
  name text not null,
  count integer not null default 0,
  primary key (day, name)
);
alter table daily_counts enable row level security;

-- Adds one to today's count for `p_name` (the day is Arizona's).
create or replace function bump_daily_count(p_name text)
returns void
language sql
as $$
  insert into daily_counts (day, name, count)
  values ((now() at time zone 'America/Phoenix')::date, p_name, 1)
  on conflict (day, name) do update set count = daily_counts.count + 1;
$$;

-- Only the server may call it.
revoke all on function bump_daily_count(text) from public, anon, authenticated;
