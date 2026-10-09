import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getPickupCodeRecord } from '@/lib/pickupCodes';
import { alertAdmin } from '@/lib/alerts';

export const dynamic = 'force-dynamic';

function tokensMatch(a: string, b: string) {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  return bufferA.length === bufferB.length && timingSafeEqual(bufferA, bufferB);
}

// Lets a guest (someone who checked out without an account) view their order.
// There is no session to check, so access is granted by the order's secret
// access token, which the guest gets on the confirmation page and in the link
// in their confirmation email. The link names one order; everything bought in
// the same checkout is returned with it, since it was all one purchase.
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { orderId, token } = body;

    if (!orderId || typeof token !== 'string' || !token) {
      return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    }

    const { data: order } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .maybeSingle();

    if (!order) {
      return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    }

    const codeRecord = await getPickupCodeRecord(order.id);
    // Older guest orders kept their token on the order row.
    const expectedToken = codeRecord?.guestToken || order.guest_access_token;

    if (!expectedToken || !tokensMatch(expectedToken, token)) {
      return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    }

    let checkoutOrders: any[] = [order];
    if (order.checkout_id) {
      const { data: siblings } = await supabaseAdmin
        .from('orders')
        .select('*')
        .eq('checkout_id', order.checkout_id)
        .order('created_at', { ascending: true });
      if (siblings?.length) checkoutOrders = siblings;
    }

    const orderIds = checkoutOrders.map((o) => o.id);
    const listingIds = [...new Set(checkoutOrders.map((o) => o.listing_id).filter(Boolean))];

    const { data: listings } = await supabaseAdmin
      .from('produce_listings')
      .select('id, title, unit_type, location_name, zip_code, farmer_id')
      .in('id', listingIds);
    const listingById = new Map((listings || []).map((l) => [l.id, l]));

    const farmerIds = [...new Set((listings || []).map((l) => l.farmer_id).filter(Boolean))];
    const { data: profiles } = farmerIds.length
      ? await supabaseAdmin.from('seller_profiles').select('id, farm_name').in('id', farmerIds)
      : { data: [] as any[] };
    const farmNameById = new Map((profiles || []).map((p: any) => [p.id, p.farm_name]));

    const { data: codeRows } = await supabaseAdmin
      .from('order_pickup_codes')
      .select('order_id, code, guest_access_token')
      .in('order_id', orderIds);
    const codeRowByOrderId = new Map((codeRows || []).map((c) => [c.order_id, c]));

    const { data: reviewRows } = await supabaseAdmin.from('seller_reviews').select('order_id').in('order_id', orderIds);
    const reviewedOrderIds = new Set((reviewRows || []).map((r) => r.order_id));

    const orders = checkoutOrders
      // Belt and braces: only items carrying this same token.
      .filter((o) => o.id === order.id || codeRowByOrderId.get(o.id)?.guest_access_token === expectedToken)
      .map((o) => {
        const listing = listingById.get(o.listing_id);
        return {
          id: o.id,
          checkout_id: o.checkout_id || null,
          status: o.status,
          created_at: o.created_at,
          quantity: Number(o.reserved_quantity ?? o.quantity ?? 0),
          total_price: Number(o.total_price ?? 0),
          subtotal_amount: Number(o.subtotal_amount ?? 0),
          tax_amount: Number(o.tax_amount ?? 0),
          refunded_amount: Number(o.refunded_amount ?? 0),
          ready_by: o.ready_by || null,
          pickup_by: o.pickup_by || null,
          buyer_received: Boolean(o.buyer_received_at),
          buyer_problem_at: o.buyer_problem_at || null,
          no_show_reported: Boolean(o.no_show_reported_at),
          pickup_details: o.status === 'ready_for_pickup' ? o.pickup_details || null : null,
          pickup_code: codeRowByOrderId.get(o.id)?.code || null,
          pickup_address: o.pickup_address || null,
          pickup_area: [listing?.location_name, listing?.zip_code].filter(Boolean).join(' '),
          reviewed: reviewedOrderIds.has(o.id),
          listing_title: listing?.title || 'Harvest Crop',
          listing_unit_type: listing?.unit_type || 'units',
          listing_location: listing?.location_name || '',
          farmer_id: listing?.farmer_id || null,
          farm_name: (listing?.farmer_id && farmNameById.get(listing.farmer_id)) || 'Local Farm',
        };
      });

    return NextResponse.json({ orders });
  } catch (err: any) {
    console.error('guest order view error:', err);
    await alertAdmin('guest order view error', err);
    return NextResponse.json({ error: 'Could not load this order.' }, { status: 500 });
  }
}
