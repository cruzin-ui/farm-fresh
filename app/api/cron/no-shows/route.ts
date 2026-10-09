import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { resolveNoShow, refundOrderQuantity } from '@/lib/orderActions';
import { getPickupCodeRecord } from '@/lib/pickupCodes';
import {
  readyBy,
  autoCancelAt,
  formatDeadline,
  REMINDER_HOURS_BEFORE,
  AUTO_CANCEL_DAYS,
} from '@/lib/pickupRules';
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

// Run on a schedule by Vercel Cron (see vercel.json). It does two jobs.
//
// Pickup deadlines (see lib/pickupRules.ts): reminds a seller the day before
// an order has to be marked ready, cancels and fully refunds an order that
// still hasn't been marked ready after AUTO_CANCEL_DAYS, and reminds a buyer
// the day before their time to collect runs out.
//
// No-show reports: closes no-show reports
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

    // ---- Pickup deadlines ----
    const siteUrl = new URL(request.url).origin;
    const now = Date.now();
    const reminderWindowMs = REMINDER_HOURS_BEFORE * 60 * 60 * 1000;
    const autoCancelled: string[] = [];
    let sellerReminders = 0;
    let buyerReminders = 0;

    const listingCache = new Map<string, any>();
    const listingFor = async (listingId: string) => {
      if (!listingCache.has(listingId)) {
        const { data } = await supabaseAdmin
          .from('produce_listings')
          .select('title, unit_type, farmer_id, available_quantity')
          .eq('id', listingId)
          .maybeSingle();
        listingCache.set(listingId, data || null);
      }
      return listingCache.get(listingId);
    };

    const sellerEmailCache = new Map<string, string | null>();
    const sellerEmailFor = async (farmerId: string) => {
      if (!sellerEmailCache.has(farmerId)) {
        const { data } = await supabaseAdmin.auth.admin.getUserById(farmerId);
        sellerEmailCache.set(farmerId, data?.user?.email || null);
      }
      return sellerEmailCache.get(farmerId) || null;
    };

    const { data: waitingOrders } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('status', 'pending_pickup')
      .limit(300);

    for (const order of waitingOrders || []) {
      const label = `#${String(order.id).slice(0, 8)} (${order.buyer_email || 'unknown buyer'})`;

      try {
        const deadline = readyBy(order);
        const cancelAt = autoCancelAt(order);
        // Placed before deadlines existed: nothing was promised, so leave it.
        if (!deadline || !cancelAt) continue;

        const listing = await listingFor(order.listing_id);
        if (!listing) continue;

        const quantity = Number(order.reserved_quantity ?? order.quantity ?? 0);
        const what = `${quantity} ${escapeHtml(listing.unit_type || 'units')} of ${escapeHtml(listing.title || 'your listing')}`;
        const sellerEmail = listing.farmer_id ? await sellerEmailFor(listing.farmer_id) : null;

        if (now > cancelAt.getTime()) {
          // Never marked ready: give the buyer everything back, fee included.
          const { refundAmount } = await refundOrderQuantity({
            order,
            listing,
            newQuantity: 0,
            restock: true,
            note: "The farmer didn't have this order ready in time, so it was cancelled automatically and refunded in full, including the service fee.",
          });
          autoCancelled.push(`${label} — $${refundAmount.toFixed(2)} refunded`);

          if (sellerEmail) {
            await sendEmail({
              to: sellerEmail,
              subject: `Order cancelled: it was not marked ready in time`,
              html: `
                <div style="font-family: sans-serif; max-width: 480px;">
                  <h2 style="color: #b45309;">An order was cancelled automatically</h2>
                  <p>
                    The order for <strong>${what}</strong> was not marked ready for pickup within
                    ${AUTO_CANCEL_DAYS} days, so it has been cancelled and the buyer refunded in full. The
                    quantity has been put back on your listing.
                  </p>
                  <p>
                    If you can't fill an order, please cancel it from your Seller Dashboard straight away so
                    the buyer isn't left waiting.
                  </p>
                </div>
              `,
            });
          }
          continue;
        }

        if (!order.seller_reminded_at && now >= deadline.getTime() - reminderWindowMs && sellerEmail) {
          const overdue = now > deadline.getTime();
          await sendEmail({
            to: sellerEmail,
            subject: overdue
              ? `Overdue: please mark your order of ${listing.title || 'produce'} ready`
              : `Reminder: mark your order of ${listing.title || 'produce'} ready by ${formatDeadline(deadline)}`,
            html: `
              <div style="font-family: sans-serif; max-width: 480px;">
                <h2 style="color: #b45309;">${overdue ? 'This order is overdue' : 'An order is due to be ready'}</h2>
                <p>
                  The order for <strong>${what}</strong> ${
                    overdue ? 'was due to be marked ready by' : 'needs to be marked ready by'
                  } <strong>${formatDeadline(deadline)}</strong>.
                </p>
                <p>
                  ${
                    overdue
                      ? 'The buyer can now cancel it for a full refund.'
                      : 'After that date the buyer can cancel it for a full refund.'
                  } If it still isn't marked ready by ${formatDeadline(cancelAt)}, it is cancelled
                  and refunded automatically. If you can't fill it, please cancel it from your Seller Dashboard.
                </p>
                <p><a href="${siteUrl}/dashboard">Open your Seller Dashboard</a></p>
              </div>
            `,
          });
          await supabaseAdmin.from('orders').update({ seller_reminded_at: new Date().toISOString() }).eq('id', order.id);
          sellerReminders += 1;
        }
      } catch (err: any) {
        console.error('ready-deadline check failed for order', order.id, err);
        await alertAdmin('checking an order against its ready-by deadline', err, { order: order.id });
        failed.push(`${label} — ${err?.message || 'unknown error'}`);
      }
    }

    // Buyers whose time to collect is nearly up and who haven't been reminded.
    const { data: readyOrders } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('status', 'ready_for_pickup')
      .not('pickup_by', 'is', null)
      .is('buyer_reminded_at', null)
      .is('no_show_reported_at', null)
      .limit(300);

    for (const order of readyOrders || []) {
      try {
        const pickupBy = new Date(order.pickup_by).getTime();
        if (!order.buyer_email || now < pickupBy - reminderWindowMs || now > pickupBy) continue;

        const listing = await listingFor(order.listing_id);
        const codeRecord = await getPickupCodeRecord(order.id);

        await sendEmail({
          to: order.buyer_email,
          subject: `Reminder: pick up your ${listing?.title || 'order'} by ${formatDeadline(order.pickup_by)}`,
          html: `
            <div style="font-family: sans-serif; max-width: 480px;">
              <h2 style="color: #059669;">Your order is waiting for you</h2>
              <p>
                <strong>${escapeHtml(listing?.title || 'Your order')}</strong> is ready, and needs to be picked up by
                <strong>${formatDeadline(order.pickup_by)}</strong>.
              </p>
              ${order.pickup_address ? `<p>Pickup address: <strong>${escapeHtml(order.pickup_address)}</strong></p>` : ''}
              ${order.pickup_details ? `<p style="white-space: pre-wrap;">${escapeHtml(String(order.pickup_details))}</p>` : ''}
              <p>
                If you can't make it, please cancel from your order page. An order that isn't collected can be
                closed as not picked up, with a restocking fee.
              </p>
              ${
                codeRecord?.guestToken
                  ? `<p><a href="${siteUrl}/orders/confirmation?orderId=${order.id}&token=${codeRecord.guestToken}">View your order</a></p>`
                  : `<p><a href="${siteUrl}/orders">View your orders</a></p>`
              }
            </div>
          `,
        });
        await supabaseAdmin.from('orders').update({ buyer_reminded_at: new Date().toISOString() }).eq('id', order.id);
        buyerReminders += 1;
      } catch (err: any) {
        console.error('pickup reminder failed for order', order.id, err);
        await alertAdmin('sending a pickup reminder', err, { order: order.id });
      }
    }

    console.log(
      `Daily job: ${closed.length} no-shows closed, ${held.length} held, ${autoCancelled.length} cancelled as never ready, ${sellerReminders} seller reminders, ${buyerReminders} buyer reminders, ${failed.length} failed`
    );

    const recipients = adminRecipients();
    if (recipients.length > 0 && closed.length + held.length + failed.length + autoCancelled.length > 0) {
      const list = (title: string, items: string[]) =>
        items.length
          ? `<p><strong>${title}</strong></p><ul>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`
          : '';

      await sendEmail({
        to: recipients,
        subject: `[Farm Fresh Direct] Daily order review: ${closed.length + autoCancelled.length} closed automatically`,
        html: `
          <div style="font-family: sans-serif; max-width: 560px;">
            <h2 style="color: #059669;">Daily order review</h2>
            ${list(`Closed as no-shows after ${NO_SHOW_REVIEW_HOURS} hours with no response`, closed)}
            ${list('Held for your decision', held)}
            ${list(`Cancelled and fully refunded: not marked ready within ${AUTO_CANCEL_DAYS} days`, autoCancelled)}
            ${list('Could not be closed automatically — needs your attention', failed)}
            <p><a href="${siteUrl}/admin">Open the admin page</a></p>
          </div>
        `,
      });
    }

    return NextResponse.json({
      closed: closed.length,
      held: held.length,
      autoCancelled: autoCancelled.length,
      sellerReminders,
      buyerReminders,
      failed: failed.length,
    });
  } catch (err: any) {
    console.error('no-show cron error:', err);
    await alertAdmin('no-show cron error', err);
    return NextResponse.json({ error: err.message || 'Cron run failed.' }, { status: 500 });
  }
}
