import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getRequestUser } from '@/lib/apiAuth';
import { alertAdmin } from '@/lib/alerts';
import { escapeHtml, sendEmail } from '@/lib/email';
import { sendPush } from '@/lib/push';
import { getPickupCodeRecord } from '@/lib/pickupCodes';
import { orderRef } from '@/lib/pickupGroups';
import { DELIVERY_RELEASE_HOURS } from '@/lib/delivery';
import { DELIVERY_PHOTO_BUCKET, deliveryPhotoLink } from '@/lib/deliveryServer';

export const dynamic = 'force-dynamic';

const PHOTO_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
};
const PHOTO_MAX_BYTES = 8 * 1024 * 1024;

// "Left at the door": the farm delivered an order while the buyer wasn't
// there to give their code. A form with `orderId` and `photo` (of the order
// where it was left). Every open item in the same delivery is marked
// delivered; the buyer is emailed the photo and has DELIVERY_RELEASE_HOURS to
// report a problem, after which the hourly job pays the farm (see
// lib/deliveryServer releaseDeliveredOrders). A buyer who confirms they got
// it releases the payment straight away.
export async function POST(request: Request) {
  try {
    const user = await getRequestUser(request);
    if (!user) return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 });

    const form = await request.formData();
    const orderId = String(form.get('orderId') || '');
    const photo = form.get('photo');

    const { data: order } = await supabaseAdmin.from('orders').select('*').eq('id', orderId).maybeSingle();
    if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    const { data: listing } = await supabaseAdmin.from('produce_listings').select('farmer_id').eq('id', order.listing_id).maybeSingle();
    if (!listing || listing.farmer_id !== user.id) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });

    if (order.fulfillment !== 'delivery' || !order.delivery_id) {
      return NextResponse.json({ error: 'This order is for pickup, not delivery.' }, { status: 409 });
    }
    if (!['pending_pickup', 'ready_for_pickup'].includes(order.status)) {
      return NextResponse.json({ error: 'This order is already finished.' }, { status: 409 });
    }
    if (order.delivered_at) {
      return NextResponse.json({ error: 'This order is already marked delivered.' }, { status: 409 });
    }
    if (!(photo instanceof File) || photo.size === 0) {
      return NextResponse.json({ error: 'Take a photo of the order where you left it.' }, { status: 400 });
    }
    const extension = PHOTO_TYPES[photo.type];
    if (!extension) return NextResponse.json({ error: 'The photo must be a JPG, PNG, HEIC or WebP picture.' }, { status: 400 });
    if (photo.size > PHOTO_MAX_BYTES) return NextResponse.json({ error: 'That photo is too big. Please try again.' }, { status: 400 });

    const path = `${user.id}/${order.delivery_id}-${Date.now()}.${extension}`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from(DELIVERY_PHOTO_BUCKET)
      .upload(path, Buffer.from(await photo.arrayBuffer()), { contentType: photo.type });
    if (uploadError) throw uploadError;

    // Everything still open in this delivery.
    const now = new Date().toISOString();
    const { data: updated, error } = await supabaseAdmin
      .from('orders')
      .update({ delivered_at: now, delivery_photo_path: path, status: 'ready_for_pickup', ready_at: order.ready_at || now })
      .eq('delivery_id', order.delivery_id)
      .in('status', ['pending_pickup', 'ready_for_pickup'])
      .is('delivered_at', null)
      .select('id, listing_id');
    if (error) throw error;

    const { data: listings } = await supabaseAdmin
      .from('produce_listings')
      .select('id, title')
      .in('id', (updated || []).map((o) => o.listing_id));
    const titles = (listings || []).map((l) => l.title || 'your order');

    const origin = new URL(request.url).origin;
    const codeRecord = await getPickupCodeRecord(order.id);
    const guestToken = codeRecord?.guestToken || order.guest_access_token;
    const ordersLink = guestToken ? `${origin}/orders/confirmation?orderId=${order.id}&token=${guestToken}` : `${origin}/orders`;
    const photoLink = await deliveryPhotoLink(path);

    if (order.buyer_email) {
      await sendEmail({
        to: order.buyer_email,
        subject: 'Your order was delivered',
        html: `
          <div style="font-family: sans-serif; max-width: 480px;">
            <h2 style="color: #059669;">Your order was delivered</h2>
            <p>The farmer left your order at <strong>${escapeHtml(order.delivery_address || 'your address')}</strong>:</p>
            <ul>${titles.map((t) => `<li><strong>${escapeHtml(t)}</strong></li>`).join('')}</ul>
            ${photoLink ? `<p><a href="${photoLink}">See the photo of where it was left</a> (the link works for 7 days)</p>` : ''}
            <p>Please bring it inside soon, especially anything that needs to stay cold.</p>
            <p>
              <strong>Something wrong or missing?</strong> Tell us within ${DELIVERY_RELEASE_HOURS} hours using
              <strong>Report a problem</strong> on your order, and we'll hold the farmer's payment while we sort it out.
              Otherwise the farmer is paid after ${DELIVERY_RELEASE_HOURS} hours, or as soon as you tap <strong>I got it</strong>.
            </p>
            <p>Order number: <strong style="font-family: monospace;">${orderRef(order)}</strong></p>
            <p><a href="${ordersLink}" style="display: inline-block; background: #047857; color: #ffffff; text-decoration: none; font-weight: bold; padding: 10px 18px; border-radius: 8px;">View my order</a></p>
          </div>
        `,
      });
    }
    await sendPush([order.buyer_id], {
      title: 'Your order was delivered',
      body: `Left at your door. Order ${orderRef(order)}. Report a problem within ${DELIVERY_RELEASE_HOURS} hours if anything's wrong.`,
      url: '/orders',
    });

    return NextResponse.json({ success: true, count: (updated || []).length });
  } catch (err) {
    console.error('order delivered error:', err);
    await alertAdmin('marking an order delivered', err);
    return NextResponse.json({ error: 'Could not save that. Please try again.' }, { status: 500 });
  }
}
