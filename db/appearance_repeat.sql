-- "Where to find us" posts can repeat every week, every other week, or once
-- a month, not only weekly. `repeats_weekly` still says whether a post
-- repeats at all; this says how often:
--   week        every week (what every repeating post so far does)
--   2weeks      every other week
--   month       the same numbered weekday each month, e.g. the 2nd Saturday
--   month_last  the last of that weekday each month
-- Run once in the Supabase SQL editor, before the code that uses it goes
-- live. Safe to run again.

alter table farm_appearances
  add column if not exists repeat_every text not null default 'week'
  check (repeat_every in ('week', '2weeks', 'month', 'month_last'));
