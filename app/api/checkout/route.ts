import { NextResponse } from 'next/server';
import { SquareClient, SquareEnvironment } from 'square';
import { supabase } from '@/lib/supabaseClient';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

const squareClient = new SquareClient({
  token: process.env.SQUARE_ACCESS_TOKEN || '',
  environment: process.env.SQUARE_ENVIRONMENT === 'production'
    ? SquareEnvironment.Production
    : SquareEnvironment.Sandbox,
});

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

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { sourceId, listingId, quantity, grandTotal, buyerId, buyerEmail } = body;

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

    // Fetch listing including farmer_id so we know who to notify afterward.
    const { data: listing, error: listingFetchError } = await supabaseAdmin
      .from('produce_listings')
      .select('available_quantity, title, unit_type, farmer_id')
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

    const pickupCode = `FFD-${Math.floor(1000 + Math.random() * 9000)}`;
    const amountInCents = Math.round(Number(grandTotal) * 100);

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
          buyer_email: buyerEmail || null,
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
    const newAvailable = Math.max(0, currentAvailable - orderQuantity);
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
          buyerEmail: buyerEmail || null,
          totalPrice: Number(grandTotal),
          pickupCode,
        });
      }
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