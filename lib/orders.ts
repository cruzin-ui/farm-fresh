import type Stripe from 'stripe';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { randomBytes } from 'crypto';
import { getOrCreatePickupCode } from '@/lib/pickupCodes';
import { sendEmail } from '@/lib/email';
import { calculateFarmerPayoutCents } from '@/lib/pricing';

// The seller's email deliberately leaves out the pickup code — they only get
// it from the buyer at pickup, and need it to release their payout.
async function sendSellerNotification(params: {
  sellerEmail: string;
  listingTitle: string;
  quantity: number;
  unitType: string;
  buyerEmail: string | null;
  totalPrice: number;
}) {
  const { sellerEmail, listingTitle, quantity, unitType, buyerEmail, totalPrice } = params;

  await sendEmail({
    to: sellerEmail,
    subject: `New order: ${quantity} ${unitType} of ${listingTitle}`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px;">
        <h2 style="color: #059669;">You've got a new reservation!</h2>
        <p><strong>${listingTitle}</strong> — ${quantity} ${unitType}</p>
        <p>Buyer: ${buyerEmail || 'N/A'}</p>
        <p>Total paid: $${totalPrice.toFixed(2)}</p>
        <p>
          At pickup, ask the buyer for their pickup code and enter it in your Seller Dashboard
          to complete the order and release your payout.
        </p>
        <p style="margin-top: 20px; font-size: 12px; color: #6b7280;">
          Visit your Seller Dashboard to mark this order ready for pickup.
        </p>
      </div>
    `,
  });
}

async function sendBuyerConfirmation(params: {
  buyerEmail: string;
  listingTitle: string;
  quantity: number;
  unitType: string;
  totalPrice: number;
  pickupCode: string;
  orderLink: string | null;
}) {
  const { buyerEmail, listingTitle, quantity, unitType, totalPrice, pickupCode, orderLink } = params;

  await sendEmail({
    to: buyerEmail,
    subject: `Order confirmed: ${quantity} ${unitType} of ${listingTitle}`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px;">
        <h2 style="color: #059669;">Your order is confirmed!</h2>
        <p><strong>${listingTitle}</strong> — ${quantity} ${unitType}</p>
        <p>Total paid: $${totalPrice.toFixed(2)}</p>
        <p>Your pickup code: <strong style="font-size: 20px;">${pickupCode}</strong></p>
        <p>
          Give this code to the farmer <strong>only when you collect your produce</strong> — it
          confirms you received your order and releases their payment. We'll email you when
          your order is ready for pickup.
        </p>
        ${orderLink ? `<p><a href="${orderLink}">View your order and pickup code</a> at any time — keep this email, the link is how you get back to it.</p>` : ''}
      </div>
    `,
  });
}

// SERVER-ONLY. Records the order for a succeeded checkout PaymentIntent,
// decrements the listing's quantity and emails the buyer and seller. Called
// from both /api/checkout/complete (the buyer's browser) and the Stripe
// webhook, so it is idempotent: whichever arrives second gets the existing
// order back and nothing is decremented or emailed twice.
//
// Guest orders have no buyer account: buyer_id is null, the email comes from
// what the guest typed at checkout, and a random access token stands in for
// being signed in when they view the order later. `siteUrl` is used to build
// that link for the confirmation email.
export async function recordOrderForPaymentIntent(paymentIntent: Stripe.PaymentIntent, siteUrl?: string) {
  const buyerId = paymentIntent.metadata.buyer_id || null;

  const { data: existing } = await supabaseAdmin
    .from('orders')
    .select('id, guest_access_token')
    .eq('stripe_payment_intent_id', paymentIntent.id)
    .maybeSingle();

  if (existing) {
    return {
      orderId: existing.id as string,
      code: await getOrCreatePickupCode(existing.id, buyerId),
      guestToken: (existing.guest_access_token as string | null) ?? null,
    };
  }

  const listingId = paymentIntent.metadata.listing_id;
  const orderQuantity = Number(paymentIntent.metadata.quantity) || 1;
  const totalPaid = paymentIntent.amount / 100;
  const subtotalCents = Number(paymentIntent.metadata.subtotal_cents) || 0;
  const sellerFeeRate = Number(paymentIntent.metadata.seller_fee_rate) || 0;

  let buyerEmail: string | null = paymentIntent.metadata.buyer_email || null;
  if (buyerId) {
    const { data: buyerUser } = await supabaseAdmin.auth.admin.getUserById(buyerId);
    buyerEmail = buyerUser?.user?.email || buyerEmail;
  }

  const guestToken = buyerId ? null : randomBytes(24).toString('hex');

  const { data: order, error: orderError } = await supabaseAdmin
    .from('orders')
    .insert([
      {
        buyer_id: buyerId,
        buyer_email: buyerEmail,
        guest_access_token: guestToken,
        listing_id: listingId,
        quantity: orderQuantity,
        reserved_quantity: orderQuantity,
        total_price: totalPaid,
        // The produce subtotal, and what the farmer will be paid for it once
        // the order completes (subtotal less the seller fee).
        subtotal_amount: subtotalCents / 100,
        farmer_payout_amount: calculateFarmerPayoutCents(subtotalCents, sellerFeeRate) / 100,
        deposit_amount: totalPaid,
        authorized_amount: totalPaid,
        balance_due_at_pickup: 0.00,
        payment_method: 'stripe_card_online',
        payment_status: 'paid',
        stripe_payment_intent_id: paymentIntent.id,
      },
    ])
    .select()
    .single();

  if (orderError) {
    // Unique violation: the other caller recorded this payment first.
    if (orderError.code === '23505') {
      const { data: raced } = await supabaseAdmin
        .from('orders')
        .select('id, guest_access_token')
        .eq('stripe_payment_intent_id', paymentIntent.id)
        .maybeSingle();

      if (raced) {
        return {
          orderId: raced.id as string,
          code: await getOrCreatePickupCode(raced.id, buyerId),
          guestToken: (raced.guest_access_token as string | null) ?? null,
        };
      }
    }
    throw orderError;
  }

  const pickupCode = await getOrCreatePickupCode(order.id, buyerId);

  // Decrement the listing's available quantity now that payment succeeded.
  const { data: listing } = await supabaseAdmin
    .from('produce_listings')
    .select('available_quantity, title, unit_type, farmer_id')
    .eq('id', listingId)
    .maybeSingle();

  if (listing) {
    const newAvailable = Math.max(0, Number(listing.available_quantity ?? 0) - orderQuantity);
    const { error: updateError } = await supabaseAdmin
      .from('produce_listings')
      .update({ available_quantity: newAvailable })
      .eq('id', listingId);

    if (updateError) {
      console.error('Failed to update listing available_quantity after successful payment:', updateError);
    }
  }

  // Emails run after payment/order success and never fail the request — a
  // missed email shouldn't undo a real sale.
  const listingTitle = listing?.title || 'your order';
  const unitType = listing?.unit_type || 'units';

  if (buyerEmail) {
    await sendBuyerConfirmation({
      buyerEmail,
      listingTitle,
      quantity: orderQuantity,
      unitType,
      totalPrice: totalPaid,
      pickupCode,
      orderLink:
        guestToken && siteUrl
          ? `${siteUrl}/orders/confirmation?orderId=${order.id}&token=${guestToken}`
          : null,
    });
  }

  if (listing?.farmer_id) {
    const { data: sellerUser, error: sellerLookupError } =
      await supabaseAdmin.auth.admin.getUserById(listing.farmer_id);

    if (sellerLookupError) {
      console.error('Failed to look up seller email:', sellerLookupError);
    } else if (sellerUser?.user?.email) {
      await sendSellerNotification({
        sellerEmail: sellerUser.user.email,
        listingTitle,
        quantity: orderQuantity,
        unitType,
        buyerEmail,
        totalPrice: totalPaid,
      });
    }
  }

  return { orderId: order.id as string, code: pickupCode, guestToken };
}
