import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getRequestUser } from '@/lib/apiAuth';
import { refundOrderQuantity, OrderActionError } from '@/lib/orderActions';
import { alertAdmin } from '@/lib/alerts';

export const dynamic = 'force-dynamic';

// Lets a farmer cancel an order (newQuantity 0) or reduce its quantity when
// they have less product than expected. Refunds the difference to the buyer;
// the farmer's eventual payout shrinks to match the reduced quantity.
export async function POST(request: Request) {
  try {
    const user = await getRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 });
    }

    const body = await request.json();
    const { orderId, restock } = body;
    const newQuantity = Number(body.newQuantity);
    const note = typeof body.note === 'string' ? body.note.trim() : '';

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
      .select('title, unit_type, farmer_id, available_quantity')
      .eq('id', order.listing_id)
      .maybeSingle();

    // Only the farmer who owns the listing can change its orders.
    if (!listing || listing.farmer_id !== user.id) {
      return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    }

    const result = await refundOrderQuantity({
      order,
      listing,
      newQuantity,
      restock: Boolean(restock),
      note: note ? `Message from the farmer: ${note}` : '',
      reason: 'seller',
    });

    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    if (err instanceof OrderActionError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('order adjust error:', err);
    await alertAdmin('order adjust error', err);
    return NextResponse.json({ error: err.message || 'Failed to adjust order.' }, { status: 500 });
  }
}
