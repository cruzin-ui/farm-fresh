import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getRequestUser } from '@/lib/apiAuth';
import { getPickupCodeRecord } from '@/lib/pickupCodes';
import { sendEmail, escapeHtml } from '@/lib/email';
import { buyerGuidanceEmailHtml } from '@/lib/buyerGuidance';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const user = await getRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 });
    }

    const body = await request.json();
    const { orderId, pickupDetails } = body;

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

    const { error: updateError } = await supabaseAdmin
      .from('orders')
      .update({ status: 'ready_for_pickup', pickup_details: pickupDetails })
      .eq('id', orderId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    const codeRecord = await getPickupCodeRecord(order.id);
    const pickupCode = codeRecord?.code || order.pickup_code || order.verification_code;

    if (order.buyer_email) {
      await sendEmail({
        to: order.buyer_email,
        subject: 'Your order is ready for pickup!',
        html: `
          <div style="font-family: sans-serif; max-width: 480px;">
            <h2 style="color: #059669;">Your harvest is ready!</h2>
            <p><strong>${escapeHtml(listing.title || 'Your order')}</strong> is ready for pickup.</p>
            <p style="white-space: pre-wrap;">${escapeHtml(String(pickupDetails))}</p>
            ${order.pickup_address ? `<p>Pickup address: <strong>${escapeHtml(order.pickup_address)}</strong></p>` : ''}
            <p>Your pickup code: <strong>${pickupCode}</strong></p>
            <p>Give this code to the farmer only when you collect your produce — it releases their payment.</p>
            ${buyerGuidanceEmailHtml(new URL(request.url).origin)}
            ${
              order.guest_access_token
                ? `<p><a href="${new URL(request.url).origin}/orders/confirmation?orderId=${order.id}&token=${order.guest_access_token}">View your order</a></p>`
                : ''
            }
          </div>
        `,
      });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('mark-ready error:', err);
    return NextResponse.json({ error: err.message || 'Failed to mark order ready.' }, { status: 500 });
  }
}
