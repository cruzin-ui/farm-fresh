import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getRequestAdmin } from '@/lib/apiAuth';
import {
  completeOrderAndReleasePayout,
  refundOrderQuantity,
  resolveNoShow,
  OrderActionError,
} from '@/lib/orderActions';

export const dynamic = 'force-dynamic';

// Admin-only overrides for when the normal pickup-code flow can't resolve an
// order:
//   release        — complete the order and pay the farmer without a code
//   refund         — cancel the order and refund the buyer in full (pulls the
//                    payout back from the farmer if it was already released)
//   no_show        — buyer never collected: platform keeps its fee, the farmer
//                    gets a restocking fee, the buyer is refunded the rest
//   reset_attempts — unlock an order after too many wrong pickup codes
export async function POST(request: Request) {
  try {
    const admin = await getRequestAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: 'Not authorized.' }, { status: 403 });
    }

    const body = await request.json();
    const { orderId, action } = body;

    if (!orderId || !action) {
      return NextResponse.json({ error: 'Missing order or action.' }, { status: 400 });
    }

    const { data: order, error: fetchError } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .maybeSingle();

    if (fetchError || !order) {
      return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    }

    console.log(`Admin override: ${admin.email} ran "${action}" on order ${order.id}`);

    if (action === 'reset_attempts') {
      const { error } = await supabaseAdmin
        .from('order_pickup_codes')
        .update({ failed_attempts: 0 })
        .eq('order_id', order.id);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, message: 'Pickup code attempts reset.' });
    }

    const { data: listing } = await supabaseAdmin
      .from('produce_listings')
      .select('title, unit_type, farmer_id, available_quantity')
      .eq('id', order.listing_id)
      .maybeSingle();

    if (!listing) {
      return NextResponse.json({ error: 'The listing for this order no longer exists.' }, { status: 409 });
    }

    if (action === 'release') {
      const { payoutAmount } = await completeOrderAndReleasePayout(order, listing.farmer_id);
      return NextResponse.json({
        success: true,
        message:
          payoutAmount > 0
            ? `Order completed — $${payoutAmount.toFixed(2)} released to the farmer.`
            : 'Order marked completed.',
      });
    }

    if (action === 'refund') {
      const { refundAmount } = await refundOrderQuantity({
        order,
        listing,
        newQuantity: 0,
        allowCompleted: true,
        note: 'This order was cancelled and refunded by Farm Fresh Direct support.',
      });
      return NextResponse.json({
        success: true,
        message: `Order cancelled — $${refundAmount.toFixed(2)} refunded to the buyer.`,
      });
    }

    if (action === 'no_show') {
      const { refundAmount, restockingFee } = await resolveNoShow({
        order,
        listing,
        farmerId: listing.farmer_id,
      });
      return NextResponse.json({
        success: true,
        message: `Closed as a no-show — $${refundAmount.toFixed(2)} refunded to the buyer, $${restockingFee.toFixed(2)} restocking fee paid to the farmer.`,
      });
    }

    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  } catch (err: any) {
    if (err instanceof OrderActionError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('admin order action error:', err);
    return NextResponse.json({ error: err.message || 'Action failed.' }, { status: 500 });
  }
}
