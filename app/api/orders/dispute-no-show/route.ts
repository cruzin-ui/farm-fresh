import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyNoShowDispute } from '@/lib/noShowDispute';
import { sendEmail, escapeHtml } from '@/lib/email';
import { alertAdmin } from '@/lib/alerts';

export const dynamic = 'force-dynamic';

function adminRecipients() {
  return (process.env.CONTACT_EMAIL || process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean);
}

// The buyer's answer to a no-show report: "that's not right" or "I still want
// my order". It stops the order from being closed automatically and hands the
// decision to an admin. Authorised by the signed link from the buyer's email,
// so it works for guests and without signing in.
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { orderId, sig } = body;
    const message = typeof body.message === 'string' ? body.message.trim().slice(0, 1000) : '';

    if (!orderId || typeof sig !== 'string' || !verifyNoShowDispute(String(orderId), sig)) {
      return NextResponse.json({ error: 'This link is not valid.' }, { status: 404 });
    }

    const { data: order } = await supabaseAdmin
      .from('orders')
      .select('id, status, buyer_email, no_show_reported_at, no_show_disputed_at')
      .eq('id', orderId)
      .maybeSingle();

    if (!order) {
      return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    }

    if (order.status !== 'pending_pickup' && order.status !== 'ready_for_pickup') {
      return NextResponse.json(
        { error: 'This order has already been closed. Please contact us if you think that was a mistake.' },
        { status: 409 }
      );
    }

    if (!order.no_show_reported_at) {
      return NextResponse.json({ success: true, message: 'There is no open no-show report on this order.' });
    }

    if (!order.no_show_disputed_at) {
      const { error } = await supabaseAdmin
        .from('orders')
        .update({ no_show_disputed_at: new Date().toISOString() })
        .eq('id', order.id);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      const recipients = adminRecipients();
      if (recipients.length > 0) {
        await sendEmail({
          to: recipients,
          replyTo: order.buyer_email || undefined,
          subject: `[Farm Fresh Direct] Buyer disputes no-show on order #${String(order.id).slice(0, 8)}`,
          html: `
            <div style="font-family: sans-serif; max-width: 520px;">
              <h2 style="color: #b45309;">A buyer responded to a no-show report</h2>
              <p>Buyer: ${escapeHtml(order.buyer_email || 'unknown')}</p>
              ${message ? `<p style="white-space: pre-wrap;">Their message: ${escapeHtml(message)}</p>` : '<p>They left no message.</p>'}
              <p>
                This order will <strong>not</strong> be closed automatically. It needs your decision on the
                admin page.
              </p>
              <p><a href="${new URL(request.url).origin}/admin">Open the admin page</a></p>
            </div>
          `,
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('dispute no-show error:', err);
    await alertAdmin('dispute no-show error', err);
    return NextResponse.json({ error: 'Could not record your response. Please contact us.' }, { status: 500 });
  }
}
