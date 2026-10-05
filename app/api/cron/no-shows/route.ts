import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { resolveNoShow } from '@/lib/orderActions';
import { sendEmail, escapeHtml } from '@/lib/email';
import { NO_SHOW_REVIEW_HOURS } from '@/lib/noShow';
import { alertAdmin } from '@/lib/alerts';

export const dynamic = 'force-dynamic';

function adminRecipients() {
  return (process.env.CONTACT_EMAIL || process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean);
}

// Run on a schedule by Vercel Cron (see vercel.json). Closes no-show reports
// that the buyer hasn't answered within the review period: the buyer is
// refunded less the service fee and the farmer's restocking fee, exactly as
// when an admin clicks No-Show.
//
// A report is left for an admin instead if the buyer disputed it through the
// link in their email, or has sent a contact message since the report. A
// reply sent by plain email can't be seen here — an admin who gets one should
// use "Hold for Review" on the admin page.
//
// Vercel sends "Authorization: Bearer <CRON_SECRET>" with scheduled calls.
// Without that secret configured, or with the wrong one, this does nothing.
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 401 });
  }

  try {
    const cutoff = new Date(Date.now() - NO_SHOW_REVIEW_HOURS * 60 * 60 * 1000).toISOString();

    const { data: orders, error } = await supabaseAdmin
      .from('orders')
      .select('*')
      .in('status', ['pending_pickup', 'ready_for_pickup'])
      .not('no_show_reported_at', 'is', null)
      .is('no_show_disputed_at', null)
      .lte('no_show_reported_at', cutoff)
      .limit(100);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const closed: string[] = [];
    const held: string[] = [];
    const failed: string[] = [];

    for (const order of orders || []) {
      const label = `#${String(order.id).slice(0, 8)} (${order.buyer_email || 'unknown buyer'})`;

      try {
        // Any contact message from this buyer since the report counts as a response.
        if (order.buyer_email) {
          const { count } = await supabaseAdmin
            .from('contact_messages')
            .select('id', { count: 'exact', head: true })
            .eq('email', String(order.buyer_email).toLowerCase())
            .gte('created_at', order.no_show_reported_at);

          if ((count ?? 0) > 0) {
            await supabaseAdmin
              .from('orders')
              .update({ no_show_disputed_at: new Date().toISOString() })
              .eq('id', order.id);
            held.push(`${label} — the buyer sent a contact message`);
            continue;
          }
        }

        const { data: listing } = await supabaseAdmin
          .from('produce_listings')
          .select('title, unit_type, farmer_id, available_quantity')
          .eq('id', order.listing_id)
          .maybeSingle();

        if (!listing) {
          failed.push(`${label} — its listing no longer exists`);
          continue;
        }

        const { refundAmount, restockingFee } = await resolveNoShow({
          order,
          listing,
          farmerId: listing.farmer_id,
        });

        closed.push(`${label} — $${refundAmount.toFixed(2)} refunded, $${restockingFee.toFixed(2)} to the farmer`);
      } catch (err: any) {
        console.error('auto no-show failed for order', order.id, err);
        await alertAdmin('closing a no-show automatically', err, { order: order.id });
        failed.push(`${label} — ${err?.message || 'unknown error'}`);
      }
    }

    console.log(`No-show cron: ${closed.length} closed, ${held.length} held, ${failed.length} failed`);

    const recipients = adminRecipients();
    if (recipients.length > 0 && closed.length + held.length + failed.length > 0) {
      const list = (title: string, items: string[]) =>
        items.length
          ? `<p><strong>${title}</strong></p><ul>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`
          : '';

      await sendEmail({
        to: recipients,
        subject: `[Farm Fresh Direct] No-show reports: ${closed.length} closed automatically`,
        html: `
          <div style="font-family: sans-serif; max-width: 560px;">
            <h2 style="color: #059669;">Automatic no-show review</h2>
            ${list(`Closed as no-shows after ${NO_SHOW_REVIEW_HOURS} hours with no response`, closed)}
            ${list('Held for your decision', held)}
            ${list('Could not be closed automatically — needs your attention', failed)}
            <p><a href="${new URL(request.url).origin}/admin">Open the admin page</a></p>
          </div>
        `,
      });
    }

    return NextResponse.json({ closed: closed.length, held: held.length, failed: failed.length });
  } catch (err: any) {
    console.error('no-show cron error:', err);
    await alertAdmin('no-show cron error', err);
    return NextResponse.json({ error: err.message || 'Cron run failed.' }, { status: 500 });
  }
}
