import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { stripeAdmin } from '@/lib/stripeAdmin';
import { recordOrderForPaymentIntent, isCheckoutPayment } from '@/lib/orders';
import { alertAdmin } from '@/lib/alerts';

export const dynamic = 'force-dynamic';

// Stripe calls this directly when a payment succeeds, so the order still gets
// recorded if the buyer closes the tab before /api/checkout/complete runs.
// There is no user session here — the request is trusted only because its
// signature verifies against STRIPE_WEBHOOK_SECRET.
export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET is not set — rejecting webhook.');
    await alertAdmin('Stripe webhook', new Error('STRIPE_WEBHOOK_SECRET is not set, so payment notices from Stripe are being rejected.'));
    return NextResponse.json({ error: 'Webhook is not configured.' }, { status: 500 });
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing signature.' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    // Signature verification needs the exact raw body, not parsed JSON.
    const rawBody = await request.text();
    event = stripeAdmin.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err: any) {
    console.error('Stripe webhook signature verification failed:', err.message);
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 });
  }

  try {
    if (event.type === 'payment_intent.succeeded') {
      const paymentIntent = event.data.object;

      // Only payments created by our checkout are recorded as orders.
      if (isCheckoutPayment(paymentIntent)) {
        await recordOrderForPaymentIntent(paymentIntent, new URL(request.url).origin);
      }
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    // A non-2xx response makes Stripe retry the event later.
    console.error('Stripe webhook handling error:', err);
    await alertAdmin('Stripe webhook handling error', err);
    return NextResponse.json({ error: 'Webhook handler failed.' }, { status: 500 });
  }
}
