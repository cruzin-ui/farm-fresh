import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { orderId, pickupDetails } = body;

    if (!orderId || !pickupDetails) {
      return NextResponse.json({ error: 'Missing order or pickup details.' }, { status: 400 });
    }

    const { data: order, error: fetchError } = await supabaseAdmin
      .from('orders')
      .select('*, produce_listings(title, farmer_id)')
      .eq('id', orderId)
      .single();

    if (fetchError || !order) {
      return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    }

    const { error: updateError } = await supabaseAdmin
      .from('orders')
      .update({ status: 'ready_for_pickup', pickup_details: pickupDetails })
      .eq('id', orderId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    if (order.buyer_email && process.env.RESEND_API_KEY) {
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'Farm Fresh Direct <onboarding@resend.dev>',
            to: [order.buyer_email],
            subject: `Your order is ready for pickup! (${order.pickup_code || order.verification_code})`,
            html: `
              <div style="font-family: sans-serif; max-width: 480px;">
                <h2 style="color: #059669;">Your harvest is ready!</h2>
                <p><strong>${order.produce_listings?.title || 'Your order'}</strong> is ready for pickup.</p>
                <p style="white-space: pre-wrap;">${pickupDetails}</p>
                <p>Your pickup code: <strong>${order.pickup_code || order.verification_code}</strong></p>
              </div>
            `,
          }),
        });
        if (!res.ok) {
          console.error('Resend error notifying buyer:', await res.text());
        }
      } catch (emailErr) {
        console.error('Failed to send buyer pickup-ready email:', emailErr);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('mark-ready error:', err);
    return NextResponse.json({ error: err.message || 'Failed to mark order ready.' }, { status: 500 });
  }
}