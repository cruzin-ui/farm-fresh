import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getRequestUser } from '@/lib/apiAuth';
import { getPickupCodeRecord } from '@/lib/pickupCodes';
import { sendEmail, escapeHtml } from '@/lib/email';
import { buyerGuidanceEmailHtml } from '@/lib/buyerGuidance';
import { alertAdmin } from '@/lib/alerts';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const user = await getRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 });
    }

    const body = await request.json();
    const { orderId, pickupDetails } = body;
    const enteredAddress = typeof body.pickupAddress === 'string' ? body.pickupAddress.trim().slice(0, 300) : '';

    if (!orderId || !pickupDetails) {
      return NextResponse.json({ error: 'Missing order or pickup details.' }, { status: 400 });
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
      .select('title, farmer_id')
      .eq('id', order.listing_id)
      .maybeSingle();

    // Only the farmer who owns the listing can mark its orders ready.
    if (!listing || listing.farmer_id !== user.id) {
      return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    }

    // The pickup address is fixed when the buyer pays: it is what they agreed
    // to and what their sales tax was worked out for, so it can't be changed
    // here. Only an order that somehow has none (a listing from before
    // addresses were required) takes the one the farmer enters now.
    const pickupAddress: string | null = order.pickup_address || enteredAddress || null;
    if (!pickupAddress) {
      return NextResponse.json({ error: 'Enter the pickup address for this order.' }, { status: 400 });
    }

    const { error: updateError } = await supabaseAdmin
      .from('orders')
      .update({ status: 'ready_for_pickup', pickup_details: pickupDetails, pickup_address: pickupAddress })
      .eq('id', orderId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    const codeRecord = await getPickupCodeRecord(order.id);
    const pickupCode = codeRecord?.code || order.pickup_code || order.verification_code;
    // Guests reach their order through a secret link. (Older guest orders kept the token on the order row.)
    const guestToken = codeRecord?.guestToken || order.guest_access_token;

    if (order.buyer_email) {
      await sendEmail({
        to: order.buyer_email,
        subject: 'Your order is ready for pickup!',
        html: `
          <div style="font-family: sans-serif; max-width: 480px;">
            <h2 style="color: #059669;">Your harvest is ready!</h2>
            <p><strong>${escapeHtml(listing.title || 'Your order')}</strong> is ready for pickup.</p>
            <p>Pickup address: <strong>${escapeHtml(pickupAddress)}</strong></p>
            <p style="white-space: pre-wrap;">${escapeHtml(String(pickupDetails))}</p>
            <p>Your pickup code: <strong>${pickupCode}</strong></p>
            <p>Give this code to the farmer only when you collect your produce — it releases their payment.</p>
            ${buyerGuidanceEmailHtml(new URL(request.url).origin)}
            ${
              guestToken
                ? `<p><a href="${new URL(request.url).origin}/orders/confirmation?orderId=${order.id}&token=${guestToken}">View your order</a></p>`
                : ''
            }
          </div>
        `,
      });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('mark-ready error:', err);
    await alertAdmin('mark-ready error', err);
    return NextResponse.json({ error: err.message || 'Failed to mark order ready.' }, { status: 500 });
  }
}
