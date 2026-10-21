-- Resets of a seller's cancellation limits by an admin. A farm in good
-- standing whose cancellations were legitimate (a hailstorm, say) can ask to
-- have the count start again. The limits (the automatic pause, and who can
-- join shared Farm Boxes) then only count cancellations after the latest
-- reset. Nothing is deleted: every cancellation is still recorded on its order,
-- and every reset is kept here. Run this once in the Supabase SQL editor; it is
-- safe to run again.

create table if not exists seller_limit_resets (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null,
  admin_email text not null,
  reason text not null,
  -- The farm's cancellations, all time, when it was reset (for the record).
  cancellations_at_reset integer not null default 0,
  -- True when the reset also lifted an automatic pause.
  lifted_suspension boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists seller_limit_resets_seller on seller_limit_resets (seller_id, created_at desc);

alter table seller_limit_resets enable row level security;
