-- Wholesale: farms can offer a listing by the case to approved businesses
-- (restaurants, grocers, co-ops, caterers, florists), at a lower buyer fee. A
-- business applies once from its account page and an admin approves it. A
-- business that resells can also upload an Arizona resale certificate (Form
-- 5000A) with its expiration date; once an admin approves it, that business's
-- wholesale purchases are tax-exempt until the certificate expires.
--
-- Everything here is read and written by the server only (row level security
-- is on with no policies), so wholesale prices are never readable by the
-- public, and certificates are only ever seen by admins. Run this once in the
-- Supabase SQL editor; it is safe to run again.

-- A listing's wholesale offer: sold by the case, out of the same stock as the
-- retail listing. A case is a whole number of the listing's units.
create table if not exists listing_wholesale_offers (
  listing_id uuid primary key references produce_listings (id) on delete cascade,
  case_size integer not null check (case_size between 2 and 10000),
  case_price numeric(10, 2) not null check (case_price > 0 and case_price <= 100000),
  min_cases integer not null default 1 check (min_cases between 1 and 1000),
  updated_at timestamptz not null default now()
);
alter table listing_wholesale_offers enable row level security;

-- A business's application for wholesale prices. One per account.
create table if not exists wholesale_accounts (
  user_id uuid primary key,
  business_name text not null,
  business_type text not null,
  business_address text not null,
  phone text not null,
  -- pending, approved or declined.
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  decline_reason text,
  applied_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by text
);
create index if not exists wholesale_accounts_status on wholesale_accounts (status, applied_at);
alter table wholesale_accounts enable row level security;

-- Every resale certificate a business has uploaded. Kept, with who approved
-- it, as the record behind each tax-exempt sale, even after it expires or is
-- replaced (and even if the business later closes its account).
create table if not exists wholesale_certificates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  -- The business it was issued to, as it stood when uploaded.
  business_name text not null,
  -- Where the file is, in the private resale-certificates storage bucket.
  file_path text not null,
  expires_on date not null,
  -- pending, approved, declined, or replaced (a newer one was uploaded first).
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'replaced')),
  decline_reason text,
  uploaded_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by text,
  -- When the business was emailed that it is about to expire.
  reminded_at timestamptz
);
create index if not exists wholesale_certificates_user on wholesale_certificates (user_id, uploaded_at desc);
create index if not exists wholesale_certificates_status on wholesale_certificates (status, expires_on);
alter table wholesale_certificates enable row level security;

-- On each order bought wholesale: how many cases, and how big each was. The
-- order's quantity is always in the listing's own units (cases x case size),
-- so stock, refunds and pick lists work as for any order.
alter table orders add column if not exists wholesale_cases integer;
alter table orders add column if not exists wholesale_case_size integer;
-- The resale certificate that made this order tax-exempt, if one did.
alter table orders add column if not exists tax_exempt_certificate_id uuid;

-- Private storage for the certificate files. Not public: the server hands an
-- admin a link that expires after a few minutes.
insert into storage.buckets (id, name, public)
values ('resale-certificates', 'resale-certificates', false)
on conflict (id) do update set public = false;
