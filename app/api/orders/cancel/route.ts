import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getRequestUser } from '@/lib/apiAuth';
import { getPickupCodeRecord } from '@/lib/pickupCodes';
import { resolveNoShow, refundOrderQuantity, OrderActionError } from '@/lib/orderActions';
import { isSellerLate } from '@/lib/pickupRules';
import { isWithinFreeCancellation, RESTOCKING_RATE, FREE_CANCELLATION_HOURS } from '@/lib/pricing';
import { sendEmail, escapeHtml } from '@/lib/email';
import { alertAdmin } from '@/lib/alerts';

export const dynamic = 'force-dynamic';

function tokensMatch(a: string, b: string) {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  return bufferA.length === bufferB.length && timingSafeEqual(bufferA, bufferB);
}

// Lets a buyer cancel their own order while it is still waiting to be picked
// up. They are refunded the produce price; the service fee is kept. Within the
// free-cancellation window there is no restocking fee. After it — or once the
// farmer has reported the order as not collected — the farmer keeps a
// restocking fee, the same as for a no-show. The exception is an order the
// farmer failed to mark ready in time: that one is the farmer's doing, so the
// buyer gets everything back, service fee included. Signed-in buyers are
// matched by account; guests by the secret token in their order link.
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { orderId } = body;
    const token = typeof body.token === 'string' ? body.token : '';

    if (!orderId) {
      return NextResponse.json({ error: 'Missing order.' }, { status: 400 });
    }

    const { data: order } = await supabaseAdmin.from('orders').select('*').eq('id', orderId).maybeSingle();
    if (!order) {
      return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    }

    const user = await getRequestUser(request);
    let isBuyer = Boolean(user && order.buyer_id && order.buyer_id === user.id);

    if (!isBuyer && !order.buyer_id && token) {
      const codeRecord = await getPickupCodeRecord(order.id);
      const expectedToken = codeRecord?.guestToken || order.guest_access_token;
      isBuyer = Boolean(expectedToken && tokensMatch(expectedToken, token));
    }

    if (!isBuyer) {
      return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    }

    const { data: listing } = await supabaseAdmin
      .from('produce_listings')
      .select('title, unit_type, farmer_id, available_quantity')
      .eq('id', order.listing_id)
      .maybeSingle();

    if (!listing?.farmer_id) {
      return NextResponse.json(
        { error: 'This order can no longer be cancelled here. Please contact us.' },
        { status: 409 }
      );
    }

    const sellerLate = isSellerLate(order);
    const quantity = Number(order.reserved_quantity ?? order.quantity ?? 0);

    let refundAmount: number;
    let restockingFee = 0;

    if (sellerLate) {
      ({ refundAmount } = await refundOrderQuantity({
        order,
        listing,
        newQuantity: 0,
        restock: true,
        reason: 'seller_late',
        note: "You cancelled this order because the farmer didn't have it ready in time, so it has been refunded in full, including the service fee.",
      }));
      await supabaseAdmin.from('orders').update({ cancelled_by_buyer_at: new Date().toISOString() }).eq('id', order.id);
    } else {
      const free = isWithinFreeCancellation(order.created_at) && !order.no_show_reported_at;

      ({ refundAmount, restockingFee } = await resolveNoShow({
        order,
        listing,
        farmerId: listing.farmer_id,
        cancelledByBuyer: true,
        restockingRate: free ? 0 : RESTOCKING_RATE,
      }));
    }

    // Tell the farmer straight away, so they don't pick or pack it.
    const { data: sellerUser } = await supabaseAdmin.auth.admin.getUserById(listing.farmer_id);
    if (sellerUser?.user?.email) {
      await sendEmail({
        to: sellerUser.user.email,
        subject: `Order cancelled by the buyer: ${quantity} ${listing.unit_type || 'units'} of ${listing.title || 'your listing'}`,
        html: `
          <div style="font-family: sans-serif; max-width: 480px;">
            <h2 style="color: #b45309;">A buyer cancelled their order</h2>
            <p>
              The order for <strong>${quantity} ${escapeHtml(listing.unit_type || 'units')}</strong> of
              <strong>${escapeHtml(listing.title || 'your listing')}</strong> was cancelled by the buyer, so
              please don't prepare it. The quantity has been put back on your listing.
            </p>
            <p>
              ${
                sellerLate
                  ? "The buyer was able to cancel for a full refund because the order wasn't marked ready by its deadline."
                  : restockingFee > 0
                    ? `Because it was cancelled late, you've been paid a restocking fee of <strong>$${restockingFee.toFixed(2)}</strong>.`
                    : `It was cancelled within ${FREE_CANCELLATION_HOURS} hours of being placed, so there is no restocking fee.`
              }
            </p>
          </div>
        `,
      });
    }

    return NextResponse.json({ success: true, refundAmount, restockingFee });
  } catch (err: any) {
    if (err instanceof OrderActionError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('buyer cancel error:', err);
    await alertAdmin('buyer cancel error', err);
    return NextResponse.json({ error: 'Could not cancel this order. Please contact us.' }, { status: 500 });
  }
}
