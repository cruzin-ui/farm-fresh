import type Stripe from 'stripe';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

async function sendSellerNotification(params: {
  sellerEmail: string;
  listingTitle: string;
  quantity: number;
  unitType: string;
  buyerEmail: string | null;
  totalPrice: number;
  pickupCode: string;
}) {
  const { sellerEmail, listingTitle, quantity, unitType, buyerEmail, totalPrice, pickupCode } = params;

  if (!process.env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set — skipping seller notification email.');
    return;
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Farm Fresh Direct <onboarding@resend.dev>',
        to: [sellerEmail],
        subject: `New order: ${quantity} ${unitType} of ${listingTitle}`,
        html: `
          <div style="font-family: sans-serif; max-width: 480px;">
            <h2 style="color: #059669;">You've got a new reservation!</h2>
            <p><strong>${listingTitle}</strong> — ${quantity} ${unitType}</p>
            <p>Buyer: ${buyerEmail || 'N/A'}</p>
            <p>Total paid: $${totalPrice.toFixed(2)}</p>
            <p>Pickup code: <strong>${pickupCode}</strong></p>
            <p style="margin-top: 20px; font-size: 12px; color: #6b7280;">
              Visit your Seller Dashboard to mark this order ready for pickup.
            </p>
          </div>
        `,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error('Resend API error:', res.status, errBody);
    }
  } catch (err) {
    console.error('Failed to send seller notification email:', err);
  }
}

async function findOrderForPayment(paymentIntentId: string) {
  const { data } = await supabaseAdmin
    .from('orders')
    .select('id, pickup_code')
    .eq('stripe_payment_intent_id', paymentIntentId)
    .maybeSingle();

  return data ? { orderId: data.id as string, code: data.pickup_code as string } : null;
}

// SERVER-ONLY. Records the order for a succeeded checkout PaymentIntent,
// decrements the listing's quantity and emails the seller. Called from both
// /api/checkout/complete (the buyer's browser) and the Stripe webhook, so it
// is idempotent: whichever arrives second gets the existing order back and
// nothing is decremented or emailed twice.
export async function recordOrderForPaymentIntent(paymentIntent: Stripe.PaymentIntent) {
  const existing = await findOrderForPayment(paymentIntent.id);
  if (existing) return existing;

  const buyerId = paymentIntent.metadata.buyer_id;
  const listingId = paymentIntent.metadata.listing_id;
  const orderQuantity = Number(paymentIntent.metadata.quantity) || 1;
  const totalPaid = paymentIntent.amount / 100;
  const pickupCode = `FFD-${Math.floor(1000 + Math.random() * 9000)}`;

  const { data: buyerUser } = await supabaseAdmin.auth.admin.getUserById(buyerId);
  const buyerEmail = buyerUser?.user?.email || null;

  const { data: order, error: orderError } = await supabaseAdmin
    .from('orders')
    .insert([
      {
        buyer_id: buyerId,
        buyer_email: buyerEmail,
        listing_id: listingId,
        quantity: orderQuantity,
        reserved_quantity: orderQuantity,
        total_price: totalPaid,
        deposit_amount: totalPaid,
        authorized_amount: totalPaid,
        balance_due_at_pickup: 0.00,
        payment_method: 'stripe_card_online',
        payment_status: 'paid',
        stripe_payment_intent_id: paymentIntent.id,
        pickup_code: pickupCode,
        verification_code: pickupCode,
      },
    ])
    .select()
    .single();

  if (orderError) {
    // Unique violation: the other caller recorded this payment first.
    if (orderError.code === '23505') {
      const raced = await findOrderForPayment(paymentIntent.id);
      if (raced) return raced;
    }
    throw orderError;
  }

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

    // Notify the seller by email. This runs after payment/order success and
    // never fails the request — a missed email shouldn't undo a real sale.
    if (listing.farmer_id) {
      const { data: sellerUser, error: sellerLookupError } =
        await supabaseAdmin.auth.admin.getUserById(listing.farmer_id);

      if (sellerLookupError) {
        console.error('Failed to look up seller email:', sellerLookupError);
      } else if (sellerUser?.user?.email) {
        await sendSellerNotification({
          sellerEmail: sellerUser.user.email,
          listingTitle: listing.title || 'your listing',
          quantity: orderQuantity,
          unitType: listing.unit_type || 'units',
          buyerEmail,
          totalPrice: totalPaid,
          pickupCode,
        });
      }
    }
  }

  return { orderId: order.id as string, code: pickupCode };
}
