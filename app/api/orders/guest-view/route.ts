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
// There is no session to check, so access is granted by the order's random
// access token, which the guest gets on the confirmation page and in the link
// in their confirmation email.
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

    const { data: listing } = await supabaseAdmin
      .from('produce_listings')
      .select('title, unit_type, location_name')
      .eq('id', order.listing_id)
      .maybeSingle();

    const { data: reviewRow } = await supabaseAdmin
      .from('seller_reviews')
      .select('order_id')
      .eq('order_id', order.id)
      .maybeSingle();

    return NextResponse.json({
      order: {
        id: order.id,
        status: order.status,
        created_at: order.created_at,
        quantity: Number(order.reserved_quantity ?? order.quantity ?? 0),
        total_price: Number(order.total_price ?? 0),
        refunded_amount: Number(order.refunded_amount ?? 0),
        pickup_details: order.status === 'ready_for_pickup' ? order.pickup_details || null : null,
        pickup_code: codeRecord?.code || null,
        pickup_address: order.pickup_address || null,
        reviewed: Boolean(reviewRow),
        listing_title: listing?.title || 'Harvest Crop',
        listing_unit_type: listing?.unit_type || 'units',
        listing_location: listing?.location_name || '',
      },
    });
  } catch (err: any) {
    console.error('guest order view error:', err);
    await alertAdmin('guest order view error', err);
    return NextResponse.json({ error: 'Could not load this order.' }, { status: 500 });
  }
}
