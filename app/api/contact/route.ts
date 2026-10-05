import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getRequestUser } from '@/lib/apiAuth';
import { sendEmail, escapeHtml } from '@/lib/email';
import { alertAdmin } from '@/lib/alerts';

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
