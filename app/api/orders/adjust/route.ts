import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getRequestUser } from '@/lib/apiAuth';
import { refundOrderQuantity, OrderActionError } from '@/lib/orderActions';
import { alertAdmin } from '@/lib/alerts';
import { checkSellerCancellations } from '@/lib/fraudWatch';
import { SELLER_CHANGE_REASONS, LISTING_ACTIONS, type ListingAction } from '@/lib/sellerChangeReasons';

export const dynamic = 'force-dynamic';

// Lets a farmer cancel an order (newQuantity 0) or reduce its quantity when
// they have less product than expected. Refunds the difference to the buyer;
// the farmer's eventual payout shrinks to match the reduced quantity.
//
// The farmer says why (`reason`, for Farm Fresh Direct, not shown to the
// buyer) and what should happen to the listing (`listingAction`): put the
// quantity back on sale, leave the listing as it is, or take it down.
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
    const reason = typeof body.reason === 'string' ? body.reason : '';
    // Older pages sent only a "restock" tick box.
    const listingAction: ListingAction =
      typeof body.listingAction === 'string' && body.listingAction in LISTING_ACTIONS
        ? (body.listingAction as ListingAction)
        : restock
          ? 'restock'
          : 'leave';

    if (!(reason in SELLER_CHANGE_REASONS)) {
      return NextResponse.json({ error: 'Choose the reason you are changing this order.' }, { status: 400 });
    }

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
      restock: listingAction === 'restock',
      note: note ? `Message from the farmer: ${note}` : '',
      reason: 'seller',
    });

    // Nothing more is to be sold from this listing. Orders already placed
    // for it are untouched.
    if (listingAction === 'take_down') {
      const { error: takeDownError } = await supabaseAdmin
        .from('produce_listings')
        .update({ available_quantity: 0 })
        .eq('id', order.listing_id);
      if (takeDownError) {
        console.error('Order changed but the listing could not be taken down:', takeDownError);
        await alertAdmin('listing not taken down after a seller cancelled', takeDownError, { listing: order.listing_id });
      }
    }

    // Keep a record of the change and the reason given. The refund has already
    // gone through, so a failure here is only logged.
    const { error: recordError } = await supabaseAdmin.from('seller_order_changes').insert([
      {
        order_id: order.id,
        farmer_id: user.id,
        kind: result.cancelled ? 'cancelled' : 'reduced',
        reason,
        listing_action: listingAction,
        quantity_removed: Number(order.reserved_quantity ?? order.quantity ?? 0) - result.newQuantity,
      },
    ]);
    if (recordError) console.error('Could not record why a seller changed an order:', recordError.message);

    // A seller who has cancelled too many orders lately is paused until an
    // admin has looked.
    const suspended = result.cancelled
      ? await checkSellerCancellations(user.id, new URL(request.url).origin)
      : false;

    return NextResponse.json({ success: true, ...result, suspended });
  } catch (err: any) {
    if (err instanceof OrderActionError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('order adjust error:', err);
    await alertAdmin('order adjust error', err);
    return NextResponse.json({ error: err.message || 'Failed to adjust order.' }, { status: 500 });
  }
}
