import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getRequestUser } from '@/lib/apiAuth';
import { getPickupCodeRecord } from '@/lib/pickupCodes';
import { sendEmail, escapeHtml } from '@/lib/email';
import { buyerGuidanceEmailHtml } from '@/lib/buyerGuidance';
import { alertAdmin } from '@/lib/alerts';
import { orderRef } from '@/lib/pickupGroups';
import { pickupDeadline, formatDeadline, mapLink, BUYER_PICKUP_DAYS } from '@/lib/pickupRules';

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

    // A buyer's other items with this farm from the same checkout can be marked
    // ready in the same go, so they get one email covering all of them.
    const alsoOrderIds: string[] = Array.isArray(body.alsoOrderIds)
      ? body.alsoOrderIds.filter((id: unknown) => typeof id === 'string' && id !== orderId).slice(0, 20)
      : [];

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

    // The extra items have to be this farmer's, from the same checkout, and
    // still waiting; anything else is left alone.
    const others: { order: any; title: string }[] = [];
    if (alsoOrderIds.length > 0 && order.checkout_id) {
      const { data: otherOrders } = await supabaseAdmin
        .from('orders')
        .select('*')
        .in('id', alsoOrderIds)
        .eq('checkout_id', order.checkout_id)
        .eq('status', 'pending_pickup');
      const otherListingIds = (otherOrders || []).map((o) => o.listing_id);
      const { data: otherListings } = otherListingIds.length
        ? await supabaseAdmin.from('produce_listings').select('id, title, farmer_id').in('id', otherListingIds)
        : { data: [] as any[] };
      const listingById = new Map((otherListings || []).map((l) => [l.id, l]));
      for (const other of otherOrders || []) {
        const otherListing = listingById.get(other.listing_id);
        if (otherListing?.farmer_id === user.id) others.push({ order: other, title: otherListing.title || 'Your order' });
      }
    }

    // The pickup address is fixed when the buyer pays — it is what their sales
    // tax was worked out for — and kept privately until now. Marking the order
    // ready is what puts it on the order, where the buyer can see it. If the
    // private copy is missing, the listing's current address is used; only an
    // order with neither takes one the farmer types in.
    const addressFor = async (target: any): Promise<string | null> => {
      if (target.pickup_address) return target.pickup_address;
      const { data: savedAddress } = await supabaseAdmin
        .from('order_pickup_addresses')
        .select('address')
        .eq('order_id', target.id)
        .maybeSingle();
      if (savedAddress?.address) return savedAddress.address;
      const { data: listingAddress } = await supabaseAdmin
        .from('listing_pickup_addresses')
        .select('address')
        .eq('listing_id', target.listing_id)
        .maybeSingle();
      return listingAddress?.address || enteredAddress || null;
    };

    const pickupAddress = await addressFor(order);
    if (!pickupAddress) {
      return NextResponse.json({ error: 'Enter the pickup address for this order.' }, { status: 400 });
    }

    // The buyer's time to collect starts now. An order already marked ready
    // keeps the deadline it was first given.
    const readyAt = order.ready_at ? new Date(order.ready_at) : new Date();
    const pickupBy = order.pickup_by ? new Date(order.pickup_by) : pickupDeadline(readyAt);

    const { error: updateError } = await supabaseAdmin
      .from('orders')
      .update({
        status: 'ready_for_pickup',
        pickup_details: pickupDetails,
        pickup_address: pickupAddress,
        ready_at: readyAt.toISOString(),
        pickup_by: pickupBy.toISOString(),
      })
      .eq('id', orderId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // The other items, each at its own address (nearly always the same one).
    const readyTitles: string[] = [listing.title || 'Your order'];
    const otherAddresses: string[] = [];
    for (const other of others) {
      const otherAddress: string = (await addressFor(other.order)) || pickupAddress;
      const { error: otherError } = await supabaseAdmin
        .from('orders')
        .update({
          status: 'ready_for_pickup',
          pickup_details: pickupDetails,
          pickup_address: otherAddress,
          ready_at: readyAt.toISOString(),
          pickup_by: pickupBy.toISOString(),
        })
        .eq('id', other.order.id)
        .eq('status', 'pending_pickup');
      if (otherError) {
        console.error('mark-ready: could not mark an extra item ready', other.order.id, otherError.message);
        continue;
      }
      readyTitles.push(other.title);
      if (otherAddress !== pickupAddress && !otherAddresses.includes(otherAddress)) otherAddresses.push(otherAddress);
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
            ${
              readyTitles.length === 1
                ? `<p><strong>${escapeHtml(readyTitles[0])}</strong> is ready for pickup.</p>`
                : `<p>These items are ready for pickup:</p><ul>${readyTitles
                    .map((title) => `<li><strong>${escapeHtml(title)}</strong></li>`)
                    .join('')}</ul>`
            }
            <p>Your order number: <strong style="font-family: monospace; font-size: 16px;">${orderRef(order)}</strong><br /><span style="font-size: 12px; color: #6b7280;">Tell the farmer this number at pickup so they can find your order. It is not your pickup code.</span></p>
            <p>
              Pickup address: <strong>${escapeHtml(pickupAddress)}</strong><br />
              <a href="${mapLink(pickupAddress)}">Get directions</a>
            </p>
            ${otherAddresses
              .map(
                (address) =>
                  `<p>Some items are at a different address: <strong>${escapeHtml(address)}</strong><br /><a href="${mapLink(address)}">Get directions</a></p>`
              )
              .join('')}
            <p style="white-space: pre-wrap;">${escapeHtml(String(pickupDetails))}</p>
            <p>
              <strong>Please pick up by ${formatDeadline(pickupBy)}.</strong> You have ${BUYER_PICKUP_DAYS} days
              from today; an order that isn't collected in that time can be closed as not picked up, with a
              restocking fee.
            </p>
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

    return NextResponse.json({ success: true, readyCount: readyTitles.length });
  } catch (err: any) {
    console.error('mark-ready error:', err);
    await alertAdmin('mark-ready error', err);
    return NextResponse.json({ error: err.message || 'Failed to mark order ready.' }, { status: 500 });
  }
}
