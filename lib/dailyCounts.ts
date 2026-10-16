import { supabaseAdmin } from '@/lib/supabaseAdmin';

// SERVER-ONLY. Keeps daily tallies (see db/insights.sql) for the admin page:
// how far shoppers get through checkout, and how many visits and page views
// the site gets. Only totals are kept; nothing identifies anyone.

// The three steps, in order.
export const CHECKOUT_STEPS = ['checkout_opened', 'payment_started', 'payment_completed'] as const;
export type CheckoutStep = (typeof CHECKOUT_STEPS)[number];

// Adds one to today's count. Never throws: a tally must not get in the way of
// a sale.
export async function bumpDailyCount(name: CheckoutStep | 'visit' | `page:${string}` | `scan:${string}`) {
  try {
    const { error } = await supabaseAdmin.rpc('bump_daily_count', { p_name: name });
    if (error) console.error('Could not count a checkout step:', error.message);
  } catch (err) {
    console.error('Could not count a checkout step:', err);
  }
}
