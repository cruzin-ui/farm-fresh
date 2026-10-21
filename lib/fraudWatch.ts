import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { sendEmail, escapeHtml } from '@/lib/email';
import { notifyAdmins } from '@/lib/alerts';
import { logAdminAction } from '@/lib/adminLog';
import { isSellerSuspended } from '@/lib/accountBlocks';
import { SELLER_CANCEL_LIMIT, SELLER_CANCEL_WINDOW_DAYS } from '@/lib/sellerLimits';
import { countSince } from '@/lib/limitResets';

// SERVER-ONLY. Automatic watches for the patterns that cost a marketplace
// money. None of them blocks an honest sale; they tell an admin early, and in
// one case put a brake on.
//
// 1. A NEW seller getting an unusually large order, or a burst of orders. That
//    is what cashing out stolen cards through a made-up farm looks like, and
//    the weekly payout leaves time to act on it.
// 2. A seller cancelling a lot of orders in a short time. Every cancelled
//    order costs the platform its card and tax fees, so a seller (or a pair
//    working together) could run up a bill by ordering and cancelling. Past
//    the limit the seller is suspended automatically until an admin lifts it.

// A seller counts as new for this long after their account was created.
export const NEW_SELLER_DAYS = 30;
// One buyer's order from a new seller at or above this produce total is flagged.
export const LARGE_ORDER_CENTS = 150_00;
// A new seller is flagged at this many orders in 24 hours, and at each multiple of it.
export const BUSY_DAY_ORDERS = 5;


const DAY_MS = 24 * 60 * 60 * 1000;

async function listingIdsOf(farmerId: string) {
  const { data } = await supabaseAdmin.from('produce_listings').select('id').eq('farmer_id', farmerId);
  return (data || []).map((l) => l.id as string);
}

// Orders are stored one row per item; what a person thinks of as an order is
// a checkout, so that is what gets counted.
const countCheckouts = (rows: { id: string; checkout_id: string | null }[]) =>
  new Set(rows.map((row) => row.checkout_id || row.id)).size;

// Called when a sale to a farm is recorded. Never throws.
export async function watchNewSellerOrder(params: {
  farmerId: string;
  farmName: string;
  sellerCreatedAt?: string | null;
  subtotalCents: number;
  orderNumber: string;
  buyerEmail?: string | null;
  siteUrl?: string;
}) {
  try {
    const { farmerId, farmName, sellerCreatedAt, subtotalCents, orderNumber, buyerEmail, siteUrl } = params;
    if (!sellerCreatedAt) return;

    const ageDays = (Date.now() - new Date(sellerCreatedAt).getTime()) / DAY_MS;
    if (ageDays > NEW_SELLER_DAYS) return;

    const reasons: string[] = [];
    if (subtotalCents >= LARGE_ORDER_CENTS) {
      reasons.push(
        `This order is for $${(subtotalCents / 100).toFixed(2)} of produce, which is at or over the $${(LARGE_ORDER_CENTS / 100).toFixed(0)} that is flagged for a new seller.`
      );
    }

    const listingIds = await listingIdsOf(farmerId);
    if (listingIds.length > 0) {
      const { data: recent } = await supabaseAdmin
        .from('orders')
        .select('id, checkout_id')
        .in('listing_id', listingIds)
        .gte('created_at', new Date(Date.now() - DAY_MS).toISOString())
        .limit(1000);
      const today = countCheckouts((recent || []) as { id: string; checkout_id: string | null }[]);
      if (today >= BUSY_DAY_ORDERS && today % BUSY_DAY_ORDERS === 0) {
        reasons.push(`They have had ${today} orders in the last 24 hours.`);
      }
    }

    if (reasons.length === 0) return;

    await notifyAdmins(
      `New seller to look at: ${farmName}`,
      `
        <h2 style="color: #b45309;">A new seller's orders are worth a look</h2>
        <p>
          <strong>${escapeHtml(farmName)}</strong> joined ${Math.max(0, Math.floor(ageDays))} day${Math.floor(ageDays) === 1 ? '' : 's'} ago
          and has just received order <strong style="font-family: monospace;">${escapeHtml(orderNumber)}</strong>
          from ${escapeHtml(buyerEmail || 'an unknown buyer')}.
        </p>
        <ul>${reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join('')}</ul>
        <p>
          This is usually just a good first week. It is also what someone cashing out stolen cards through their
          own listing looks like. Nothing has been changed. If the buyer and seller look connected, or the orders
          are picked up minutes after being placed, use Cancel &amp; Refund and suspend the seller before Friday's
          payout.
        </p>
        ${siteUrl ? `<p><a href="${siteUrl}/admin">Open the admin page</a></p>` : ''}
      `
    );
  } catch (err) {
    console.error('New-seller watch failed:', err);
  }
}

// Called after a seller cancels an order. Suspends them if they have cancelled
// too many recently. Returns true if this call suspended them. Never throws.
export async function checkSellerCancellations(farmerId: string, siteUrl?: string) {
  try {
    const listingIds = await listingIdsOf(farmerId);
    // Counted from the start of the window, or from an admin's reset of
    // this seller's limit if that is later.
    const since = await countSince(farmerId, SELLER_CANCEL_WINDOW_DAYS);
    const { data: cancelled } = listingIds.length
      ? await supabaseAdmin
          .from('orders')
          .select('id, checkout_id')
          .in('listing_id', listingIds)
          .eq('status', 'cancelled')
          .in('cancel_reason', ['seller', 'never_ready'])
          .gte('created_at', since)
          .limit(1000)
      : { data: [] };
    // A partner farm's part of a shared Farm Box that never arrived counts as
    // one cancellation for each pickup it missed.
    const { count: missedParts } = await supabaseAdmin
      .from('csa_farm_weeks')
      .select('plan_id', { count: 'exact', head: true })
      .eq('farmer_id', farmerId)
      .eq('status', 'missing')
      .gte('updated_at', since);

    const count = countCheckouts((cancelled || []) as { id: string; checkout_id: string | null }[]) + (missedParts || 0);
    if (count < SELLER_CANCEL_LIMIT) return false;
    if (await isSellerSuspended(farmerId)) return false;

    const { data: profile } = await supabaseAdmin.from('seller_profiles').select('farm_name').eq('id', farmerId).maybeSingle();
    const farmName = profile?.farm_name || 'Unnamed farm';
    const { data: sellerUser } = await supabaseAdmin.auth.admin.getUserById(farmerId);
    const sellerEmail = sellerUser?.user?.email || null;
    const reason = `Automatic: ${count} orders placed in the last ${SELLER_CANCEL_WINDOW_DAYS} days were cancelled by the seller or never made ready.`;

    const { error } = await supabaseAdmin
      .from('account_blocks')
      .insert([{ scope: 'seller', user_id: farmerId, email: sellerEmail, reason, created_by: 'automatic' }]);
    if (error) {
      // Someone else suspended them in the same moment, or the table isn't there.
      if (error.code !== '23505') console.error('Could not suspend a seller automatically:', error.message);
      return false;
    }

    await logAdminAction('automatic', 'Suspended a seller', farmName, reason);

    if (sellerEmail) {
      await sendEmail({
        to: sellerEmail,
        subject: 'Your Farm Fresh Direct listings have been paused',
        html: `
          <div style="font-family: sans-serif; max-width: 480px;">
            <h2 style="color: #b45309;">Your listings are paused for now</h2>
            <p>
              ${count} of your recent orders were cancelled or not made ready, so your listings have been paused
              automatically and you can't post new ones for the moment. This happens to protect buyers when
              several orders in a row fall through; it is not a judgement about why.
            </p>
            <p>
              Orders you still have are not affected: please prepare them and hand them over as usual.
            </p>
            <p>
              If your harvest fell short or something else went wrong, just
              <a href="${siteUrl || ''}/contact">tell us what happened</a> and we'll get your listings back up.
            </p>
          </div>
        `,
      });
    }

    await notifyAdmins(
      `Seller paused automatically: ${farmName}`,
      `
        <h2 style="color: #b91c1c;">A seller was suspended automatically</h2>
        <p>
          <strong>${escapeHtml(farmName)}</strong>${sellerEmail ? ` (${escapeHtml(sellerEmail)})` : ''} has had
          <strong>${count} orders</strong> placed in the last ${SELLER_CANCEL_WINDOW_DAYS} days cancelled by them or
          never made ready. The limit is ${SELLER_CANCEL_LIMIT}.
        </p>
        <p>
          Their listings are hidden and they can't post new ones. Their open orders were left alone, and they have
          been emailed. Each cancelled order costs us its card and tax fees, so this is also the pattern of someone
          running up those costs on purpose: check whether the same buyers keep appearing.
        </p>
        <p>
          If it was an honest shortfall, lift the suspension under <strong>Suspended &amp; blocked</strong> on the
          admin page.
        </p>
        ${siteUrl ? `<p><a href="${siteUrl}/admin">Open the admin page</a></p>` : ''}
      `
    );

    return true;
  } catch (err) {
    console.error('Seller cancellation check failed:', err);
    return false;
  }
}
