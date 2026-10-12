import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getRequestAdmin } from '@/lib/apiAuth';
import { alertAdmin } from '@/lib/alerts';
import { listBlocks } from '@/lib/accountBlocks';
import { hasOpenDispute } from '@/lib/orderActions';

export const dynamic = 'force-dynamic';

const cents = (value: unknown) => Math.round(Number(value || 0) * 100);

// Admin-only: each buyer's track record, the counterpart of the Sellers
// section. It shows up patterns no single order reveals: a buyer who keeps
// not turning up, cancels a lot, reports a problem on most orders, or whose
// payments get disputed. `flags` lists the patterns worth a closer look.
//
// A buyer is whoever placed orders under one email address, whether signed in
// or as a guest, so someone who did both is one row. "Orders" are checkouts;
// the other counts are of items, since each item is cancelled, collected or
// complained about on its own.
export async function POST(request: Request) {
  try {
    const admin = await getRequestAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: 'Not authorized.' }, { status: 403 });
    }

    const { data: orders, error } = await supabaseAdmin
      .from('orders')
      .select(
        'id, checkout_id, buyer_id, buyer_email, status, created_at, cancel_reason, cancelled_by_buyer_at, no_show_fee_amount, buyer_problem_at, dispute_status, stripe_dispute_id, total_price, refunded_amount'
      )
      .order('created_at', { ascending: false })
      .limit(20000);
    if (error) throw error;

    type Row = {
      key: string;
      email: string | null;
      has_account: boolean;
      ordered_as_guest: boolean;
      block_id: string | null;
      block_reason: string | null;
      orders: number;
      items: number;
      open: number;
      picked_up: number;
      buyer_cancelled: number;
      cancelled_late: number;
      no_shows: number;
      problems: number;
      disputes: number;
      spent_cents: number;
      refunded_cents: number;
      first_order_at: string;
      last_order_at: string;
      flags: string[];
    };

    const rows = new Map<string, Row>();
    const checkoutsOf = new Map<string, Set<string>>();
    const buyerIdsOf = new Map<string, Set<string>>();

    for (const o of orders || []) {
      const email = String(o.buyer_email || '').trim().toLowerCase();
      const key = email || (o.buyer_id as string) || '';
      if (!key) continue;

      const row =
        rows.get(key) ||
        ({
          key,
          email: email || null,
          has_account: false,
          ordered_as_guest: false,
          block_id: null,
          block_reason: null,
          orders: 0,
          items: 0,
          open: 0,
          picked_up: 0,
          buyer_cancelled: 0,
          cancelled_late: 0,
          no_shows: 0,
          problems: 0,
          disputes: 0,
          spent_cents: 0,
          refunded_cents: 0,
          first_order_at: o.created_at,
          last_order_at: o.created_at,
          flags: [],
        } as Row);

      if (o.buyer_id) {
        row.has_account = true;
        buyerIdsOf.set(key, (buyerIdsOf.get(key) || new Set<string>()).add(o.buyer_id));
      } else {
        row.ordered_as_guest = true;
      }

      checkoutsOf.set(key, (checkoutsOf.get(key) || new Set<string>()).add(o.checkout_id || o.id));
      row.items += 1;
      if (o.created_at < row.first_order_at) row.first_order_at = o.created_at;
      if (o.created_at > row.last_order_at) row.last_order_at = o.created_at;

      if (o.status === 'pending_pickup' || o.status === 'ready_for_pickup') row.open += 1;
      if (o.status === 'completed') row.picked_up += 1;
      if (o.status === 'cancelled') {
        // A buyer's own cancellation, not one the farmer's change or lateness led to.
        if (o.cancel_reason === 'buyer') {
          row.buyer_cancelled += 1;
          if (Number(o.no_show_fee_amount ?? 0) > 0) row.cancelled_late += 1;
        } else if (o.cancel_reason === 'no_show' || (!o.cancel_reason && Number(o.no_show_fee_amount ?? 0) > 0)) {
          row.no_shows += 1;
        }
      }
      if (o.buyer_problem_at) row.problems += 1;
      if (o.stripe_dispute_id || hasOpenDispute(o)) row.disputes += 1;

      // What they have paid that hasn't been given back.
      row.spent_cents += cents(o.total_price);
      row.refunded_cents += cents(o.refunded_amount);

      rows.set(key, row);
    }

    const blocks = (await listBlocks().catch(() => [])).filter((b) => b.scope === 'buyer');

    for (const row of rows.values()) {
      row.orders = checkoutsOf.get(row.key)?.size || 0;

      const ids = buyerIdsOf.get(row.key) || new Set<string>();
      const block = blocks.find(
        (b) => (b.user_id && ids.has(b.user_id)) || (row.email && (b.email || '').toLowerCase() === row.email)
      );
      row.block_id = block?.id || null;
      row.block_reason = block?.reason || null;

      const closed = row.picked_up + row.no_shows + row.buyer_cancelled;
      if (row.disputes >= 1) row.flags.push(`${row.disputes} payment dispute${row.disputes === 1 ? '' : 's'}`);
      if (row.no_shows >= 2) row.flags.push(`${row.no_shows} items not picked up`);
      if (row.buyer_cancelled >= 3 && row.buyer_cancelled / closed >= 0.3) {
        row.flags.push(`cancelled ${row.buyer_cancelled} of ${closed} items`);
      }
      if (row.problems >= 2 && row.problems / row.items >= 0.3) {
        row.flags.push(`reported a problem on ${row.problems} of ${row.items} items`);
      }
    }

    // Flagged buyers first, then the most recent.
    const buyers = [...rows.values()].sort(
      (a, b) => b.flags.length - a.flags.length || b.last_order_at.localeCompare(a.last_order_at)
    );

    return NextResponse.json({ buyers });
  } catch (err: any) {
    console.error('admin buyers error:', err);
    await alertAdmin('admin buyers error', err);
    return NextResponse.json({ error: err.message || 'Failed to load buyers.' }, { status: 500 });
  }
}
