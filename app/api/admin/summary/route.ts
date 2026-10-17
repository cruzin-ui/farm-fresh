import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getRequestAdmin } from '@/lib/apiAuth';
import { alertAdmin } from '@/lib/alerts';
import { FARMER_CANCEL_REASONS } from '@/lib/sellerChanges';

export const dynamic = 'force-dynamic';

const MONTHS_BACK = 6;

// Estimates of what Stripe charges the platform, used to show roughly what
// each farmer nets the platform. They are not read from Stripe: the card rate
// is the standard US one, and Connect's per-payout fees are left out because
// the number of payouts isn't known here.
const CARD_FEE_RATE = 0.029;
const CARD_FEE_FIXED = 0.3;
const CONNECT_ACTIVE_ACCOUNT_FEE = 2;

// Admin-only: per-farmer, per-month sales for the last few months — how much
// each farmer sold, what they were paid, and an estimate of whether the
// platform made or lost money on them that month.
export async function POST(request: Request) {
  try {
    const admin = await getRequestAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: 'Not authorized.' }, { status: 403 });
    }

    const since = new Date();
    since.setUTCDate(1);
    since.setUTCHours(0, 0, 0, 0);
    since.setUTCMonth(since.getUTCMonth() - (MONTHS_BACK - 1));

    const { data: orders, error: ordersError } = await supabaseAdmin
      .from('orders')
      .select('*')
      .in('status', ['completed', 'cancelled'])
      .gte('created_at', since.toISOString())
      .limit(5000);

    if (ordersError) {
      return NextResponse.json({ error: ordersError.message }, { status: 500 });
    }

    // Only orders that paid the farmer something: completed pickups, and
    // no-shows (which pay a restocking fee). Plain cancellations paid nothing.
    const paidOrders = (orders || []).filter(
      // Finished orders that left money with the platform or a farmer: picked
      // up, closed as a no-show, or cancelled by the buyer (the fee is kept).
      (o) => o.status === 'completed' || Number(o.no_show_fee_amount ?? 0) > 0 || Boolean(o.cancelled_by_buyer_at)
    );

    const listingIds = [...new Set(paidOrders.map((o) => o.listing_id).filter(Boolean))];

    const { data: listings } = listingIds.length
      ? await supabaseAdmin.from('produce_listings').select('id, farmer_id').in('id', listingIds)
      : { data: [] as any[] };

    const farmerIds = [...new Set((listings || []).map((l) => l.farmer_id).filter(Boolean))];

    const { data: farmers } = farmerIds.length
      ? await supabaseAdmin.from('seller_profiles').select('id, farm_name').in('id', farmerIds)
      : { data: [] as any[] };

    const farmerIdByListing = new Map((listings || []).map((l) => [l.id, l.farmer_id]));
    const farmNameById = new Map((farmers || []).map((f) => [f.id, f.farm_name]));

    type Row = {
      month: string;
      farmer_id: string;
      farm_name: string;
      orders: number;
      produce_sales: number;
      farmer_paid: number;
      platform_fees: number;
      estimated_card_fees: number;
    };

    const rows = new Map<string, Row>();

    // One card payment can cover several orders (a cart), and Stripe's fixed
    // fee is charged once per payment — so it is split between those orders.
    const ordersPerPayment = new Map<string, number>();
    for (const o of paidOrders) {
      if (o.stripe_payment_intent_id) {
        ordersPerPayment.set(o.stripe_payment_intent_id, (ordersPerPayment.get(o.stripe_payment_intent_id) || 0) + 1);
      }
    }

    for (const o of paidOrders) {
      const farmerId = farmerIdByListing.get(o.listing_id);
      if (!farmerId) continue;

      // Orders are grouped by the month they were placed.
      const month = String(o.created_at).slice(0, 7);
      const key = `${month}|${farmerId}`;

      const buyerPaid = Number(o.total_price ?? 0);
      // Orders from before these columns existed fall back to the buyer total.
      const produceSales = o.subtotal_amount != null ? Number(o.subtotal_amount) : buyerPaid;
      const farmerPaid = o.farmer_payout_amount != null ? Number(o.farmer_payout_amount) : produceSales;
      // Stripe keeps its fee on the original charge even when part is refunded.
      const originallyCharged = buyerPaid + Number(o.refunded_amount ?? 0);

      const row =
        rows.get(key) ||
        ({
          month,
          farmer_id: farmerId,
          farm_name: farmNameById.get(farmerId) || 'Unknown farm',
          orders: 0,
          produce_sales: 0,
          farmer_paid: 0,
          platform_fees: 0,
          estimated_card_fees: 0,
        } as Row);

      row.orders += 1;
      row.produce_sales += produceSales;
      row.farmer_paid += farmerPaid;
      // Sales tax is collected for the state, so it isn't counted as fees.
      row.platform_fees += buyerPaid - farmerPaid - Number(o.tax_amount ?? 0);
      row.estimated_card_fees +=
        originallyCharged * CARD_FEE_RATE + CARD_FEE_FIXED / (ordersPerPayment.get(o.stripe_payment_intent_id) || 1);

      rows.set(key, row);
    }

    const round = (n: number) => Math.round(n * 100) / 100;

    // ---- what refunds cost the platform ----
    // Stripe keeps its card fee when a payment is refunded, so every refunded
    // dollar still cost about 2.9% of it, and an order refunded in full also
    // loses its share of the 30¢. Estimated the same way as above, grouped by
    // why the money went back, for each month.
    const { data: refundedOrders } = await supabaseAdmin
      .from('orders')
      .select('id, created_at, status, cancel_reason, total_price, refunded_amount, stripe_payment_intent_id')
      .gt('refunded_amount', 0)
      .gte('created_at', since.toISOString())
      .limit(5000);
    const perPayment = new Map<string, number>();
    for (const o of refundedOrders || []) {
      if (o.stripe_payment_intent_id) perPayment.set(o.stripe_payment_intent_id, (perPayment.get(o.stripe_payment_intent_id) || 0) + 1);
    }
    const causeOf = (o: { status: string; cancel_reason: string | null }) => {
      if (o.status !== 'cancelled') return 'reduced';
      if (FARMER_CANCEL_REASONS.includes(o.cancel_reason || '')) return 'farm';
      if (o.cancel_reason === 'buyer') return 'buyer';
      if (o.cancel_reason === 'no_show') return 'no_show';
      return 'other';
    };
    const losses = new Map<string, { month: string; cause: string; orders: number; refunded: number; fees: number }>();
    for (const o of refundedOrders || []) {
      const month = String(o.created_at).slice(0, 7);
      const cause = causeOf(o);
      const key = `${month}|${cause}`;
      const refunded = Number(o.refunded_amount || 0);
      const fullyRefunded = Number(o.total_price || 0) < 0.005;
      const entry = losses.get(key) || { month, cause, orders: 0, refunded: 0, fees: 0 };
      entry.orders += 1;
      entry.refunded += refunded;
      entry.fees += refunded * CARD_FEE_RATE + (fullyRefunded ? CARD_FEE_FIXED / (perPayment.get(o.stripe_payment_intent_id) || 1) : 0);
      losses.set(key, entry);
    }
    const refundLosses = [...losses.values()].map((l) => ({ ...l, refunded: round(l.refunded), fees: round(l.fees) }));

    const result = [...rows.values()]
      .map((r) => ({
        ...r,
        produce_sales: round(r.produce_sales),
        farmer_paid: round(r.farmer_paid),
        platform_fees: round(r.platform_fees),
        estimated_card_fees: round(r.estimated_card_fees),
        estimated_net: round(r.platform_fees - r.estimated_card_fees - CONNECT_ACTIVE_ACCOUNT_FEE),
      }))
      .sort((a, b) => b.month.localeCompare(a.month) || b.produce_sales - a.produce_sales);

    return NextResponse.json({ rows: result, refundLosses, connectAccountFee: CONNECT_ACTIVE_ACCOUNT_FEE });
  } catch (err: any) {
    console.error('admin summary error:', err);
    await alertAdmin('admin summary error', err);
    return NextResponse.json({ error: err.message || 'Failed to load summary.' }, { status: 500 });
  }
}
