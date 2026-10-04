import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getRequestUser } from '@/lib/apiAuth';
import { getPickupCodeRecord } from '@/lib/pickupCodes';

export const dynamic = 'force-dynamic';

const MAX_COMMENT_LENGTH = 1000;

function tokensMatch(a: string, b: string) {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  return bufferA.length === bufferB.length && timingSafeEqual(bufferA, bufferB);
}

// Lets a buyer review the farm they bought from. Only the buyer of a
// completed order can leave a review, and only one per order — so every
// review on the site comes from a real, picked-up purchase. Signed-in buyers
// are matched by account; guests by the secret token in their order link.
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { orderId } = body;
    const rating = Number(body.rating);
    const comment = typeof body.comment === 'string' ? body.comment.trim() : '';
    const token = typeof body.token === 'string' ? body.token : '';

    if (!orderId) {
      return NextResponse.json({ error: 'Missing order.' }, { status: 400 });
    }
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ error: 'Choose a rating from 1 to 5 stars.' }, { status: 400 });
    }
    if (comment.length > MAX_COMMENT_LENGTH) {
      return NextResponse.json(
        { error: `Please keep your review under ${MAX_COMMENT_LENGTH} characters.` },
        { status: 400 }
      );
    }

    const { data: order } = await supabaseAdmin
      .from('orders')
      .select('id, buyer_id, listing_id, status, guest_access_token')
      .eq('id', orderId)
      .maybeSingle();

    if (!order) {
      return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    }

    const user = await getRequestUser(request);
    let isBuyer = Boolean(user && order.buyer_id && order.buyer_id === user.id);

    if (!isBuyer && !order.buyer_id && token) {
      const codeRecord = await getPickupCodeRecord(order.id);
      const expectedToken = codeRecord?.guestToken || order.guest_access_token;
      isBuyer = Boolean(expectedToken && tokensMatch(expectedToken, token));
    }

    if (!isBuyer) {
      return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    }

    if (order.status !== 'completed') {
      return NextResponse.json(
        { error: 'You can review an order once it has been picked up.' },
        { status: 409 }
      );
    }

    const { data: listing } = await supabaseAdmin
      .from('produce_listings')
      .select('farmer_id')
      .eq('id', order.listing_id)
      .maybeSingle();

    if (!listing?.farmer_id) {
      return NextResponse.json({ error: 'This order can no longer be reviewed.' }, { status: 409 });
    }

    const { error: insertError } = await supabaseAdmin.from('seller_reviews').insert([
      {
        seller_id: listing.farmer_id,
        order_id: order.id,
        buyer_id: order.buyer_id,
        rating,
        comment: comment || null,
      },
    ]);

    if (insertError) {
      // Unique violation on order_id: this order already has a review.
      if (insertError.code === '23505') {
        return NextResponse.json({ error: "You've already reviewed this order." }, { status: 409 });
      }
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('review error:', err);
    return NextResponse.json({ error: 'Could not save your review. Please try again.' }, { status: 500 });
  }
}
