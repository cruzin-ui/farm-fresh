import { supabaseAdmin } from '@/lib/supabaseAdmin';

// SERVER-ONLY. Sellers an admin has suspended and buyers an admin has blocked
// (see db/admin_controls.sql).
//
// A suspended seller's listings are hidden from buyers, can't be bought, and
// they can't post new ones. A blocked buyer can't check out. Both are lifted
// from the admin page.
//
// The checks answer "no" if they can't be made (a database fault, or the
// table not being there yet), so a problem here never stops honest trade.

export type AccountBlock = {
  id: string;
  scope: 'seller' | 'buyer';
  user_id: string | null;
  email: string | null;
  reason: string | null;
  created_by: string | null;
  created_at: string;
};

export async function isSellerSuspended(sellerId: string) {
  const { data, error } = await supabaseAdmin
    .from('account_blocks')
    .select('id')
    .eq('scope', 'seller')
    .eq('user_id', sellerId)
    .limit(1);
  if (error) {
    console.error('Could not check whether a seller is suspended:', error.message);
    return false;
  }
  return (data || []).length > 0;
}

export async function suspendedSellerIds(sellerIds: string[]) {
  if (sellerIds.length === 0) return new Set<string>();
  const { data, error } = await supabaseAdmin
    .from('account_blocks')
    .select('user_id')
    .eq('scope', 'seller')
    .in('user_id', sellerIds);
  if (error) {
    console.error('Could not check which sellers are suspended:', error.message);
    return new Set<string>();
  }
  return new Set((data || []).map((row) => row.user_id as string));
}

// A buyer is blocked by their account, by their email address, or both. A
// guest has only the email.
export async function isBuyerBlocked(buyer: { userId?: string | null; email?: string | null }) {
  const email = (buyer.email || '').trim().toLowerCase();
  if (!buyer.userId && !email) return false;

  const { data, error } = await supabaseAdmin.from('account_blocks').select('user_id, email').eq('scope', 'buyer');
  if (error) {
    console.error('Could not check whether a buyer is blocked:', error.message);
    return false;
  }
  return (data || []).some(
    (row) =>
      (buyer.userId && row.user_id === buyer.userId) || (email && (row.email || '').trim().toLowerCase() === email)
  );
}

export async function listBlocks(): Promise<AccountBlock[]> {
  const { data, error } = await supabaseAdmin
    .from('account_blocks')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as AccountBlock[];
}
