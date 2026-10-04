import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getRequestUser } from '@/lib/apiAuth';
import { completeOrderAndReleasePayout, OrderActionError } from '@/lib/orderActions';
import {
  getPickupCodeRecord,
  normalizePickupCode,
  recordFailedPickupCodeAttempt,
  MAX_PICKUP_CODE_ATTEMPTS,
} from '@/lib/pickupCodes';

export const dynamic = 'force-dynamic';

// Marks an order completed once the farmer enters the buyer's pickup code,
// which releases the farmer's payout for it.
export async function POST(request: Request) {
  try {
    const user = await getRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 });
    }

    const body = await request.json();
    const { orderId } = body;

    if (!orderId) {
      return NextResponse.json({ error: 'Missing order.' }, { status: 400 });
    }

    const { data: order, error: fetchError } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .maybeSingle();

    if (fetchError || !order) {
      return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    }

    const { data: listing } = await supabaseAdmin
      .from('produce_listings')
      .select('farmer_id')
      .eq('id', order.listing_id)
      .maybeSingle();

    // Only the farmer who owns the listing can complete its orders.
    if (!listing || listing.farmer_id !== user.id) {
      return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    }

    if (order.status === 'completed') {
      return NextResponse.json({ success: true, payoutAmount: 0 });
    }

    // The buyer hands their pickup code to the farmer when they collect the
    // produce; entering it here is what proves the handover happened. Orders
    // from before codes were stored separately keep theirs on the order row.
    const codeRecord = await getPickupCodeRecord(order.id);
    const expectedCode = codeRecord?.code || order.pickup_code || order.verification_code;

    if (expectedCode) {
      if (codeRecord && codeRecord.failedAttempts >= MAX_PICKUP_CODE_ATTEMPTS) {
        return NextResponse.json(
          { error: 'Too many incorrect codes were entered for this order. Please contact support to complete it.' },
          { status: 423 }
        );
      }

      const enteredCode = typeof body.code === 'string' ? normalizePickupCode(body.code) : '';

      if (!enteredCode || enteredCode !== normalizePickupCode(expectedCode)) {
        if (codeRecord && enteredCode) {
          await recordFailedPickupCodeAttempt(order.id, codeRecord.failedAttempts);
        }
        return NextResponse.json(
          { error: "That pickup code doesn't match this order. Ask the buyer to check their order confirmation." },
          { status: 400 }
        );
      }
    }

    const { payoutAmount } = await completeOrderAndReleasePayout(
      order,
      listing.farmer_id,
      new URL(request.url).origin
    );

    return NextResponse.json({ success: true, payoutAmount });
  } catch (err: any) {
    if (err instanceof OrderActionError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('order complete error:', err);
    return NextResponse.json({ error: err.message || 'Failed to complete order.' }, { status: 500 });
  }
}
