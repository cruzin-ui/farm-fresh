import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getRequestUser } from '@/lib/apiAuth';
import { getPickupCodeRecord } from '@/lib/pickupCodes';
import { alertAdmin } from '@/lib/alerts';
import { sendEmail, escapeHtml } from '@/lib/email';
import { orderRef } from '@/lib/pickupGroups';

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
      .select('id, checkout_id, buyer_id, listing_id, status, guest_access_token')
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
      .select('farmer_id, title')
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

    // Let the farmer know. The review is saved either way, so a problem here
    // is only logged. The buyer isn't named: reviews on the site aren't either.
    try {
      const { data: sellerUser } = await supabaseAdmin.auth.admin.getUserById(listing.farmer_id);
      const sellerEmail = sellerUser?.user?.email;
      if (sellerEmail) {
        const origin = new URL(request.url).origin;
        const stars = '★'.repeat(rating) + '☆'.repeat(5 - rating);
        await sendEmail({
          to: sellerEmail,
          subject: `You have a new ${rating}-star review`,
          html: `
            <div style="font-family: sans-serif; max-width: 480px;">
              <h2 style="color: #059669;">A buyer reviewed your farm</h2>
              <p>
                For order <strong style="font-family: monospace;">${orderRef(order)}</strong>:
                <strong>${escapeHtml(listing.title || 'your produce')}</strong>
              </p>
              <p style="font-size: 24px; color: #d97706; margin: 8px 0;" aria-label="${rating} out of 5 stars">${stars}</p>
              ${
                comment
                  ? `<p style="white-space: pre-wrap; border-left: 3px solid #a7f3d0; padding: 4px 0 4px 12px; color: #374151;">${escapeHtml(comment)}</p>`
                  : '<p style="color: #6b7280;">They left a rating without a comment.</p>'
              }
              <p>It now shows on your farm page, where shoppers see it before they buy.</p>
              <p>
                <a href="${origin}/sellers/${listing.farmer_id}" style="display: inline-block; background: #047857; color: #ffffff; text-decoration: none; font-weight: bold; padding: 10px 18px; border-radius: 8px;">View My Farm Page</a>
              </p>
              <p style="font-size: 12px; color: #6b7280;">
                Reviews can only be left by buyers who picked up an order. If you think this one breaks our rules,
                <a href="${origin}/contact">contact us</a> and we'll take a look.
              </p>
            </div>
          `,
        });
      }
    } catch (emailErr) {
      console.error('Failed to email the farmer about a new review:', emailErr);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('review error:', err);
    await alertAdmin('review error', err);
    return NextResponse.json({ error: 'Could not save your review. Please try again.' }, { status: 500 });
  }
}
