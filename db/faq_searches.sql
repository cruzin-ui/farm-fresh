-- FAQ searches that found no answer, for the Insights section of the admin
-- page, so the missing answers can be added. Run this once in the Supabase
-- SQL editor. It is safe to run again.
--
-- Only the words searched are kept, with how often and when. Nothing about
-- who searched. Searches that look like an email address or a phone, order or
-- card number are never sent (see lib/faqSearch.ts).

create table if not exists faq_missed_searches (
  query text primary key,
  searches integer not null default 1,
  -- How many near matches the search showed instead. 0: nothing at all.
  closest integer not null default 0,
  first_searched_at timestamptz not null default now(),
  last_searched_at timestamptz not null default now()
);
alter table faq_missed_searches enable row level security;

-- Records one search. Searches not repeated for 180 days are cleared out, and
-- once 2,000 different searches are on file new ones are ignored, so the
-- table can't be flooded.
create or replace function record_faq_missed_search(p_query text, p_closest integer)
returns void
language plpgsql
as $$
begin
  delete from faq_missed_searches where last_searched_at < now() - interval '180 days';

  update faq_missed_searches
     set searches = searches + 1, closest = p_closest, last_searched_at = now()
   where query = p_query;
  if found then return; end if;

  if (select count(*) from faq_missed_searches) >= 2000 then return; end if;
  insert into faq_missed_searches (query, closest) values (p_query, p_closest)
  on conflict (query) do update set searches = faq_missed_searches.searches + 1, last_searched_at = now();
end;
$$;

-- Only the server may call it.
revoke all on function record_faq_missed_search(text, integer) from public, anon, authenticated;
