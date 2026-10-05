import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getRequestAdmin } from '@/lib/apiAuth';
import { alertAdmin } from '@/lib/alerts';

export const dynamic = 'force-dynamic';

// The same estimate the monthly summary uses: the standard US card rate. Not
// read from Stripe — Stripe's own reports have the exact fees.
const CARD_FEE_RATE = 0.029;
const CARD_FEE_FIXED = 0.3;

const round = (n: number) => Math.round(n * 100) / 100;

// Admin-only: every order placed in a given month, one row per order, with
// the money broken out — for bookkeeping and for handing to an accountant.
// Orders are assigned to the month they were placed in, matching the summary
// on the admin page.
export async function POST(request: Request) {
  try {
    const admin = await getRequestAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: 'Not authorized.' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const month = typeof body.month === 'string' ? body.month : '';

    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return NextResponse.json({ error: 'Choose a month.' }, { status: 400 });
    }

    const [year, monthNumber] = month.split('-').map(Number);
    const start = new Date(Date.UTC(year, monthNumber - 1, 1));
    const end = new Date(Date.UTC(year, monthNumber, 1));

    const { data: orders, error: ordersError } = await supabaseAdmin
      .from('orders')
      .select('*')
      .gte('created_at', start.toISOString())
      .lt('created_at', end.toISOString())
      .order('created_at', { ascending: true })
      .limit(10000);

    if (ordersError) {
      return NextResponse.json({ error: ordersError.message }, { status: 500 });
    }

    const listingIds = [...new Set((orders || []).map((o) => o.listing_id).filter(Boolean))];

    const { data: listings } = listingIds.length
      ? await supabaseAdmin
          .from('produce_listings')
          .select('id, title, variety, category, unit_type, farmer_id, location_name, zip_code')
          .in('id', listingIds)
      : { data: [] as any[] };

    const farmerIds = [...new Set((listings || []).map((l) => l.farmer_id).filter(Boolean))];

    const { data: farmers } = farmerIds.length
      ? await supabaseAdmin.from('seller_profiles').select('id, farm_name').in('id', farmerIds)
      : { data: [] as any[] };

    const listingById = new Map((listings || []).map((l) => [l.id, l]));
    const farmNameById = new Map((farmers || []).map((f) => [f.id, f.farm_name]));

    // One card payment can cover several orders (a cart), and Stripe's fixed
    // fee is charged once per payment — so it is split between those orders.
    const ordersPerPayment = new Map<string, number>();
    for (const o of orders || []) {
      if (o.stripe_payment_intent_id) {
        ordersPerPayment.set(o.stripe_payment_intent_id, (ordersPerPayment.get(o.stripe_payment_intent_id) || 0) + 1);
      }
    }

    const rows = (orders || []).map((o) => {
      const listing = listingById.get(o.listing_id);
      const buyerPaid = Number(o.total_price ?? 0);
      const taxCollected = Number(o.tax_amount ?? 0);
      const refunded = Number(o.refunded_amount ?? 0);
      const noShowFee = Number(o.no_show_fee_amount ?? 0);
      const completed = o.status === 'completed';

      // What has actually gone to the farmer so far: their payout on a
      // completed order, the restocking fee on a no-show, nothing otherwise.
      const paidToFarmer = completed
        ? Number(o.farmer_payout_amount ?? o.subtotal_amount ?? buyerPaid)
        : noShowFee;

      const settled = completed || o.status === 'cancelled';
      // Stripe keeps its fee on the original charge even when part is refunded.
      const estimatedCardFee = o.stripe_payment_intent_id
        ? round(
            (buyerPaid + refunded) * CARD_FEE_RATE +
              CARD_FEE_FIXED / (ordersPerPayment.get(o.stripe_payment_intent_id) || 1)
          )
        : 0;

      return {
        order_id: o.id,
        order_date: String(o.created_at).slice(0, 10),
        status: noShowFee > 0 ? 'no_show' : o.status,
        farm: (listing && farmNameById.get(listing.farmer_id)) || '',
        buyer_email: o.buyer_email || '',
        item: listing ? [listing.title, listing.variety].filter(Boolean).join(' - ') : '',
        category: listing?.category || '',
        quantity: Number(o.reserved_quantity ?? o.quantity ?? 0),
        unit: listing?.unit_type || '',
        pickup_city: listing?.location_name || '',
        pickup_zip: listing?.zip_code || '',
        produce_subtotal: o.subtotal_amount != null ? round(Number(o.subtotal_amount)) : '',
        buyer_paid_after_refunds: round(buyerPaid),
        refunded_to_buyer: round(refunded),
        paid_to_farmer: round(paidToFarmer),
        // Only meaningful once the order is finished; an open order's money is still held.
        // Held for the state, not income: kept out of the fees column.
        sales_tax_collected: round(taxCollected),
        platform_fees_kept: settled ? round(buyerPaid - paidToFarmer - taxCollected) : '',
        estimated_card_fee: estimatedCardFee,
        payout_released: o.stripe_transfer_id ? 'yes' : 'no',
        stripe_payment_id: o.stripe_payment_intent_id || '',
        // The same for every order paid for together in one cart.
        checkout_id: o.checkout_id || '',
      };
    });

    return NextResponse.json({ month, rows });
  } catch (err: any) {
    console.error('admin report error:', err);
    await alertAdmin('admin report error', err);
    return NextResponse.json({ error: err.message || 'Failed to build the report.' }, { status: 500 });
  }
}
