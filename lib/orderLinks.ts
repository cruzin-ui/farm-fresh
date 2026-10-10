import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getPickupCodeRecord } from '@/lib/pickupCodes';
import { sendEmail, escapeHtml } from '@/lib/email';
import { orderRef } from '@/lib/pickupGroups';

// SERVER-ONLY. Emails a guest the links to their orders again, for when they
// have lost the confirmation email.
//
// The links are only ever SENT to the address the orders were placed with,
// never shown on screen, so asking for someone else's gets a stranger nothing:
// the real buyer simply receives a copy of their own links.

// Orders older than this are left out.
const LOOKBACK_DAYS = 90;

const STATUS_TEXT: Record<string, string> = {
  pending_pickup: 'Being prepared',
  ready_for_pickup: 'Ready for pickup',
  completed: 'Picked up',
  cancelled: 'Cancelled',
};

export const looksLikeEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;

// Sends the email if there is anything to send. Returns how many orders it
// listed (0 means nothing was sent).
export async function sendGuestOrderLinks(email: string, siteUrl: string) {
  const address = email.trim();
  // Matched exactly, ignoring case: % and _ would otherwise act as wildcards.
  const pattern = address.replace(/[\\%_]/g, (char) => `\\${char}`);
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: orders, error } = await supabaseAdmin
    .from('orders')
    .select('id, checkout_id, listing_id, buyer_id, status, created_at, guest_access_token')
    .ilike('buyer_email', pattern)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;

  const guestOrders = (orders || []).filter((o) => !o.buyer_id);
  const hasAccountOrders = (orders || []).some((o) => o.buyer_id);
  if (guestOrders.length === 0 && !hasAccountOrders) return 0;

  const listingIds = [...new Set(guestOrders.map((o) => o.listing_id).filter(Boolean))];
  const { data: listings } = listingIds.length
    ? await supabaseAdmin.from('produce_listings').select('id, title').in('id', listingIds)
    : { data: [] as { id: string; title: string }[] };
  const titleById = new Map((listings || []).map((l) => [l.id, l.title]));

  // One entry per checkout: a single link shows everything bought in it.
  const checkouts = new Map<string, typeof guestOrders>();
  for (const order of guestOrders) {
    const key = order.checkout_id || order.id;
    checkouts.set(key, [...(checkouts.get(key) || []), order]);
  }

  const entries: string[] = [];
  for (const items of checkouts.values()) {
    const first = items[0];
    const record = await getPickupCodeRecord(first.id);
    // Older guest orders kept their token on the order row.
    const token = record?.guestToken || first.guest_access_token;
    if (!token) continue;

    const open = items.filter((o) => o.status === 'pending_pickup' || o.status === 'ready_for_pickup');
    const status = items.some((o) => o.status === 'ready_for_pickup')
      ? STATUS_TEXT.ready_for_pickup
      : open.length > 0
        ? STATUS_TEXT.pending_pickup
        : STATUS_TEXT[first.status] || 'Closed';
    const titles = items.map((o) => titleById.get(o.listing_id) || 'Produce').join(', ');
    const placed = new Date(first.created_at).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      timeZone: 'America/Phoenix',
    });

    entries.push(`
      <div style="border: 1px solid #e5e7eb; border-radius: 12px; padding: 14px 16px; margin: 12px 0;">
        <p style="margin: 0; font-size: 12px; color: #6b7280;">Order <strong style="font-family: monospace; color: #111827;">${orderRef(first)}</strong> · placed ${placed} · ${status}</p>
        <p style="margin: 6px 0 12px; font-weight: bold;">${escapeHtml(titles)}</p>
        <a href="${siteUrl}/orders/confirmation?orderId=${first.id}&token=${token}" style="display: inline-block; background: #047857; color: #ffffff; text-decoration: none; font-weight: bold; padding: 10px 18px; border-radius: 8px;">View This Order</a>
      </div>`);
  }

  if (entries.length === 0 && !hasAccountOrders) return 0;

  await sendEmail({
    to: address,
    subject: 'Your Farm Fresh Direct order links',
    html: `
      <div style="font-family: sans-serif; max-width: 480px;">
        <h2 style="color: #059669;">Here are your orders</h2>
        ${
          entries.length > 0
            ? `<p>You asked us to send the links to your orders again. Each one opens your order, with its pickup code and details.</p>${entries.join('')}`
            : ''
        }
        ${
          hasAccountOrders
            ? `<p>${entries.length > 0 ? 'You also have orders' : 'Your orders are'} on your Farm Fresh Direct account. <a href="${siteUrl}/login?redirect=/orders">Sign in</a> to see them under My Orders.</p>`
            : ''
        }
        <p style="font-size: 12px; color: #6b7280;">
          Keep these links to yourself: anyone who has one can see that order and its pickup code. If you didn't
          ask for this email, you can ignore it; nothing about your orders has changed.
        </p>
      </div>
    `,
  });

  return entries.length || 1;
}
