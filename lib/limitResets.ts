import { supabaseAdmin } from '@/lib/supabaseAdmin';

// SERVER-ONLY. An admin can reset a seller's cancellation limits (see
// db/seller_limit_resets.sql): the limits then count only cancellations made
// after the latest reset. Every cancellation and every reset is still kept.

// When this seller's limits were last reset, or null if never.
export async function lastLimitReset(sellerId: string) {
  const { data } = await supabaseAdmin
    .from('seller_limit_resets')
    .select('created_at')
    .eq('seller_id', sellerId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.created_at as string | undefined) || null;
}

// Where a limit starts counting: the start of its window, or the latest
// reset if that is later.
export async function countSince(sellerId: string, windowDays: number) {
  const windowStart = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
  const reset = await lastLimitReset(sellerId);
  return reset && reset > windowStart ? reset : windowStart;
}
