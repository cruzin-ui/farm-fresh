import { NextResponse } from 'next/server';
import { SquareClient, SquareEnvironment } from 'square';
import { supabase } from '@/lib/supabaseClient';

export const dynamic = 'force-dynamic';

const squareClient = new SquareClient({
  token: process.env.SQUARE_ACCESS_TOKEN || '',
  environment: process.env.SQUARE_ENVIRONMENT === 'production'
    ? SquareEnvironment.Production
    : SquareEnvironment.Sandbox,
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { sourceId, listingId, quantity, grandTotal, buyerId } = body;

    if (!sourceId || !grandTotal) {
      return NextResponse.json({ error: 'Missing required payment parameters.' }, { status: 400 });
    }

    if (!buyerId) {
      return NextResponse.json({ error: 'You must be signed in to complete checkout.' }, { status: 401 });
    }

    if (!listingId) {
      return NextResponse.json({ error: 'Missing listing reference.' }, { status: 400 });
    }

    const orderQuantity = Number(quantity) || 1;

    // Re-check current availability right before charging, to prevent
    // overselling if two buyers reserve the same listing at nearly the same time.
    const { data: listing, error: listingFetchError } = await supabase
      .from('produce_listings')
      .select('available_quantity')
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

    // Generate unique pickup verification code
    const pickupCode = `FFD-${Math.floor(1000 + Math.random() * 9000)}`;

    // Convert total dollars to cents integer
    const amountInCents = Math.round(Number(grandTotal) * 100);

    // Process payment through Square Payments API
    const paymentResponse = await squareClient.payments.create({
      sourceId: sourceId,
      idempotencyKey: crypto.randomUUID(),
      amountMoney: {
        amount: BigInt(amountInCents),
        currency: 'USD',
      },
      note: `Farm Fresh Direct Order - Code ${pickupCode}`,
    });

    const payment = paymentResponse.payment;

    if (payment?.status !== 'COMPLETED') {
      return NextResponse.json({ error: 'Square payment failed to complete.' }, { status: 400 });
    }

    // Insert order in Supabase
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert([
        {
          buyer_id: buyerId,
          listing_id: listingId || null,
          quantity: orderQuantity,
          reserved_quantity: orderQuantity,
          total_price: grandTotal,
          deposit_amount: grandTotal,
          authorized_amount: grandTotal,
          balance_due_at_pickup: 0.00,
          payment_method: 'square_card_online',
          payment_status: 'paid',
          square_payment_id: payment.id,
          pickup_code: pickupCode,
          verification_code: pickupCode,
        },
      ])
      .select()
      .single();

    if (orderError) throw orderError;

    // Decrement the listing's available quantity now that payment succeeded.
    // Note: the customer has already been charged at this point, so a failure
    // here is logged but does not fail the whole request — the order itself
    // still exists and was paid for.
    const newAvailable = Math.max(0, currentAvailable - orderQuantity);
    const { error: updateError } = await supabase
      .from('produce_listings')
      .update({ available_quantity: newAvailable })
      .eq('id', listingId);

    if (updateError) {
      console.error('Failed to update listing available_quantity after successful payment:', updateError);
    }

    return NextResponse.json({ success: true, orderId: order.id, code: pickupCode });
  } catch (err: any) {
    console.error('Square Payment API Error:', err);
    return NextResponse.json(
      { error: err.message || 'Payment processing failed.' },
      { status: 500 }
    );
  }
}