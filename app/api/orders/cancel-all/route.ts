import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getRequestUser } from '@/lib/apiAuth';
import { refundOrderQuantity, resolveNoShow, sendBuyerOrderCancelledEmail, OrderActionError } from '@/lib/orderActions';
import { isWithinFreeCancellation, RESTOCKING_RATE } from '@/lib/pricing';
import { alertAdmin } from '@/lib/alerts';
import { checkSellerCancellations } from '@/lib/fraudWatch';
import { SELLER_CHANGE_REASONS, LISTING_ACTIONS, BUYER_REQUEST, type ListingAction } from '@/lib/sellerChangeReasons';
import { CSA_BOX_CATEGORY } from '@/lib/csaSchedule';

export const dynamic = 'force-dynamic';

const OPEN = ['pending_pickup', 'ready_for_pickup'];

// Lets a farmer cancel everything a buyer ordered from them in one checkout
// at once, rather than item by item. Each item is refunded in full, exactly as
// cancelling it alone would, and the buyer gets one email for the lot. The
// reason and what to do with the listings apply to every item. Counts as one
// cancellation toward the seller cancellation limit (it is one order).
//   { orderIds: string[], reason, note?, listingAction }
export async function POST(request: Request) {
  try {
    const user = await getRequestUser(request);
    if (!user) return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const orderIds: string[] = Array.isArray(body.orderIds) ? body.orderIds.filter((id: unknown) => typeof id === 'string').slice(0, 50) : [];
    const reason = typeof body.reason === 'string' ? body.reason : '';
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 1000) : '';
    const listingAction: ListingAction =
      typeof body.listingAction === 'string' && body.listingAction in LISTING_ACTIONS ? (body.listingAction as ListingAction) : 'leave';

    if (orderIds.length === 0) return NextResponse.json({ error: 'Missing order.' }, { status: 400 });
    if (!(reason in SELLER_CHANGE_REASONS)) {
      return NextResponse.json({ error: 'Choose the reason you are cancelling this order.' }, { status: 400 });
    }

    const { data: rows } = await supabaseAdmin.from('orders').select('*').in('id', orderIds);
    const orders = rows || [];
    const listingIds = [...new Set(orders.map((o) => o.listing_id))];
    const { data: listingRows } = listingIds.length
      ? await supabaseAdmin.from('produce_listings').select('id, title, unit_type, farmer_id, available_quantity, category').in('id', listingIds)
      : { data: [] as any[] };
    const listingById = new Map((listingRows || []).map((l) => [l.id, l]));

    // Only the farmer's own orders, all from the same checkout, still open.
    if (orders.length !== orderIds.length || orders.some((o) => listingById.get(o.listing_id)?.farmer_id !== user.id)) {
      return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    }
    if (new Set(orders.map((o) => o.checkout_id || o.id)).size > 1) {
      return NextResponse.json({ error: 'These items are from different orders.' }, { status: 400 });
    }
    const open = orders.filter((o) => OPEN.includes(o.status));
    if (open.length === 0) return NextResponse.json({ error: 'There is nothing left in this order to cancel.' }, { status: 409 });

    const cancelled: { title: string; quantity: number; unitType: string }[] = [];
    const failed: string[] = [];
    let refundTotal = 0;
    let restockingTotal = 0;
    // At the buyer's request: each item is handled as if the buyer cancelled it.
    const atBuyerRequest = reason === BUYER_REQUEST;

    for (const order of open) {
      const listing = listingById.get(order.listing_id)!;
      // A Farm Box has no listing for sale to restock or take down.
      const action: ListingAction = listing.category === CSA_BOX_CATEGORY ? 'leave' : listingAction;
      const quantity = Number(order.reserved_quantity ?? order.quantity ?? 0);
      try {
        if (atBuyerRequest) {
          const free = isWithinFreeCancellation(order.created_at) && !order.no_show_reported_at;
          const result = await resolveNoShow({
            order,
            listing,
            farmerId: user.id,
            cancelledByBuyer: true,
            viaFarmer: true,
            silent: true,
            restockingRate: free ? 0 : RESTOCKING_RATE,
          });
          refundTotal += Number(result.refundAmount) || 0;
          restockingTotal += Number(result.restockingFee) || 0;
          // That put the quantity back on sale; undo it if asked not to.
          if (action === 'leave') {
            await supabaseAdmin.from('produce_listings').update({ available_quantity: Number(listing.available_quantity ?? 0) }).eq('id', order.listing_id);
          }
        } else {
          const result = await refundOrderQuantity({
            order,
            listing,
            newQuantity: 0,
            restock: action === 'restock',
            note: note ? `Message from the farmer: ${note}` : '',
            reason: 'seller',
            silent: true,
          });
          refundTotal += Number(result.refundAmount) || 0;
        }
        cancelled.push({ title: listing.title || 'your order', quantity, unitType: listing.unit_type || 'units' });

        const { error: recordError } = await supabaseAdmin.from('seller_order_changes').insert([
          { order_id: order.id, farmer_id: user.id, kind: 'cancelled', reason, listing_action: action, quantity_removed: quantity },
        ]);
        if (recordError) console.error('Could not record why a seller cancelled an order:', recordError.message);
      } catch (err: any) {
        failed.push(listing.title || 'an item');
        if (!(err instanceof OrderActionError)) await alertAdmin('cancelling a whole order', err, { order: order.id });
      }
    }

    // Take each listing down once, if asked (Farm Boxes excepted).
    if (listingAction === 'take_down') {
      const toTakeDown = [...new Set(open.map((o) => o.listing_id))].filter(
        (id) => listingById.get(id)?.category !== CSA_BOX_CATEGORY
      );
      if (toTakeDown.length) {
        const { error } = await supabaseAdmin.from('produce_listings').update({ available_quantity: 0 }).in('id', toTakeDown);
        if (error) await alertAdmin('listings not taken down after a seller cancelled an order', error, { listings: toTakeDown.join(', ') });
      }
    }

    // One email to the buyer for everything that was cancelled.
    const buyerEmail = open[0].buyer_email;
    if (buyerEmail && cancelled.length > 0) {
      const { data: farm } = await supabaseAdmin.from('seller_profiles').select('farm_name').eq('id', user.id).maybeSingle();
      await sendBuyerOrderCancelledEmail({
        buyerEmail,
        farmName: farm?.farm_name || 'The farm',
        items: cancelled,
        refundTotal,
        note: note ? `Message from the farmer: ${note}` : '',
        atBuyerRequest,
        restockingTotal,
      });
    }

    // A buyer's request doesn't count against the farmer.
    const suspended =
      cancelled.length > 0 && !atBuyerRequest ? await checkSellerCancellations(user.id, new URL(request.url).origin) : false;

    return NextResponse.json({
      success: failed.length === 0,
      cancelledCount: cancelled.length,
      refundTotal,
      restockingTotal,
      atBuyerRequest,
      failed,
      suspended,
    });
  } catch (err: any) {
    console.error('cancel whole order error:', err);
    await alertAdmin('cancel whole order error', err);
    return NextResponse.json({ error: 'Could not cancel this order. Please try again.' }, { status: 500 });
  }
}
