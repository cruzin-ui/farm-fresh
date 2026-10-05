import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getRequestUser } from '@/lib/apiAuth';
import { completeOrderAndReleasePayout, OrderActionError } from '@/lib/orderActions';
import { alertAdmin } from '@/lib/alerts';
import {
  getPickupCodeRecord,
  normalizePickupCode,
  recordFailedPickupCodeAttempt,
  replacePickupCode,
  MAX_PICKUP_CODE_ATTEMPTS,
} from '@/lib/pickupCodes';
import { sendEmail, escapeHtml } from '@/lib/email';

export const dynamic = 'force-dynamic';

const isOpen = (order: any) => order.status === 'pending_pickup' || order.status === 'ready_for_pickup';

// Marks an order completed once the farmer enters the buyer's pickup code,
// which releases the farmer's payout for it.
//
// A buyer who bought several items from the same farm in one checkout has one
// code for all of them. `alsoOrderIds` names the other items being handed over
// in the same visit, so they are completed with the one code. Items left out
// stay open — but the farmer has now seen the code, so those items are given a
// new one, which is emailed to the buyer. A code therefore only ever works for
// one visit, and a farmer can't reuse it to pay themselves for produce they
// haven't handed over.
export async function POST(request: Request) {
  try {
    const user = await getRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 });
    }

    const body = await request.json();
    const { orderId } = body;
    const alsoOrderIds: string[] = Array.isArray(body.alsoOrderIds)
      ? body.alsoOrderIds.filter((id: unknown) => typeof id === 'string' && id !== orderId)
      : [];

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

    // Every open item this buyer has with this farmer from the same checkout —
    // the items the one pickup code covers.
    let covered: any[] = [order];
    if (order.checkout_id) {
      const { data: siblings } = await supabaseAdmin.from('orders').select('*').eq('checkout_id', order.checkout_id);
      const siblingListingIds = [...new Set((siblings || []).map((o) => o.listing_id))];
      const { data: siblingListings } = await supabaseAdmin
        .from('produce_listings')
        .select('id, farmer_id')
        .in('id', siblingListingIds);
      const mine = new Set((siblingListings || []).filter((l) => l.farmer_id === user.id).map((l) => l.id));

      covered = [order, ...(siblings || []).filter((o) => o.id !== order.id && mine.has(o.listing_id))];
    }

    const others = alsoOrderIds.map((id) => covered.find((o) => o.id === id));
    if (others.some((o) => !o)) {
      return NextResponse.json({ error: 'One of the selected items is not part of this order.' }, { status: 400 });
    }

    const toComplete = [order, ...others].filter(isOpen);

    if (order.status === 'completed' && toComplete.length === 0) {
      return NextResponse.json({ success: true, payoutAmount: 0, completedCount: 0 });
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
          await recordFailedPickupCodeAttempt(
            covered.map((o) => o.id),
            codeRecord.failedAttempts
          );
        }
        return NextResponse.json(
          { error: "That pickup code doesn't match this order. Ask the buyer to check their order confirmation." },
          { status: 400 }
        );
      }
    }

    const siteUrl = new URL(request.url).origin;
    let payoutAmount = 0;
    let completedCount = 0;

    for (const item of toComplete) {
      // One thank-you email for the visit, not one per item.
      const result = await completeOrderAndReleasePayout(item, listing.farmer_id, siteUrl, completedCount === 0);
      payoutAmount += result.payoutAmount;
      completedCount += 1;
    }

    // Anything this code covered that wasn't collected gets a fresh code.
    const completedIds = new Set(toComplete.map((o) => o.id));
    const remaining = covered.filter((o) => isOpen(o) && !completedIds.has(o.id));

    if (expectedCode && completedCount > 0 && remaining.length > 0) {
      try {
        const newCode = await replacePickupCode(remaining.map((o) => o.id));

        const { data: remainingListings } = await supabaseAdmin
          .from('produce_listings')
          .select('id, title, unit_type')
          .in('id', remaining.map((o) => o.listing_id));
        const listingById = new Map((remainingListings || []).map((l) => [l.id, l]));
        const itemList = remaining
          .map((o) => {
            const item = listingById.get(o.listing_id);
            return `<li>${Number(o.reserved_quantity ?? o.quantity ?? 0)} ${escapeHtml(item?.unit_type || 'units')} of ${escapeHtml(item?.title || 'your order')}</li>`;
          })
          .join('');

        if (order.buyer_email) {
          await sendEmail({
            to: order.buyer_email,
            subject: 'Your new pickup code for the rest of your order',
            html: `
              <div style="font-family: sans-serif; max-width: 480px;">
                <h2 style="color: #059669;">A new code for what you still have to collect</h2>
                <p>
                  You've collected part of your order, and the pickup code you gave the farmer has now been
                  used. For your protection it no longer works. These items are still waiting for you:
                </p>
                <ul>${itemList}</ul>
                <p>Your new pickup code: <strong style="font-size: 20px;">${newCode}</strong></p>
                <p>
                  Give it to the farmer only when you collect these items. If you did not collect anything,
                  <a href="${siteUrl}/contact">contact us</a> straight away.
                </p>
                ${
                  codeRecord?.guestToken
                    ? `<p><a href="${siteUrl}/orders/confirmation?orderId=${remaining[0].id}&token=${codeRecord.guestToken}">View your order</a></p>`
                    : ''
                }
              </div>
            `,
          });
        }
      } catch (rotateError) {
        // The pickup itself went through; the leftover items still carry the
        // used code, which an admin needs to know about.
        console.error('Could not replace the pickup code after a partial pickup:', rotateError);
        await alertAdmin('replacing a used pickup code after a partial pickup', rotateError, { order: order.id });
      }
    }

    return NextResponse.json({
      success: true,
      payoutAmount: Math.round(payoutAmount * 100) / 100,
      completedCount,
      remainingCount: remaining.length,
    });
  } catch (err: any) {
    if (err instanceof OrderActionError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('order complete error:', err);
    await alertAdmin('order complete error', err);
    return NextResponse.json({ error: err.message || 'Failed to complete order.' }, { status: 500 });
  }
}
