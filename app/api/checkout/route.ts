import { NextResponse } from 'next/server';
import { Client, Environment } from 'square';
import { supabase } from '@/lib/supabaseClient';

const squareClient = new Client({
  accessToken: process.env.SQUARE_ACCESS_TOKEN,
  environment: process.env.SQUARE_ENVIRONMENT === 'production' 
    ? Environment.Production 
    : Environment.Sandbox,
});

export async function POST(request: Request) {
  try {
    const { sourceId, listingId, quantity, subtotal, buyerFee, grandTotal } = await request.json();

    // Generate pickup code
    const pickupCode = `FFD-${Math.floor(1000 + Math.random() * 9000)}`;

    // Process payment through Square
    const paymentsApi = squareClient.paymentsApi;
    const paymentResponse = await paymentsApi.createPayment({
      sourceId: sourceId,
      idempotencyKey: crypto.randomUUID(),
      amountMoney: {
        amount: BigInt(Math.round(grandTotal * 100)),
        currency: 'USD',
      },
      note: `Farm Fresh Direct Order - Code ${pickupCode}`,
    });

    const payment = paymentResponse.result.payment;

    if (payment?.status !== 'COMPLETED') {
      return NextResponse.json({ error: 'Square payment failed to complete.' }, { status: 400 });
    }

    // Insert order in Supabase
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert([
        {
          listing_id: listingId,
          quantity: quantity,
          total_price: grandTotal,
          deposit_amount: grandTotal,
          balance_due_at_pickup: 0.00,
          payment_method: 'square_card_online',
          payment_status: 'paid',
          square_payment_id: payment.id,
          pickup_code: pickupCode,
        },
      ])
      .select()
      .single();

    if (orderError) throw orderError;

    return NextResponse.json({ success: true, orderId: order.id, code: pickupCode });
  } catch (err: any) {
    console.error('Square Payment API Error:', err);
    return NextResponse.json(
      { error: err.message || 'Payment processing failed.' },
      { status: 500 }
    );
  }
}