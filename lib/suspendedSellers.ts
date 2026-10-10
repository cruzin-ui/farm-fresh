import type { SupabaseClient } from '@supabase/supabase-js';

// Which of these sellers an admin has suspended. Safe to use in the browser:
// it reads a view that lists suspended sellers' ids and nothing else (see
// db/admin_controls.sql). Pages use it to leave those sellers' listings out.
//
// If the check can't be made, nobody is treated as suspended; checkout makes
// its own check on the server before any money moves.
export async function fetchSuspendedSellerIds(client: SupabaseClient, sellerIds: string[]) {
  const ids = [...new Set(sellerIds.filter(Boolean))];
  if (ids.length === 0) return new Set<string>();

  const { data, error } = await client.from('suspended_sellers').select('seller_id').in('seller_id', ids);
  if (error) return new Set<string>();
  return new Set((data || []).map((row) => row.seller_id as string));
}
