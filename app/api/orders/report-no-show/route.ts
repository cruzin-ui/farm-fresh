import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getRequestUser } from '@/lib/apiAuth';
import { sendEmail, escapeHtml } from '@/lib/email';
import { getPickupCodeRecord } from '@/lib/pickupCodes';
import { NO_SHOW_RESTOCKING_RATE } from '@/lib/orderActions';
import { NO_SHOW_REVIEW_HOURS } from '@/lib/noShow';
import { signNoShowDispute } from '@/lib/noShowDispute';

export const dynamic = 'force-dynamic';

// Who is told when a farmer reports a no-show: CONTACT_EMAIL if set, otherwise
// every address in ADMIN_EMAILS.
function adminRecipients() {
  return (process.env.CONTACT_EMAIL || process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean);
}

// Lets a farmer report that a buyer never came for an order that was ready.
// This moves no money: it flags the order and emails the buyer so they can
// respond. If the buyer doesn't respond within the review period, a scheduled
// job closes the order as a no-show; otherwise an admin reviews it and
// then closes it as a no-show (or dismisses the report) from the admin page.
// Farmers can't close a no-show themselves, because doing so pays them a
// restocking fee.
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

    const { data: order } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .maybeSingle();

    if (!order) {
      return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    }

    const { data: listing } = await supabaseAdmin
      .from('produce_listings')
      .select('title, unit_type, farmer_id')
      .eq('id', order.listing_id)
      .maybeSingle();

    // Only the farmer who owns the listing can report on its orders.
    if (!listing || listing.farmer_id !== user.id) {
      return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    }

    // A buyer can only fail to show up for an order they were told was ready.
    if (order.status !== 'ready_for_pickup') {
      return NextResponse.json(
        { error: 'Mark the order ready for pickup first. A no-show can only be reported after the buyer has been told it is ready.' },
        { status: 409 }
      );
    }

    if (order.no_show_reported_at) {
      return NextResponse.json({ success: true, alreadyReported: true });
    }

    const { error: updateError } = await supabaseAdmin
      .from('orders')
      .update({ no_show_reported_at: new Date().toISOString() })
      .eq('id', order.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    const recipients = adminRecipients();
    if (recipients.length > 0) {
      const quantity = Number(order.reserved_quantity ?? order.quantity ?? 0);

      await sendEmail({
        to: recipients,
        subject: `[Farm Fresh Direct] No-show reported on order #${String(order.id).slice(0, 8)}`,
        html: `
          <div style="font-family: sans-serif; max-width: 520px;">
            <h2 style="color: #b45309;">A farmer reported a buyer no-show</h2>
            <p>
              <strong>${quantity} ${escapeHtml(listing.unit_type || 'units')} of ${escapeHtml(listing.title || 'produce')}</strong>
            </p>
            <p>Buyer: ${escapeHtml(order.buyer_email || 'unknown')}</p>
            <p>Farmer: ${escapeHtml(user.email || 'unknown')}</p>
            <p>Buyer paid: $${Number(order.total_price ?? 0).toFixed(2)}</p>
            <p>
              No money has moved. Review the order on the admin page: close it as a no-show to refund the
              buyer (less the service fee and the farmer's restocking fee), or dismiss the report.
            </p>
            <p><a href="${new URL(request.url).origin}/admin">Open the admin page</a></p>
          </div>
        `,
      });
    }

    // Tell the buyer too, so they can say so if the report is wrong — or come
    // and collect — before an admin decides. Replies go to the admins.
    if (order.buyer_email) {
      const siteUrl = new URL(request.url).origin;
      const quantity = Number(order.reserved_quantity ?? order.quantity ?? 0);
      const guestToken = order.buyer_id ? null : (await getPickupCodeRecord(order.id))?.guestToken;
      const disputeLink = `${siteUrl}/orders/dispute?orderId=${order.id}&sig=${signNoShowDispute(String(order.id))}`;
      const orderLink = guestToken
        ? `${siteUrl}/orders/confirmation?orderId=${order.id}&token=${guestToken}`
        : `${siteUrl}/orders`;

      await sendEmail({
        to: order.buyer_email,
        replyTo: recipients[0],
        subject: `Did you miss your pickup? Your order of ${listing.title || 'produce'}`,
        html: `
          <div style="font-family: sans-serif; max-width: 520px;">
            <h2 style="color: #b45309;">The farmer says your order wasn't picked up</h2>
            <p>
              Your order of <strong>${quantity} ${escapeHtml(listing.unit_type || 'units')} of
              ${escapeHtml(listing.title || 'produce')}</strong> was marked ready, and the farmer has told us
              it wasn't collected.
            </p>
            <p>
              <strong>If that's not right, or you still want to pick it up, tell us within
              ${NO_SHOW_REVIEW_HOURS} hours.</strong> Nothing has been decided yet.
            </p>
            <p>
              <a href="${disputeLink}" style="display: inline-block; background: #047857; color: #ffffff; text-decoration: none; font-weight: bold; padding: 10px 18px; border-radius: 8px;">This isn't right — review my order</a>
            </p>
            <p>
              If we don't hear from you within ${NO_SHOW_REVIEW_HOURS} hours, the order will be closed as not
              picked up. You'll then be refunded
              what you paid for the produce, less a ${NO_SHOW_RESTOCKING_RATE * 100}% restocking fee for the
              farmer. The service fee isn't refunded on missed pickups.
            </p>
            <p><a href="${orderLink}">View your order</a></p>
          </div>
        `,
      });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('report no-show error:', err);
    return NextResponse.json({ error: err.message || 'Could not report the no-show.' }, { status: 500 });
  }
}
