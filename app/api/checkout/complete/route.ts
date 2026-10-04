import { NextResponse } from 'next/server';
import { stripeAdmin } from '@/lib/stripeAdmin';
import { getRequestUser } from '@/lib/apiAuth';
import { recordOrderForPaymentIntent } from '@/lib/orders';

export const dynamic = 'force-dynamic';

// Step 2 of checkout: after the buyer's card is confirmed in the browser, this
// verifies the PaymentIntent with Stripe and records the order. The Stripe
// webhook does the same thing as a safety net, so this is safe to call more
// than once for the same payment — it returns the existing order.
export async function POST(request: Request) {
  try {
    const user = await getRequestUser(request);

    const body = await request.json();
    const { paymentIntentId, clientSecret } = body;

    if (!paymentIntentId) {
      return NextResponse.json({ error: 'Missing payment reference.' }, { status: 400 });
    }

    const paymentIntent = await stripeAdmin.paymentIntents.retrieve(paymentIntentId);
    const buyerId = paymentIntent.metadata?.buyer_id;

    // The caller must be the person who paid. A signed-in buyer is matched by
    // account; a guest proves it with the payment's client secret, which only
    // the browser that made the payment was given.
    const isBuyer = buyerId
      ? user?.id === buyerId
      : Boolean(clientSecret) && clientSecret === paymentIntent.client_secret;

    if (!isBuyer) {
      return NextResponse.json({ error: 'Payment not found.' }, { status: 404 });
    }

    if (paymentIntent.status !== 'succeeded') {
      return NextResponse.json({ error: 'Payment has not completed.' }, { status: 400 });
    }

    const { orderId, code, guestToken } = await recordOrderForPaymentIntent(
      paymentIntent,
      new URL(request.url).origin
    );

    return NextResponse.json({ success: true, orderId, code, guestToken });
  } catch (err: any) {
    console.error('Checkout completion error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to record your order.' },
      { status: 500 }
    );
  }
}
