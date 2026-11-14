-- Cottage foods: jams, preserves and baked goods made in a home kitchen under
-- Arizona's cottage food program (see lib/categories and lib/cottageFood).

-- The farm's registration number, shown to buyers on those listings (it must
-- be on the label anyway). Written only by the server, from the registration
-- below; public like the rest of the farm profile.
alter table public.seller_profiles
  add column if not exists cottage_food_reg text
  check (cottage_food_reg is null or char_length(cottage_food_reg) between 3 and 30);

-- The registration itself: the number and the farm's uploaded registration
-- certificate, for an admin to spot-check. A farm can list cottage foods only
-- while it has one. Server-only: RLS on and no policies, so the browser can't
-- read or change it.
create table if not exists public.cottage_food_registrations (
  farmer_id uuid primary key references auth.users (id) on delete cascade,
  reg_number text not null check (char_length(reg_number) between 3 and 30),
  -- Where the certificate is, in the private cottage-food-certificates bucket.
  file_path text not null,
  submitted_at timestamptz not null default now()
);
alter table public.cottage_food_registrations enable row level security;

-- Private storage for the certificate files. The server hands an admin a link
-- that expires.
insert into storage.buckets (id, name, public)
values ('cottage-food-certificates', 'cottage-food-certificates', false)
on conflict (id) do update set public = false;
