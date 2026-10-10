import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getRequestUser } from '@/lib/apiAuth';
import { sendEmail, escapeHtml } from '@/lib/email';
import { timingSafeEqual } from 'crypto';
import { alertAdmin } from '@/lib/alerts';
import { getPickupCodeRecord } from '@/lib/pickupCodes';

export const dynamic = 'force-dynamic';

const MAX_SUBJECT_LENGTH = 150;
const MAX_MESSAGE_LENGTH = 4000;
const MAX_PER_EMAIL_PER_HOUR = 5;
const MAX_TOTAL_PER_HOUR = 60;

// Where contact messages are emailed: CONTACT_EMAIL if set, otherwise every
// address in ADMIN_EMAILS.
function contactRecipients() {
  return (process.env.CONTACT_EMAIL || process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean);
}

// The public "Contact Us" form. Anyone can send a message, signed in or not;
// it is saved for the admin page and emailed to the site owner. Because it is
// open to the world, it has a honeypot field, length limits and hourly caps.
export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Honeypot: a field hidden from people. Only bots fill it in, so pretend
    // it worked and drop the message.
    if (body.website) {
      return NextResponse.json({ success: true });
    }

    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
    const message = typeof body.message === 'string' ? body.message.trim() : '';

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Enter a valid email address so we can reply.' }, { status: 400 });
    }
    if (!subject || subject.length > MAX_SUBJECT_LENGTH) {
      return NextResponse.json(
        { error: `Enter a subject of up to ${MAX_SUBJECT_LENGTH} characters.` },
        { status: 400 }
      );
    }
    if (!message || message.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json(
        { error: `Enter a message of up to ${MAX_MESSAGE_LENGTH} characters.` },
        { status: 400 }
      );
    }

    const anHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const { count: fromThisEmail } = await supabaseAdmin
      .from('contact_messages')
      .select('id', { count: 'exact', head: true })
      .eq('email', email)
      .gte('created_at', anHourAgo);

    const { count: total } = await supabaseAdmin
      .from('contact_messages')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', anHourAgo);

    if ((fromThisEmail ?? 0) >= MAX_PER_EMAIL_PER_HOUR || (total ?? 0) >= MAX_TOTAL_PER_HOUR) {
      return NextResponse.json(
        { error: "We've received a lot of messages recently. Please try again in a little while." },
        { status: 429 }
      );
    }

    const user = await getRequestUser(request);

    const { error: insertError } = await supabaseAdmin
      .from('contact_messages')
      .insert([{ email, subject, message, user_id: user?.id ?? null }]);

    if (insertError) {
      console.error('contact message insert failed:', insertError);
      return NextResponse.json({ error: 'Could not send your message. Please try again.' }, { status: 500 });
    }

    // Sent from an order's "Trouble with this order?" button: flag the order
    // on the admin page too, but only if the sender really is its buyer (their
    // account, or a guest's secret order link). Otherwise the message is still
    // delivered and the order is left alone.
    let flaggedOrder = false;
    const orderId = typeof body.orderId === 'string' ? body.orderId : '';
    if (/^[0-9a-f-]{36}$/i.test(orderId)) {
      try {
        const { data: order } = await supabaseAdmin
          .from('orders')
          .select('id, buyer_id, guest_access_token')
          .eq('id', orderId)
          .maybeSingle();

        let isBuyer = Boolean(order && user && order.buyer_id && order.buyer_id === user.id);
        const orderToken = typeof body.orderToken === 'string' ? body.orderToken : '';
        if (order && !isBuyer && !order.buyer_id && orderToken) {
          const expected = (await getPickupCodeRecord(order.id))?.guestToken || order.guest_access_token || '';
          const a = Buffer.from(expected);
          const b = Buffer.from(orderToken);
          isBuyer = a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
        }

        if (order && isBuyer) {
          const { error: flagError } = await supabaseAdmin
            .from('orders')
            .update({
              buyer_problem_at: new Date().toISOString(),
              buyer_problem_note: message.slice(0, 1000),
              buyer_problem_resolved_at: null,
            })
            .eq('id', order.id);
          if (flagError) throw flagError;
          flaggedOrder = true;
        }
      } catch (flagErr) {
        console.error('Could not flag the order a contact message was about:', flagErr);
      }
    }

    const recipients = contactRecipients();
    if (recipients.length > 0) {
      await sendEmail({
        to: recipients,
        replyTo: email,
        subject: `[Farm Fresh Direct contact] ${subject}`,
        html: `
          <div style="font-family: sans-serif; max-width: 520px;">
            <h2 style="color: #059669;">New contact message</h2>
            <p><strong>From:</strong> ${escapeHtml(email)}${user ? ' (signed-in user)' : ''}</p>
            <p><strong>Subject:</strong> ${escapeHtml(subject)}</p>
            <p style="white-space: pre-wrap;">${escapeHtml(message)}</p>
            ${flaggedOrder ? '<p><strong>This came from the buyer\'s order page, and the order is now flagged under Needs attention on the admin page.</strong></p>' : ''}
            <p style="margin-top: 20px; font-size: 12px; color: #6b7280;">
              Reply to this email to answer them directly. The message is also on the admin page.
            </p>
          </div>
        `,
      });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('contact error:', err);
    await alertAdmin('contact error', err);
    return NextResponse.json({ error: 'Could not send your message. Please try again.' }, { status: 500 });
  }
}
