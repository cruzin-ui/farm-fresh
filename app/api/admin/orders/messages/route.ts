import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getRequestAdmin } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

// Admin-only: the messages a buyer and farmer have sent each other about an
// order, for settling a disagreement. A conversation covers everything the
// buyer bought from that farm in one checkout, so the whole of it is returned.
// Reading it here doesn't mark anything as read for either of them.
export async function POST(request: Request) {
  const admin = await getRequestAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 });
  }

  const { orderId } = await request.json().catch(() => ({}));
  if (!orderId) return NextResponse.json({ error: 'Missing order.' }, { status: 400 });

  const { data: order } = await supabaseAdmin
    .from('orders')
    .select('id, checkout_id, listing_id')
    .eq('id', orderId)
    .maybeSingle();
  if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });

  let orderIds = [order.id];
  if (order.checkout_id) {
    const { data: siblings } = await supabaseAdmin
      .from('orders')
      .select('id, listing_id')
      .eq('checkout_id', order.checkout_id);
    const listingIds = [...new Set((siblings || []).map((o) => o.listing_id))];
    const { data: listings } = await supabaseAdmin.from('produce_listings').select('id, farmer_id').in('id', listingIds);
    const farmerByListing = new Map((listings || []).map((l) => [l.id, l.farmer_id]));
    const farmerId = farmerByListing.get(order.listing_id);
    const sameFarm = (siblings || []).filter((o) => farmerByListing.get(o.listing_id) === farmerId).map((o) => o.id);
    if (sameFarm.length > 0) orderIds = sameFarm;
  }

  const { data: messages, error } = await supabaseAdmin
    .from('order_messages')
    .select('id, sender, body, created_at')
    .in('order_id', orderIds)
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ messages: messages || [] });
}
