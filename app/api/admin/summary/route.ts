import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getRequestAdmin } from '@/lib/apiAuth';

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
      (o) => o.status === 'completed' || Number(o.no_show_fee_amount ?? 0) > 0
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
      row.platform_fees += buyerPaid - farmerPaid;
      row.estimated_card_fees += originallyCharged * CARD_FEE_RATE + CARD_FEE_FIXED;

      rows.set(key, row);
    }

    const round = (n: number) => Math.round(n * 100) / 100;

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

    return NextResponse.json({ rows: result, connectAccountFee: CONNECT_ACTIVE_ACCOUNT_FEE });
  } catch (err: any) {
    console.error('admin summary error:', err);
    return NextResponse.json({ error: err.message || 'Failed to load summary.' }, { status: 500 });
  }
}
