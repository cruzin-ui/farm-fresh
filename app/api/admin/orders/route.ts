import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getRequestAdmin } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

// Admin-only: every recent order across all farmers, with the buyer, farmer,
// money and pickup-code details needed to support a transaction.
export async function POST(request: Request) {
  try {
    const admin = await getRequestAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: 'Not authorized.' }, { status: 403 });
    }

    const { data: orders, error: ordersError } = await supabaseAdmin
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);

    if (ordersError) {
      return NextResponse.json({ error: ordersError.message }, { status: 500 });
    }

    const listingIds = [...new Set((orders || []).map((o) => o.listing_id).filter(Boolean))];
    const orderIds = (orders || []).map((o) => o.id);

    const { data: listings } = listingIds.length
      ? await supabaseAdmin
          .from('produce_listings')
          .select('id, title, unit_type, farmer_id')
          .in('id', listingIds)
      : { data: [] as any[] };

    const farmerIds = [...new Set((listings || []).map((l) => l.farmer_id).filter(Boolean))];

    const { data: farmers } = farmerIds.length
      ? await supabaseAdmin.from('seller_profiles').select('id, farm_name').in('id', farmerIds)
      : { data: [] as any[] };

    const { data: codes } = orderIds.length
      ? await supabaseAdmin
          .from('order_pickup_codes')
          .select('order_id, code, failed_attempts')
          .in('order_id', orderIds)
      : { data: [] as any[] };

    const listingById = new Map((listings || []).map((l) => [l.id, l]));
    const farmNameById = new Map((farmers || []).map((f) => [f.id, f.farm_name]));
    const codeByOrderId = new Map((codes || []).map((c) => [c.order_id, c]));

    const result = (orders || []).map((o) => {
      const listing = listingById.get(o.listing_id);
      const code = codeByOrderId.get(o.id);

      return {
        id: o.id,
        created_at: o.created_at,
        status: o.status,
        buyer_email: o.buyer_email,
        listing_title: listing?.title || 'Unknown listing',
        unit_type: listing?.unit_type || 'units',
        farm_name: (listing && farmNameById.get(listing.farmer_id)) || 'Unknown farm',
        quantity: Number(o.reserved_quantity ?? o.quantity ?? 0),
        total_price: Number(o.total_price ?? 0),
        refunded_amount: Number(o.refunded_amount ?? 0),
        paid_via_stripe: Boolean(o.stripe_payment_intent_id),
        payout_released: Boolean(o.stripe_transfer_id),
        stripe_payment_intent_id: o.stripe_payment_intent_id || null,
        pickup_code: code?.code || o.pickup_code || o.verification_code || null,
        failed_code_attempts: Number(code?.failed_attempts ?? 0),
        no_show_reported_at: o.no_show_reported_at || null,
      };
    });

    return NextResponse.json({ orders: result });
  } catch (err: any) {
    console.error('admin orders error:', err);
    return NextResponse.json({ error: err.message || 'Failed to load orders.' }, { status: 500 });
  }
}
