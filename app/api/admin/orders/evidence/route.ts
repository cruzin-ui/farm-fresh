import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getRequestAdmin } from '@/lib/apiAuth';
import { orderRef } from '@/lib/pickupGroups';

export const dynamic = 'force-dynamic';

const when = (value?: string | null) =>
  value
    ? new Date(value).toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Phoenix' }) +
      ' (Arizona time)'
    : null;
const money = (value: unknown) => `$${Number(value || 0).toFixed(2)}`;

// Admin-only: everything on record about an order, written out as plain text
// to paste into a reply to a payment dispute. It covers the whole of what the
// buyer bought from that farm in the checkout, since a dispute is about the
// payment, and states only what the site recorded.
export async function POST(request: Request) {
  const admin = await getRequestAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 });
  }

  const { orderId } = await request.json().catch(() => ({}));
  if (!orderId) return NextResponse.json({ error: 'Missing order.' }, { status: 400 });

  const { data: order } = await supabaseAdmin.from('orders').select('*').eq('id', orderId).maybeSingle();
  if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });

  // Every item paid for in the same checkout.
  let items: any[] = [order];
  if (order.checkout_id) {
    const { data: siblings } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('checkout_id', order.checkout_id)
      .order('created_at', { ascending: true });
    if (siblings?.length) items = siblings;
  }
  const itemIds = items.map((o) => o.id);

  const { data: listings } = await supabaseAdmin
    .from('produce_listings')
    .select('id, title, unit_type, farmer_id')
    .in('id', [...new Set(items.map((o) => o.listing_id))]);
  const listingById = new Map((listings || []).map((l) => [l.id, l]));
  const farmerIds = [...new Set((listings || []).map((l) => l.farmer_id).filter(Boolean))];
  const { data: farms } = farmerIds.length
    ? await supabaseAdmin.from('seller_profiles').select('id, farm_name').in('id', farmerIds)
    : { data: [] as any[] };
  const farmNameById = new Map((farms || []).map((f: any) => [f.id, f.farm_name]));

  const { data: messages } = await supabaseAdmin
    .from('order_messages')
    .select('order_id, sender, body, created_at')
    .in('order_id', itemIds)
    .order('created_at', { ascending: true });
  const { data: reviews } = await supabaseAdmin
    .from('seller_reviews')
    .select('order_id, rating, comment, created_at')
    .in('order_id', itemIds);

  const lines: string[] = [];
  const add = (text = '') => lines.push(text);

  add(`FARM FRESH DIRECT: RECORD OF ORDER ${orderRef(order)}`);
  add(`Prepared ${when(new Date().toISOString())}`);
  add();
  add('WHAT THIS BUSINESS IS');
  add(
    'Farm Fresh Direct is an online marketplace where customers buy produce from local growers and collect it in person. ' +
      'Nothing is shipped. The customer pays online and is given a private pickup code. The grower is only paid when the ' +
      'customer hands over that code in person at pickup, by showing a QR code or reading out the number.'
  );
  add();
  add('THE PURCHASE');
  add(`Customer: ${order.buyer_email || 'unknown'} (${order.buyer_id ? 'signed in to an account' : 'checked out as a guest'})`);
  add(`Placed: ${when(order.created_at)}`);
  if (order.stripe_payment_intent_id) add(`Stripe payment: ${order.stripe_payment_intent_id}`);
  if (order.stripe_dispute_id) add(`Stripe dispute: ${order.stripe_dispute_id} (${order.dispute_status || 'status unknown'})`);
  add();

  for (const item of items) {
    const listing = listingById.get(item.listing_id);
    const farm = (listing && farmNameById.get(listing.farmer_id)) || 'unknown farm';
    const quantity = Number(item.original_quantity ?? item.reserved_quantity ?? item.quantity ?? 0);

    add(`ITEM: ${quantity} ${listing?.unit_type || 'units'} of ${listing?.title || 'produce'}, from ${farm}`);
    add(`  Charged for this item (with its share of fees and tax): ${money(item.original_total_amount ?? item.total_price)}`);
    if (Number(item.refunded_amount || 0) > 0) add(`  Already refunded to the customer: ${money(item.refunded_amount)}`);

    if (item.ready_at) {
      add(`  Marked ready for pickup by the grower: ${when(item.ready_at)}. The customer was emailed the pickup address and times.`);
    }
    if (item.pickup_address) add(`  Pickup address given to the customer: ${item.pickup_address}`);

    if (item.status === 'completed') {
      add(
        `  PICKED UP: ${when(item.completed_at) || 'date not recorded'}. The order was completed by entering the customer's ` +
          'private pickup code, which only the customer had been given.'
      );
      if (item.stripe_transfer_id) add(`  The grower was then paid (Stripe transfer ${item.stripe_transfer_id}).`);
      if (item.buyer_received_at) add(`  The customer confirmed on the site that they received it: ${when(item.buyer_received_at)}.`);
    } else if (item.status === 'cancelled') {
      add(`  CANCELLED (reason on record: ${item.cancel_reason || 'not recorded'}).`);
      if (item.cancelled_by_buyer_at) add(`  Cancelled by the customer: ${when(item.cancelled_by_buyer_at)}.`);
    } else {
      add(`  NOT YET PICKED UP (status: ${String(item.status).replace(/_/g, ' ')}). The grower has not been paid for it.`);
    }

    if (item.no_show_reported_at) add(`  The grower reported the customer as not collecting it: ${when(item.no_show_reported_at)}.`);
    if (item.buyer_problem_at) {
      add(`  The customer reported a problem to us: ${when(item.buyer_problem_at)}.`);
      if (item.buyer_problem_note) add(`    They wrote: ${String(item.buyer_problem_note).replace(/\s+/g, ' ')}`);
    }

    const review = (reviews || []).find((r) => r.order_id === item.id);
    if (review) {
      add(`  The customer reviewed this order: ${when(review.created_at)}, ${review.rating} out of 5 stars.`);
      if (review.comment) add(`    They wrote: ${String(review.comment).replace(/\s+/g, ' ')}`);
    }
    add();
  }

  add('MESSAGES BETWEEN THE CUSTOMER AND THE GROWER');
  if ((messages || []).length === 0) {
    add('None were sent through the site.');
  } else {
    for (const message of messages || []) {
      add(`${when(message.created_at)}, ${message.sender === 'seller' ? 'Grower' : 'Customer'}: ${String(message.body).replace(/\s+/g, ' ')}`);
    }
  }
  add();
  add('EMAILS SENT TO THE CUSTOMER');
  add('An order confirmation with the pickup code when the order was placed.');
  if (items.some((o) => o.ready_at)) add('A "ready for pickup" email with the pickup address, times and code.');
  if (items.some((o) => o.status === 'completed')) add('A thank-you email after the order was marked picked up.');

  return NextResponse.json({ text: lines.join('\n') });
}
