import { NextResponse } from 'next/server';
import { stripeAdmin } from '@/lib/stripeAdmin';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getRequestUser } from '@/lib/apiAuth';
import { calculateOrderTotals, MIN_CHARGE_CENTS, SELLER_FEE_RATE } from '@/lib/pricing';

export const dynamic = 'force-dynamic';

// Step 1 of checkout: creates a Stripe PaymentIntent on the platform account.
// The whole payment is held by the platform; the farmer's share (the produce
// subtotal, less the seller fee) is only transferred to their connected
// account when the order is marked completed — see /api/orders/complete. The
// buyer fee and seller fee stay with the platform. The order itself is recorded by /api/checkout/complete once
// payment succeeds.
export async function POST(request: Request) {
  try {
    const user = await getRequestUser(request);

    const body = await request.json();
    const { listingId } = body;
    const orderQuantity = Number(body.quantity);

    // Buyers either sign in or check out as a guest with just an email
    // address, which is where their confirmation and pickup code are sent.
    const guestEmail = typeof body.guestEmail === 'string' ? body.guestEmail.trim().toLowerCase() : '';

    if (!user && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail)) {
      return NextResponse.json(
        { error: 'Enter a valid email address so we can send your confirmation and pickup code.' },
        { status: 400 }
      );
    }

    const buyerEmail = user ? user.email || '' : guestEmail;

    if (!listingId) {
      return NextResponse.json({ error: 'Missing listing reference.' }, { status: 400 });
    }

    if (!Number.isInteger(orderQuantity) || orderQuantity < 1) {
      return NextResponse.json({ error: 'Invalid quantity.' }, { status: 400 });
    }

    const { data: listing, error: listingFetchError } = await supabaseAdmin
      .from('produce_listings')
      .select('available_quantity, price_per_unit, title, farmer_id')
      .eq('id', listingId)
      .single();

    if (listingFetchError || !listing) {
      return NextResponse.json({ error: 'Listing not found.' }, { status: 404 });
    }

    const currentAvailable = Number(listing.available_quantity ?? 0);

    if (orderQuantity > currentAvailable) {
      return NextResponse.json(
        { error: `Only ${currentAvailable} left. Please refresh and adjust your quantity.` },
        { status: 409 }
      );
    }

    const { data: seller } = await supabaseAdmin
      .from('seller_profiles')
      .select('stripe_account_id, stripe_onboarding_complete')
      .eq('id', listing.farmer_id)
      .maybeSingle();

    if (!seller?.stripe_account_id || !seller.stripe_onboarding_complete) {
      return NextResponse.json(
        { error: "This farmer hasn't finished setting up payouts yet, so this listing can't be purchased right now." },
        { status: 409 }
      );
    }

    // Totals are always computed server-side from the listing price — never
    // trusted from the client.
    const { subtotalCents, totalCents } = calculateOrderTotals(
      Number(listing.price_per_unit ?? 0),
      orderQuantity
    );

    if (totalCents < MIN_CHARGE_CENTS) {
      return NextResponse.json({ error: 'Order total is below the minimum charge of $0.50.' }, { status: 400 });
    }

    const paymentIntent = await stripeAdmin.paymentIntents.create({
      amount: totalCents,
      currency: 'usd',
      allowed_payment_method_types: ['card'],
      transfer_group: `order-${crypto.randomUUID()}`,
      description: `Farm Fresh Direct — ${orderQuantity} x ${listing.title || 'produce'}`,
      metadata: {
        listing_id: String(listingId),
        quantity: String(orderQuantity),
        // Empty for guest checkouts, which are identified by email alone.
        buyer_id: user?.id || '',
        buyer_email: buyerEmail,
        // The farmer's share for the full quantity, paid out on completion.
        subtotal_cents: String(subtotalCents),
        // The platform's cut of that share, fixed at the time of purchase.
        seller_fee_rate: String(SELLER_FEE_RATE),
      },
    });

    return NextResponse.json({ clientSecret: paymentIntent.client_secret });
  } catch (err: any) {
    console.error('Checkout PaymentIntent error:', err);
    return NextResponse.json(
      { error: err.message || 'Payment processing failed.' },
      { status: 500 }
    );
  }
}
