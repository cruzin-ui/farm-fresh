import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getRequestAdmin } from '@/lib/apiAuth';
import { alertAdmin } from '@/lib/alerts';
import { loadSellerRecords } from '@/lib/sellerRecords';

export const dynamic = 'force-dynamic';

const cents = (value: unknown) => Math.round(Number(value || 0) * 100);

// Admin-only: one seller's track record, contact details and money totals,
// for the admin panel shown at the top of their farm page. Anyone who isn't an
// admin is refused, so the panel simply doesn't appear for them.
export async function POST(request: Request) {
  try {
    const admin = await getRequestAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: 'Not authorized.' }, { status: 403 });
    }

    const { sellerId } = await request.json().catch(() => ({}));
    if (typeof sellerId !== 'string' || !sellerId) {
      return NextResponse.json({ error: 'Missing seller.' }, { status: 400 });
    }

    const record = (await loadSellerRecords()).find((seller) => seller.farmer_id === sellerId);
    if (!record) return NextResponse.json({ error: 'Seller not found.' }, { status: 404 });

    const { data: sellerUser } = await supabaseAdmin.auth.admin.getUserById(sellerId);

    // What they have sold, been paid, and earned us, from picked-up orders;
    // plus any restocking fees paid to them on orders that weren't.
    const { data: listings } = await supabaseAdmin.from('produce_listings').select('id').eq('farmer_id', sellerId);
    const listingIds = (listings || []).map((l) => l.id);
    const { data: orders } = listingIds.length
      ? await supabaseAdmin
          .from('orders')
          .select('status, subtotal_amount, total_price, tax_amount, farmer_payout_amount, no_show_fee_amount')
          .in('listing_id', listingIds)
          .limit(20000)
      : { data: [] as any[] };

    let produceCents = 0;
    let paidOutCents = 0;
    let feesCents = 0;
    for (const order of orders || []) {
      if (order.status === 'completed') {
        const subtotal = cents(order.subtotal_amount);
        const payout = cents(order.farmer_payout_amount);
        produceCents += subtotal;
        paidOutCents += payout;
        if (subtotal > 0) {
          feesCents += Math.max(0, cents(order.total_price) - subtotal - cents(order.tax_amount));
          if (order.farmer_payout_amount != null) feesCents += Math.max(0, subtotal - payout);
        }
      } else if (order.status === 'cancelled') {
        paidOutCents += cents(order.no_show_fee_amount);
      }
    }

    return NextResponse.json({
      seller: {
        ...record,
        email: sellerUser?.user?.email || null,
        joined_at: sellerUser?.user?.created_at || null,
        produce_cents: produceCents,
        paid_out_cents: paidOutCents,
        fees_cents: feesCents,
      },
    });
  } catch (err: any) {
    console.error('admin seller error:', err);
    await alertAdmin('admin seller error', err);
    return NextResponse.json({ error: err.message || 'Failed to load this seller.' }, { status: 500 });
  }
}
