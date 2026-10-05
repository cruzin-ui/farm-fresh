import type Stripe from 'stripe';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getOrCreatePickupCode, pickupCodeForFarm, guestTokenForCheckout } from '@/lib/pickupCodes';
import { sendEmail, escapeHtml } from '@/lib/email';
import { calculateFarmerPayoutCents } from '@/lib/pricing';
import { buyerGuidanceEmailHtml } from '@/lib/buyerGuidance';
import { alertAdmin } from '@/lib/alerts';

// One item of a checkout, as saved on the payment by /api/checkout.
type CheckoutLine = {
  listingId: string;
  quantity: number;
  subtotalCents: number;
  feeCents: number;
  taxCents: number;
};

// True for payments created by our checkout (and not, say, something made by
// hand in the Stripe Dashboard).
export function isCheckoutPayment(paymentIntent: Stripe.PaymentIntent) {
  const { checkout_id, listing_id, buyer_id, buyer_email } = paymentIntent.metadata || {};
  return Boolean((checkout_id || listing_id) && (buyer_id || buyer_email));
}

function checkoutLines(paymentIntent: Stripe.PaymentIntent): CheckoutLine[] {
  const metadata = paymentIntent.metadata || {};
  const count = Number(metadata.item_count) || 0;

  if (count > 0) {
    const lines: CheckoutLine[] = [];
    for (let i = 0; i < count; i++) {
      const [listingId, quantity, subtotalCents, feeCents, taxCents] = String(metadata[`item_${i}`] || '').split(':');
      if (!listingId) throw new Error(`Payment ${paymentIntent.id} is missing the details of item ${i + 1}.`);
      lines.push({
        listingId,
        quantity: Number(quantity) || 1,
        subtotalCents: Number(subtotalCents) || 0,
        feeCents: Number(feeCents) || 0,
        taxCents: Number(taxCents) || 0,
      });
    }
    return lines;
  }

  // A payment started before carts existed: a single listing, described by
  // separate fields.
  const subtotalCents = Number(metadata.subtotal_cents) || 0;
  const taxCents = Number(metadata.tax_cents) || 0;
  return [
    {
      listingId: metadata.listing_id,
      quantity: Number(metadata.quantity) || 1,
      subtotalCents,
      feeCents: Math.max(0, paymentIntent.amount - subtotalCents - taxCents),
      taxCents,
    },
  ];
}

const itemText = (item: { quantity: number; unitType: string; title: string }) =>
  `${item.quantity} ${escapeHtml(item.unitType)} of ${escapeHtml(item.title)}`;

// The seller's email deliberately leaves out the pickup code — they only get
// it from the buyer at pickup, and need it to release their payout.
async function sendSellerNotification(params: {
  sellerEmail: string;
  items: { quantity: number; unitType: string; title: string; subtotalCents: number }[];
  buyerEmail: string | null;
}) {
  const { sellerEmail, items, buyerEmail } = params;
  const produceTotal = items.reduce((sum, item) => sum + item.subtotalCents, 0) / 100;

  await sendEmail({
    to: sellerEmail,
    subject:
      items.length === 1
        ? `New order: ${items[0].quantity} ${items[0].unitType} of ${items[0].title}`
        : `New order: ${items.length} items from one buyer`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px;">
        <h2 style="color: #059669;">You've got a new reservation!</h2>
        <ul>${items.map((item) => `<li><strong>${itemText(item)}</strong></li>`).join('')}</ul>
        <p>Buyer: ${buyerEmail ? escapeHtml(buyerEmail) : 'N/A'}</p>
        <p>Produce total: $${produceTotal.toFixed(2)}</p>
        <p>
          At pickup, ask the buyer for their pickup code and enter it in your Seller Dashboard
          to complete the order and release your payout.${
            items.length > 1
              ? ' The buyer has one code for everything they bought from you. If they collect only some of it, tick just those items; the code then stops working and the buyer is sent a new one for the rest.'
              : ''
          }
        </p>
        <p style="margin-top: 20px; font-size: 12px; color: #6b7280;">
          Visit your Seller Dashboard to mark ${items.length > 1 ? 'each item' : 'this order'} ready for pickup.
        </p>
      </div>
    `,
  });
}

// One email for the whole checkout, with a section — and a pickup code — for
// each farm.
async function sendBuyerConfirmation(params: {
  buyerEmail: string;
  totalPaid: number;
  farms: {
    farmName: string;
    code: string;
    pickupAddress: string | null;
    items: { quantity: number; unitType: string; title: string }[];
  }[];
  orderLink: string | null;
  siteUrl?: string;
}) {
  const { buyerEmail, totalPaid, farms, orderLink, siteUrl } = params;
  const allItems = farms.flatMap((farm) => farm.items);

  const farmSections = farms
    .map(
      (farm) => `
        <div style="margin: 16px 0; padding: 14px; border: 1px solid #a7f3d0; border-radius: 8px;">
          <p style="margin: 0 0 6px;"><strong>${escapeHtml(farm.farmName)}</strong></p>
          <ul style="margin: 0 0 8px; padding-left: 20px;">${farm.items.map((item) => `<li>${itemText(item)}</li>`).join('')}</ul>
          ${farm.pickupAddress ? `<p style="margin: 0 0 8px;">Pickup address: <strong>${escapeHtml(farm.pickupAddress)}</strong></p>` : ''}
          <p style="margin: 0;">Pickup code for ${farm.items.length > 1 ? 'these items' : 'this item'}: <strong style="font-size: 20px;">${farm.code}</strong></p>
        </div>`
    )
    .join('');

  await sendEmail({
    to: buyerEmail,
    subject:
      allItems.length === 1
        ? `Order confirmed: ${allItems[0].quantity} ${allItems[0].unitType} of ${allItems[0].title}`
        : `Order confirmed: ${allItems.length} items from ${farms.length === 1 ? farms[0].farmName : `${farms.length} farms`}`,
    html: `
      <div style="font-family: sans-serif; max-width: 520px;">
        <h2 style="color: #059669;">Your order is confirmed!</h2>
        <p>Total paid: $${totalPaid.toFixed(2)}</p>
        ${farmSections}
        <p>
          ${farms.length > 1 ? 'Each farm has its own pickup code. ' : ''}Give a code to the farmer
          <strong>only when you collect your produce</strong> — it confirms you received your order and
          releases their payment. We'll email you as each item is ready for pickup; please wait for that
          email before heading over.
        </p>
        ${buyerGuidanceEmailHtml(siteUrl)}
        ${orderLink ? `<p><a href="${orderLink}">View your order and pickup ${farms.length > 1 ? 'codes' : 'code'}</a> at any time — keep this email, the link is how you get back to it.</p>` : ''}
      </div>
    `,
  });
}

// SERVER-ONLY. Records the orders for a succeeded checkout PaymentIntent — one
// order per item in the cart — decrements each listing's quantity and emails
// the buyer and the farmers. Called from both /api/checkout/complete (the
// buyer's browser) and the Stripe webhook, so it is idempotent: whichever
// arrives second gets the existing orders back and nothing is decremented or
// emailed twice.
//
// Every item from the same farm shares one pickup code. Guest orders have no
// buyer account: buyer_id is null, the email comes from what the guest typed
// at checkout, and a secret token stands in for being signed in when they view
// the order later. `siteUrl` is used to build that link for the confirmation
// email.
export async function recordOrderForPaymentIntent(paymentIntent: Stripe.PaymentIntent, siteUrl?: string) {
  const buyerId = paymentIntent.metadata.buyer_id || null;
  const checkoutId = paymentIntent.metadata.checkout_id || null;
  // What the pickup codes and guest link are worked out from.
  const checkoutKey = checkoutId || paymentIntent.id;
  const guestToken = buyerId ? null : guestTokenForCheckout(checkoutKey);

  const lines = checkoutLines(paymentIntent);
  const listingIds = lines.map((line) => line.listingId);

  const { data: listings } = await supabaseAdmin
    .from('produce_listings')
    .select('id, available_quantity, title, unit_type, farmer_id')
    .in('id', listingIds);
  const listingById = new Map((listings || []).map((l) => [l.id as string, l]));

  // Gives every order its farm's code (creating it if needed) and returns what
  // the caller needs to send the buyer to their confirmation page.
  const finish = async (orders: { id: string; listing_id: string; guest_access_token?: string | null }[]) => {
    let storedToken: string | null = null;
    const codeByOrderId = new Map<string, string>();

    for (const order of orders) {
      const farmerId = listingById.get(order.listing_id)?.farmer_id || 'unknown-farm';
      const stored = await getOrCreatePickupCode(order.id, buyerId, guestToken, pickupCodeForFarm(checkoutKey, farmerId));
      codeByOrderId.set(order.id, stored.code);
      // Older guest orders kept their token on the order row.
      storedToken = storedToken ?? stored.guestToken ?? order.guest_access_token ?? null;
    }

    return {
      orderId: orders[0].id,
      orderIds: orders.map((order) => order.id),
      guestToken: storedToken,
      codeByOrderId,
    };
  };

  const findExisting = async () => {
    const { data } = await supabaseAdmin
      .from('orders')
      .select('id, listing_id, guest_access_token')
      .eq('stripe_payment_intent_id', paymentIntent.id)
      .order('created_at', { ascending: true });
    return data || [];
  };

  const existing = await findExisting();
  if (existing.length > 0) return finish(existing);

  const sellerFeeRate = Number(paymentIntent.metadata.seller_fee_rate) || 0;

  let buyerEmail: string | null = paymentIntent.metadata.buyer_email || null;
  if (buyerId) {
    const { data: buyerUser } = await supabaseAdmin.auth.admin.getUserById(buyerId);
    buyerEmail = buyerUser?.user?.email || buyerEmail;
  }

  // Copy each listing's pickup address onto its order: the buyer can then read
  // it from their own order, and later edits to the listing don't change
  // where this order is collected.
  const { data: addressRows } = await supabaseAdmin
    .from('listing_pickup_addresses')
    .select('listing_id, address')
    .in('listing_id', listingIds);
  const addressByListingId = new Map((addressRows || []).map((row) => [row.listing_id as string, row.address as string]));

  // All the items go in together, so a checkout is never half recorded.
  const { data: inserted, error: orderError } = await supabaseAdmin
    .from('orders')
    .insert(
      lines.map((line) => {
        const totalPaid = (line.subtotalCents + line.feeCents + line.taxCents) / 100;
        return {
          buyer_id: buyerId,
          buyer_email: buyerEmail,
          checkout_id: checkoutId,
          pickup_address: addressByListingId.get(line.listingId) || null,
          listing_id: line.listingId,
          quantity: line.quantity,
          reserved_quantity: line.quantity,
          // This item's share of the payment: its produce, its share of the
          // buyer fee, and its tax.
          total_price: totalPaid,
          // The produce subtotal, and what the farmer will be paid for it once
          // the item is picked up (subtotal less the seller fee).
          subtotal_amount: line.subtotalCents / 100,
          // Sales tax collected on this item (0 while tax collection is off).
          tax_amount: line.taxCents / 100,
          farmer_payout_amount: calculateFarmerPayoutCents(line.subtotalCents, sellerFeeRate) / 100,
          // What was originally paid for, kept unchanged so later refunds and
          // payouts can be worked out as a share of it.
          original_quantity: line.quantity,
          original_subtotal_amount: line.subtotalCents / 100,
          original_total_amount: totalPaid,
          original_tax_amount: line.taxCents / 100,
          seller_fee_rate: sellerFeeRate,
          deposit_amount: totalPaid,
          authorized_amount: totalPaid,
          balance_due_at_pickup: 0.0,
          payment_method: 'stripe_card_online',
          payment_status: 'paid',
          stripe_payment_intent_id: paymentIntent.id,
        };
      })
    )
    .select('id, listing_id, guest_access_token');

  if (orderError || !inserted || inserted.length === 0) {
    // Unique violation: the other caller recorded this payment first.
    if (orderError?.code === '23505') {
      const raced = await findExisting();
      if (raced.length > 0) return finish(raced);
    }
    throw orderError || new Error('The orders for this payment could not be saved.');
  }

  // Keep the cart's order, whatever order the database returned the rows in.
  const orders = lines
    .map((line) => inserted.find((order) => order.listing_id === line.listingId))
    .filter((order): order is NonNullable<typeof order> => Boolean(order));

  const result = await finish(orders);

  // Decrement each listing's available quantity now that payment succeeded.
  for (const line of lines) {
    const listing = listingById.get(line.listingId);
    if (!listing) continue;

    const newAvailable = Math.max(0, Number(listing.available_quantity ?? 0) - line.quantity);
    const { error: updateError } = await supabaseAdmin
      .from('produce_listings')
      .update({ available_quantity: newAvailable })
      .eq('id', line.listingId);

    if (updateError) {
      console.error('Failed to update listing available_quantity after successful payment:', updateError);
      await alertAdmin('listing quantity not reduced after a sale', updateError, { listing: line.listingId });
    }
  }

  // Emails run after payment/order success and never fail the request — a
  // missed email shouldn't undo a real sale.
  const farmerIds = [...new Set((listings || []).map((l) => l.farmer_id as string).filter(Boolean))];
  const { data: profiles } = farmerIds.length
    ? await supabaseAdmin.from('seller_profiles').select('id, farm_name').in('id', farmerIds)
    : { data: [] as any[] };
  const farmNameById = new Map((profiles || []).map((p: any) => [p.id as string, p.farm_name as string]));

  // The cart's items, grouped by farm in the order they were bought.
  const farms: {
    farmerId: string;
    farmName: string;
    code: string;
    pickupAddress: string | null;
    items: { quantity: number; unitType: string; title: string; subtotalCents: number }[];
  }[] = [];

  for (const line of lines) {
    const listing = listingById.get(line.listingId);
    const order = orders.find((o) => o.listing_id === line.listingId);
    const farmerId = (listing?.farmer_id as string) || 'unknown-farm';

    let farm = farms.find((f) => f.farmerId === farmerId);
    if (!farm) {
      farm = {
        farmerId,
        farmName: farmNameById.get(farmerId) || 'Local Farm',
        code: (order && result.codeByOrderId.get(order.id)) || pickupCodeForFarm(checkoutKey, farmerId),
        pickupAddress: addressByListingId.get(line.listingId) || null,
        items: [],
      };
      farms.push(farm);
    }
    farm.items.push({
      quantity: line.quantity,
      unitType: listing?.unit_type || 'units',
      title: listing?.title || 'your order',
      subtotalCents: line.subtotalCents,
    });
  }

  if (buyerEmail) {
    await sendBuyerConfirmation({
      buyerEmail,
      totalPaid: paymentIntent.amount / 100,
      farms,
      siteUrl,
      orderLink:
        result.guestToken && siteUrl
          ? `${siteUrl}/orders/confirmation?orderId=${result.orderId}&token=${result.guestToken}`
          : null,
    });
  }

  for (const farm of farms) {
    if (farm.farmerId === 'unknown-farm') continue;

    const { data: sellerUser, error: sellerLookupError } = await supabaseAdmin.auth.admin.getUserById(farm.farmerId);

    if (sellerLookupError) {
      console.error('Failed to look up seller email:', sellerLookupError);
    } else if (sellerUser?.user?.email) {
      await sendSellerNotification({ sellerEmail: sellerUser.user.email, items: farm.items, buyerEmail });
    }
  }

  return result;
}
