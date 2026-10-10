import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getRequestUser } from '@/lib/apiAuth';
import { getPickupCodeRecord } from '@/lib/pickupCodes';
import { sendEmail, escapeHtml } from '@/lib/email';
import { alertAdmin } from '@/lib/alerts';

export const dynamic = 'force-dynamic';

const MAX_MESSAGE_LENGTH = 1000;
const MAX_MESSAGES_PER_DAY = 20;

const isOpen = (order: any) => order.status === 'pending_pickup' || order.status === 'ready_for_pickup';

function tokensMatch(a: string, b: string) {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  return bufferA.length === bufferB.length && timingSafeEqual(bufferA, bufferB);
}

// Messages between a buyer and a farmer about an order ("running late",
// "which gate?"). They are relayed by the site: each side is emailed that a
// message arrived, without either being given the other's email address, and
// replies on their order page or dashboard.
//
// Called with { orderId } it returns the conversation; with { orderId, body }
// it adds a message first. One conversation covers everything a buyer bought
// from that farm in one checkout. The caller must be that buyer (signed in, or
// holding the guest link's token) or that farmer.
export async function POST(request: Request) {
  try {
    const requestBody = await request.json();
    const { orderId } = requestBody;
    const token = typeof requestBody.token === 'string' ? requestBody.token : '';
    const text = typeof requestBody.body === 'string' ? requestBody.body.trim() : '';

    if (!orderId) {
      return NextResponse.json({ error: 'Missing order.' }, { status: 400 });
    }

    const { data: order } = await supabaseAdmin.from('orders').select('*').eq('id', orderId).maybeSingle();
    if (!order) {
      return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    }

    const { data: listing } = await supabaseAdmin
      .from('produce_listings')
      .select('title, unit_type, farmer_id')
      .eq('id', order.listing_id)
      .maybeSingle();

    const user = await getRequestUser(request);
    const codeRecord = await getPickupCodeRecord(order.id);

    let role: 'buyer' | 'seller' | null = null;
    if (user && listing?.farmer_id === user.id) role = 'seller';
    else if (user && order.buyer_id && order.buyer_id === user.id) role = 'buyer';
    else if (!order.buyer_id && token) {
      const expectedToken = codeRecord?.guestToken || order.guest_access_token;
      if (expectedToken && tokensMatch(expectedToken, token)) role = 'buyer';
    }

    if (!role || !listing?.farmer_id) {
      return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    }

    // The orders this conversation covers: this buyer's items from this farm
    // in the same checkout.
    let threadOrders: any[] = [order];
    if (order.checkout_id) {
      const { data: siblings } = await supabaseAdmin.from('orders').select('*').eq('checkout_id', order.checkout_id);
      const siblingListingIds = [...new Set((siblings || []).map((o) => o.listing_id))];
      const { data: siblingListings } = await supabaseAdmin
        .from('produce_listings')
        .select('id, farmer_id')
        .in('id', siblingListingIds);
      const sameFarm = new Set((siblingListings || []).filter((l) => l.farmer_id === listing.farmer_id).map((l) => l.id));
      threadOrders = (siblings || []).filter((o) => sameFarm.has(o.listing_id));
      if (threadOrders.length === 0) threadOrders = [order];
    }
    const threadOrderIds = threadOrders.map((o) => o.id);
    const canSend = threadOrders.some(isOpen);

    if (text) {
      if (!canSend) {
        return NextResponse.json(
          { error: 'This order is closed, so messages are off. Use the Contact Us page if you need help with it.' },
          { status: 409 }
        );
      }
      if (text.length > MAX_MESSAGE_LENGTH) {
        return NextResponse.json({ error: `Please keep messages under ${MAX_MESSAGE_LENGTH} characters.` }, { status: 400 });
      }

      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count } = await supabaseAdmin
        .from('order_messages')
        .select('id', { count: 'exact', head: true })
        .in('order_id', threadOrderIds)
        .eq('sender', role)
        .gte('created_at', dayAgo);

      if ((count ?? 0) >= MAX_MESSAGES_PER_DAY) {
        return NextResponse.json(
          { error: "You've sent a lot of messages about this order today. Please try again tomorrow, or contact us." },
          { status: 429 }
        );
      }

      const { error: insertError } = await supabaseAdmin
        .from('order_messages')
        .insert([{ order_id: order.id, sender: role, body: text }]);
      if (insertError) throw insertError;

      // Tell the other side, with a link back to where they can reply.
      const siteUrl = new URL(request.url).origin;
      const what = `${Number(order.reserved_quantity ?? order.quantity ?? 0)} ${listing.unit_type || 'units'} of ${listing.title || 'produce'}`;

      let recipient: string | null = null;
      let replyLink = `${siteUrl}/dashboard`;
      if (role === 'buyer') {
        const { data: sellerUser } = await supabaseAdmin.auth.admin.getUserById(listing.farmer_id);
        recipient = sellerUser?.user?.email || null;
      } else {
        recipient = order.buyer_email || null;
        replyLink = codeRecord?.guestToken
          ? `${siteUrl}/orders/confirmation?orderId=${order.id}&token=${codeRecord.guestToken}`
          : `${siteUrl}/orders`;
      }

      if (recipient) {
        await sendEmail({
          to: recipient,
          subject: `New message from ${role === 'buyer' ? 'a buyer' : 'the farmer'} about ${listing.title || 'your order'}`,
          html: `
            <div style="font-family: sans-serif; max-width: 480px;">
              <h2 style="color: #059669;">${role === 'buyer' ? 'A buyer sent you a message' : 'The farmer sent you a message'}</h2>
              <p>About the order for <strong>${escapeHtml(what)}</strong>:</p>
              <p style="white-space: pre-wrap; padding: 12px; background: #f3f4f6; border-radius: 8px;">${escapeHtml(text)}</p>
              <p>
                <a href="${replyLink}" style="display: inline-block; background: #047857; color: #ffffff; text-decoration: none; font-weight: bold; padding: 10px 18px; border-radius: 8px;">Reply on Farm Fresh Direct</a>
              </p>
              <p style="font-size: 12px; color: #6b7280;">
                Please reply on the site rather than to this email; replies to this address aren't delivered to
                the other person.
              </p>
            </div>
          `,
        });
      }
    }

    // Opening the conversation counts as reading it: the other side's messages
    // stop counting toward the unread badge.
    const { error: readError } = await supabaseAdmin
      .from('order_messages')
      .update({ read_at: new Date().toISOString() })
      .in('order_id', threadOrderIds)
      .neq('sender', role)
      .is('read_at', null);
    if (readError) console.error('Could not mark messages as read:', readError);

    const { data: messages, error: listError } = await supabaseAdmin
      .from('order_messages')
      .select('id, sender, body, created_at')
      .in('order_id', threadOrderIds)
      .order('created_at', { ascending: true })
      .limit(200);
    if (listError) throw listError;

    return NextResponse.json({ messages: messages || [], role, canSend });
  } catch (err: any) {
    console.error('order messages error:', err);
    await alertAdmin('order messages error', err);
    return NextResponse.json({ error: 'Messages are not available right now. Please try again.' }, { status: 500 });
  }
}
