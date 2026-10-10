import { stripeAdmin } from '@/lib/stripeAdmin';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { sendEmail, escapeHtml } from '@/lib/email';
import { calculateFarmerPayoutCents, calculateCancellationSplit, RESTOCKING_RATE } from '@/lib/pricing';
import { getPickupCodeRecord } from '@/lib/pickupCodes';
import { alertAdmin, notifyAdmins } from '@/lib/alerts';
import { reverseOrderTax } from '@/lib/tax';

// An order completed this soon after it was paid for is unusual for produce
// that has to be picked and collected in person, and is how someone would
// cash out a stolen card through their own listing. It is still completed,
// but an admin is told.
export const FAST_COMPLETION_MINUTES = 30;

// True while the buyer's bank is disputing the payment (or has taken it back).
// No money is paid out to a farmer on a payment in that state.
export function hasOpenDispute(order: { dispute_status?: string | null }) {
  return Boolean(order.dispute_status) && !['won', 'warning_closed'].includes(String(order.dispute_status));
}

// On a no-show, the farmer keeps this share of the produce subtotal as a
// restocking fee; the platform keeps its buyer fee; the buyer gets the rest.
export const NO_SHOW_RESTOCKING_RATE = RESTOCKING_RATE;

// SERVER-ONLY. The money-moving order operations, shared by the farmer's
// routes (which first check the pickup code / ownership) and the admin
// override routes (which skip those checks).

// An error whose message is safe to show the caller, with the HTTP status to
// send it with.
export class OrderActionError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function isOpen(order: any) {
  return order.status === 'pending_pickup' || order.status === 'ready_for_pickup';
}

// What was originally paid for an order: the quantity, the produce subtotal,
// this order's share of the whole charge (fee and tax included) and the tax.
// Refunds and payouts are worked out as a share of these. Orders record them
// at checkout; one payment can cover several orders, so the payment's own
// amount can't be used. Orders from before carts existed were the only order
// on their payment, and fall back to the figures saved on it.
function originalPurchase(order: any, paymentIntent: { amount: number; metadata?: Record<string, string> | null }) {
  if (order.original_quantity != null && order.original_total_amount != null) {
    return {
      quantity: Number(order.original_quantity),
      subtotalCents: Math.round(Number(order.original_subtotal_amount ?? 0) * 100),
      totalCents: Math.round(Number(order.original_total_amount) * 100),
      taxCents: Math.round(Number(order.original_tax_amount ?? 0) * 100),
      sellerFeeRate: Number(order.seller_fee_rate ?? 0),
    };
  }

  const metadata = paymentIntent.metadata || {};
  return {
    quantity: Number(metadata.quantity) || 0,
    subtotalCents: Number(metadata.subtotal_cents) || 0,
    totalCents: paymentIntent.amount,
    taxCents: Number(metadata.tax_cents) || 0,
    sellerFeeRate: Number(metadata.seller_fee_rate) || 0,
  };
}

async function sendBuyerAdjustmentEmail(params: {
  buyerEmail: string;
  listingTitle: string;
  unitType: string;
  oldQuantity: number;
  newQuantity: number;
  refundAmount: number;
  note: string;
}) {
  const { buyerEmail, listingTitle, unitType, oldQuantity, newQuantity, refundAmount, note } = params;

  const cancelled = newQuantity === 0;
  const title = escapeHtml(listingTitle);

  await sendEmail({
    to: buyerEmail,
    subject: cancelled
      ? `Your order of ${listingTitle} was cancelled`
      : `Your order of ${listingTitle} was updated`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px;">
        <h2 style="color: #b45309;">${cancelled ? 'Your order was cancelled' : 'Your order was updated'}</h2>
        <p>
          ${
            cancelled
              ? `Your order of <strong>${oldQuantity} ${unitType}</strong> of <strong>${title}</strong> was cancelled.`
              : `Your order of <strong>${title}</strong> was changed from ${oldQuantity} ${unitType} to <strong>${newQuantity} ${unitType}</strong>.`
          }
        </p>
        ${note ? `<p style="white-space: pre-wrap;">${escapeHtml(note)}</p>` : ''}
        <p>
          A refund of <strong>$${refundAmount.toFixed(2)}</strong> has been issued to your original
          payment method. It usually takes 5–10 business days to appear.
        </p>
      </div>
    `,
  });
}

// Marks an open order completed and, for orders paid through Stripe, releases
// the farmer's share: the platform has been holding the buyer's payment since
// checkout, and this is the moment it transfers to the farmer's connected
// account. Callers are responsible for deciding the order *should* complete.
// Thanks the buyer once their order has been picked up, and invites them back.
async function sendBuyerThankYouEmail(order: any, farmerId: string, siteUrl?: string) {
  if (!order.buyer_email) return;

  const { data: listing } = await supabaseAdmin
    .from('produce_listings')
    .select('title, unit_type')
    .eq('id', order.listing_id)
    .maybeSingle();

  const { data: farm } = await supabaseAdmin
    .from('seller_profiles')
    .select('farm_name')
    .eq('id', farmerId)
    .maybeSingle();

  // Where this buyer can leave a review: their order page for a guest (who
  // gets there through the secret link), My Orders for an account holder.
  const guestToken = order.buyer_id ? null : (await getPickupCodeRecord(order.id))?.guestToken;
  const reviewLink = !siteUrl
    ? null
    : guestToken
      ? `${siteUrl}/orders/confirmation?orderId=${order.id}&token=${guestToken}`
      : order.buyer_id
        ? `${siteUrl}/orders`
        : null;

  const title = escapeHtml(listing?.title || 'produce');
  const farmName = farm?.farm_name ? escapeHtml(farm.farm_name) : null;
  const quantity = Number(order.reserved_quantity ?? order.quantity ?? 0);

  await sendEmail({
    to: order.buyer_email,
    subject: 'Thank you for supporting local agriculture!',
    html: `
      <div style="font-family: sans-serif; max-width: 520px;">
        <h2 style="color: #059669;">Congratulations — you just supported local agriculture!</h2>
        <p>
          Your order of <strong>${quantity} ${listing?.unit_type || 'units'} of ${title}</strong>${
            farmName ? ` from <strong>${farmName}</strong>` : ''
          } has been picked up. We hope you enjoy it.
        </p>
        <p>
          Every order like yours keeps food dollars in your community and helps a local grower keep
          growing. Thank you for being part of that.
        </p>
        ${
          siteUrl
            ? `
        ${
          reviewLink
            ? `<p>How was it? <a href="${reviewLink}"><strong>Leave ${farmName || 'the farm'} a quick review</strong></a> — it helps other buyers and means a lot to a small grower.</p>`
            : ''
        }
        <p>
          When you're ready for more, we'd love to have you back:
        </p>
        <p>
          <a href="${siteUrl}/browse" style="display: inline-block; background: #047857; color: #ffffff; text-decoration: none; font-weight: bold; padding: 10px 18px; border-radius: 8px;">Browse fresh produce</a>
        </p>
        <p>
          ${farmName ? `<a href="${siteUrl}/sellers/${farmerId}">See what else ${farmName} is growing</a><br />` : ''}
          Something not right with your order? <a href="${siteUrl}/contact">Contact us</a>.
        </p>`
            : '<p>We hope to see you again soon at Farm Fresh Direct.</p>'
        }
      </div>
    `,
  });
}

// `siteUrl` is only used for the links in the buyer's thank-you email. Pass
// `sendThankYou: false` when several items are being completed in one pickup,
// so the buyer gets one thank-you rather than one per item.
export async function completeOrderAndReleasePayout(
  order: any,
  farmerId: string,
  siteUrl?: string,
  sendThankYou = true
) {
  if (order.status === 'completed') return { payoutAmount: 0 };

  if (!isOpen(order)) {
    throw new OrderActionError(409, 'Only open orders can be completed.');
  }

  if (hasOpenDispute(order)) {
    throw new OrderActionError(
      409,
      "The buyer's bank is disputing this payment, so it can't be paid out right now. Please contact us."
    );
  }

  let transferId: string | null = order.stripe_transfer_id ?? null;
  let payoutAmount = 0;

  if (order.stripe_payment_intent_id && !transferId) {
    const paymentIntent = await stripeAdmin.paymentIntents.retrieve(order.stripe_payment_intent_id);

    // Orders from before payouts were held (destination charges) already
    // sent the farmer's share at checkout — nothing more to transfer.
    const alreadyPaidAtCheckout = Boolean(paymentIntent.transfer_data?.destination);

    if (!alreadyPaidAtCheckout) {
      const { data: seller } = await supabaseAdmin
        .from('seller_profiles')
        .select('stripe_account_id')
        .eq('id', farmerId)
        .maybeSingle();

      if (!seller?.stripe_account_id) {
        throw new OrderActionError(
          409,
          'The farmer has not finished payout setup, so this order cannot be paid out yet.'
        );
      }

      // The farmer's share is the produce subtotal — scaled down if the
      // order's quantity was reduced after checkout — less the seller fee
      // that was in force when the buyer paid.
      const original = originalPurchase(order, paymentIntent);
      const originalQuantity = original.quantity || 1;
      const originalSubtotalCents = original.subtotalCents;
      const sellerFeeRate = original.sellerFeeRate;
      // Never more than was originally paid for: the quantity on the order row
      // can go down (a reduced order) but a larger number there must not
      // increase what the farmer is paid.
      const currentQuantity = Math.min(
        Number(order.reserved_quantity ?? order.quantity ?? 0),
        originalQuantity
      );
      const subtotalCents = Math.round((originalSubtotalCents * currentQuantity) / originalQuantity);
      const payoutCents = calculateFarmerPayoutCents(subtotalCents, sellerFeeRate);

      const chargeId =
        typeof paymentIntent.latest_charge === 'string'
          ? paymentIntent.latest_charge
          : paymentIntent.latest_charge?.id;

      if (payoutCents > 0 && chargeId) {
        // source_transaction ties the transfer to this order's charge, so it
        // works even before the buyer's payment has settled. The idempotency
        // key makes a retry return the same transfer instead of paying twice.
        const transfer = await stripeAdmin.transfers.create(
          {
            amount: payoutCents,
            currency: 'usd',
            destination: seller.stripe_account_id,
            source_transaction: chargeId,
            transfer_group: paymentIntent.transfer_group ?? undefined,
            metadata: { order_id: String(order.id) },
          },
          { idempotencyKey: `order-payout-${order.id}` }
        );

        transferId = transfer.id;
        payoutAmount = payoutCents / 100;
      }
    }
  }

  const { error: updateError } = await supabaseAdmin
    .from('orders')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      stripe_transfer_id: transferId,
      ...(payoutAmount > 0 ? { farmer_payout_amount: payoutAmount } : {}),
    })
    .eq('id', order.id);

  if (updateError) {
    console.error('Payout sent but order update failed:', order.id, updateError);
    await alertAdmin('payout sent but the order could not be updated', updateError, { order: order.id });
    throw new OrderActionError(500, updateError.message);
  }

  // The order has just moved to completed (an already-completed order returned
  // early, above), so this is sent once.
  if (sendThankYou) await sendBuyerThankYouEmail(order, farmerId, siteUrl);

  const minutesSincePurchase = (Date.now() - new Date(order.created_at).getTime()) / 60000;
  if (minutesSincePurchase < FAST_COMPLETION_MINUTES) {
    await notifyAdmins(
      `Order completed ${Math.max(1, Math.round(minutesSincePurchase))} minutes after purchase`,
      `
        <h2 style="color: #b45309;">An order was completed very quickly</h2>
        <p>
          Order <strong>#${String(order.id).slice(0, 8)}</strong> (buyer ${escapeHtml(order.buyer_email || 'unknown')})
          was paid for and marked picked up within ${FAST_COMPLETION_MINUTES} minutes.
          ${payoutAmount > 0 ? `$${payoutAmount.toFixed(2)} was released to the seller.` : ''}
        </p>
        <p>
          That is unusual for produce collected in person. It can be innocent (a buyer ordering at the farm
          stand), but it is also how a seller would cash out a stolen card through their own listing. Check
          the seller in the admin page; if it looks wrong, use Cancel &amp; Refund before the weekly payout.
        </p>
        ${siteUrl ? `<p><a href="${siteUrl}/admin">Open the admin page</a></p>` : ''}
      `
    );
  }

  return { payoutAmount };
}

// Refunds part of what a buyer paid for an order without changing what they
// bought — for when the produce was poor, or short by weight. An admin tool.
//
// The refund is treated as a share of the whole purchase, the same as if that
// share of the order had been cancelled: the buyer gets it back, and the
// farmer's payout, our fees and the sales tax all shrink by the same share. If
// the farmer has already been paid (a picked-up order), their share of it is
// taken back from their connected account.
export async function refundOrderAmount(params: { order: any; listing: { title?: string | null }; amount: number; note?: string }) {
  const { order, listing, note = '' } = params;

  if (order.status === 'cancelled') {
    throw new OrderActionError(409, 'This order is cancelled; there is nothing left to refund.');
  }
  if (!order.stripe_payment_intent_id) {
    throw new OrderActionError(409, 'This order was not paid through Stripe and has to be refunded manually.');
  }

  const refundCents = Math.round(Number(params.amount) * 100);
  const paidCents = Math.round(Number(order.total_price ?? 0) * 100);
  if (!Number.isFinite(refundCents) || refundCents < 1) {
    throw new OrderActionError(400, 'Enter the amount to refund, in dollars.');
  }
  if (refundCents >= paidCents) {
    throw new OrderActionError(
      400,
      `A partial refund has to be less than the $${(paidCents / 100).toFixed(2)} paid. To give it all back, use Cancel & Refund.`
    );
  }

  const share = refundCents / paidCents;
  const subtotalCents = Math.round(Number(order.subtotal_amount ?? 0) * 100);
  const taxCents = Math.round(Number(order.tax_amount ?? 0) * 100);
  const payoutCents = Math.round(Number(order.farmer_payout_amount ?? 0) * 100);

  const produceRefundCents = Math.round(subtotalCents * share);
  const taxRefundCents = Math.round(taxCents * share);
  const payoutCutCents = Math.round(payoutCents * share);
  const refundAmount = refundCents / 100;

  const paymentIntent = await stripeAdmin.paymentIntents.retrieve(order.stripe_payment_intent_id);
  // Older orders paid the farmer at checkout (destination charges), so their
  // refunds also pull back the transfer and the platform fee.
  const paidFarmerAtCheckout = Boolean(paymentIntent.transfer_data?.destination);

  // The amount paid so far is part of the key, so a retry of this refund
  // returns the same one, while a second, later refund of the same size is new.
  await stripeAdmin.refunds.create(
    {
      payment_intent: paymentIntent.id,
      amount: refundCents,
      ...(paidFarmerAtCheckout ? { reverse_transfer: true, refund_application_fee: true } : {}),
    },
    { idempotencyKey: `order-partial-${order.id}-${paidCents}-${refundCents}` }
  );

  // A picked-up order has already paid the farmer: take their share back.
  let takenBackCents = 0;
  if (order.status === 'completed' && order.stripe_transfer_id && payoutCutCents > 0) {
    await stripeAdmin.transfers.createReversal(
      order.stripe_transfer_id,
      { amount: payoutCutCents },
      { idempotencyKey: `order-partial-reversal-${order.id}-${paidCents}-${refundCents}` }
    );
    takenBackCents = payoutCutCents;
  }

  const { error: updateError } = await supabaseAdmin
    .from('orders')
    .update({
      total_price: (paidCents - refundCents) / 100,
      deposit_amount: (paidCents - refundCents) / 100,
      authorized_amount: (paidCents - refundCents) / 100,
      tax_amount: (taxCents - taxRefundCents) / 100,
      ...(subtotalCents ? { subtotal_amount: (subtotalCents - produceRefundCents) / 100 } : {}),
      ...(order.farmer_payout_amount != null ? { farmer_payout_amount: (payoutCents - payoutCutCents) / 100 } : {}),
      refunded_amount: Number(order.refunded_amount ?? 0) + refundAmount,
    })
    .eq('id', order.id);

  if (updateError) {
    console.error('Partial refund issued but order update failed:', order.id, updateError);
    await alertAdmin('partial refund issued but the order could not be updated', updateError, { order: order.id });
    throw new OrderActionError(
      500,
      `The $${refundAmount.toFixed(2)} refund was issued, but the order could not be updated: ${updateError.message}`
    );
  }

  await reverseOrderTax({
    order,
    produceCents: produceRefundCents,
    feeCents: Math.max(0, refundCents - produceRefundCents - taxRefundCents),
    taxCents: taxRefundCents,
    reason: `partial-${paidCents}-${refundCents}`,
  });

  if (order.buyer_email) {
    await sendEmail({
      to: order.buyer_email,
      subject: 'A partial refund is on its way',
      html: `
        <div style="font-family: sans-serif; max-width: 480px;">
          <h2 style="color: #059669;">We've refunded part of your order</h2>
          <p>
            <strong>$${refundAmount.toFixed(2)}</strong> of what you paid for
            <strong>${escapeHtml(listing.title || 'your order')}</strong> has been refunded to your original payment
            method. It can take 5 to 10 business days to appear.
          </p>
          ${note ? `<p style="white-space: pre-wrap;">${escapeHtml(note)}</p>` : ''}
          <p style="font-size: 12px; color: #6b7280;">This refund was made by Farm Fresh Direct support.</p>
        </div>
      `,
    });
  }

  return { refundAmount, payoutCut: payoutCutCents / 100, takenBack: takenBackCents / 100 };
}

// Reduces an order's quantity (newQuantity 0 cancels it) and refunds the buyer
// the difference. Open orders haven't paid the farmer yet, so the refund comes
// out of the payment the platform is holding. With `allowCompleted`, a
// completed order can be fully cancelled too — the farmer's payout is pulled
// back from their connected account.
export async function refundOrderQuantity(params: {
  order: any;
  listing: { title?: string | null; unit_type?: string | null; available_quantity?: number | null };
  newQuantity: number;
  restock?: boolean;
  note?: string;
  allowCompleted?: boolean;
  // Who or what cancelled it, recorded on the order when it is cancelled
  // outright: 'seller', 'admin', 'seller_late', 'never_ready', 'listing_removed'.
  reason?: string;
}) {
  const { order, listing, newQuantity, restock = false, note = '', allowCompleted = false, reason } = params;

  const completed = order.status === 'completed';

  if (!isOpen(order) && !(allowCompleted && completed)) {
    throw new OrderActionError(409, 'Only open orders can be cancelled or adjusted.');
  }

  if (completed && newQuantity !== 0) {
    throw new OrderActionError(400, 'Completed orders can only be refunded in full.');
  }

  if (!order.stripe_payment_intent_id) {
    throw new OrderActionError(409, 'This order was not paid through Stripe and has to be refunded manually.');
  }

  const currentQuantity = Number(order.reserved_quantity ?? order.quantity ?? 0);

  if (!Number.isInteger(newQuantity) || newQuantity < 0 || newQuantity >= currentQuantity) {
    throw new OrderActionError(400, `New quantity must be a whole number less than the current ${currentQuantity}.`);
  }

  // Prorate from what was actually charged, so the refund is right even if
  // the listing price has changed since the order was placed.
  const paymentIntent = await stripeAdmin.paymentIntents.retrieve(order.stripe_payment_intent_id);
  const original = originalPurchase(order, paymentIntent);
  const originalQuantity = original.quantity || currentQuantity;
  const currentPaidCents = Math.round(Number(order.total_price ?? 0) * 100);
  const newTotalCents = Math.round((original.totalCents * newQuantity) / originalQuantity);
  const refundCents = currentPaidCents - newTotalCents;

  if (refundCents <= 0) {
    throw new OrderActionError(400, 'Nothing to refund for this change.');
  }

  // Older orders paid the farmer at checkout (destination charges), so their
  // refunds also pull back the transfer and the platform fee.
  const paidFarmerAtCheckout = Boolean(paymentIntent.transfer_data?.destination);

  // The idempotency keys make a retry of the same change return the same
  // refund/reversal instead of moving money twice.
  await stripeAdmin.refunds.create(
    {
      payment_intent: paymentIntent.id,
      amount: refundCents,
      ...(paidFarmerAtCheckout ? { reverse_transfer: true, refund_application_fee: true } : {}),
    },
    { idempotencyKey: `order-adjust-${order.id}-${currentQuantity}-to-${newQuantity}` }
  );

  // A completed order already released the farmer's payout — take it back.
  if (completed && order.stripe_transfer_id) {
    await stripeAdmin.transfers.createReversal(
      order.stripe_transfer_id,
      {},
      { idempotencyKey: `order-payout-reversal-${order.id}` }
    );
  }

  const cancelled = newQuantity === 0;
  const newTotal = newTotalCents / 100;
  const refundAmount = refundCents / 100;

  // Keep the order's produce subtotal and expected farmer payout in step with
  // the reduced quantity (orders from before these were tracked have neither).
  const originalSubtotalCents = original.subtotalCents;
  const sellerFeeRate = original.sellerFeeRate;
  const newSubtotalCents = Math.round((originalSubtotalCents * newQuantity) / originalQuantity);

  const { error: updateError } = await supabaseAdmin
    .from('orders')
    .update({
      quantity: newQuantity,
      reserved_quantity: newQuantity,
      total_price: newTotal,
      deposit_amount: newTotal,
      authorized_amount: newTotal,
      // The refund above is a share of the whole charge, tax included, so the
      // tax recorded on the order shrinks by the same share.
      tax_amount: Math.round((original.taxCents * newQuantity) / originalQuantity) / 100,
      ...(originalSubtotalCents
        ? {
            subtotal_amount: newSubtotalCents / 100,
            farmer_payout_amount: calculateFarmerPayoutCents(newSubtotalCents, sellerFeeRate) / 100,
          }
        : {}),
      refunded_amount: Number(order.refunded_amount ?? 0) + refundAmount,
      ...(cancelled ? { status: 'cancelled', ...(reason ? { cancel_reason: reason } : {}) } : {}),
    })
    .eq('id', order.id);

  if (updateError) {
    console.error('Refund issued but order update failed:', order.id, updateError);
    await alertAdmin('refund issued but the order could not be updated', updateError, { order: order.id });
    throw new OrderActionError(
      500,
      `The $${refundAmount.toFixed(2)} refund was issued, but the order could not be updated: ${updateError.message}`
    );
  }

  // If we recorded this order's sales tax with Stripe ourselves, lower it to
  // match. The refund is the same share of the produce, the fee and the tax.
  const previousSubtotalCents = Math.round(Number(order.subtotal_amount ?? 0) * 100);
  const previousTaxCents = Math.round(Number(order.tax_amount ?? 0) * 100);
  const produceRefundCents = Math.max(0, previousSubtotalCents - newSubtotalCents);
  const taxRefundCents = Math.max(
    0,
    previousTaxCents - Math.round((original.taxCents * newQuantity) / originalQuantity)
  );
  await reverseOrderTax({
    order,
    produceCents: produceRefundCents,
    feeCents: Math.max(0, refundCents - produceRefundCents - taxRefundCents),
    taxCents: taxRefundCents,
    reason: `qty-${currentQuantity}-to-${newQuantity}`,
  });

  if (restock) {
    const { error: restockError } = await supabaseAdmin
      .from('produce_listings')
      .update({
        available_quantity: Number(listing.available_quantity ?? 0) + (currentQuantity - newQuantity),
      })
      .eq('id', order.listing_id);

    if (restockError) {
      console.error('Failed to restock listing after order adjustment:', restockError);
      await alertAdmin('listing not restocked after a refund', restockError, { order: order.id, listing: order.listing_id });
    }
  }

  if (order.buyer_email) {
    await sendBuyerAdjustmentEmail({
      buyerEmail: order.buyer_email,
      listingTitle: listing.title || 'your order',
      unitType: listing.unit_type || 'units',
      oldQuantity: currentQuantity,
      newQuantity,
      refundAmount,
      note,
    });
  }

  return { cancelled, refundAmount, newQuantity };
}

// Closes an open order that will not be collected. The platform keeps its
// buyer fee, the farmer is paid a restocking fee out of the produce subtotal,
// and the buyer is refunded the rest of the subtotal. The produce goes back on
// the listing.
//
// Used for a no-show (the buyer never came), and — with `cancelledByBuyer` —
// for a buyer cancelling their own order, where `restockingRate` is 0 if they
// cancelled soon enough for there to be no restocking fee.
export async function resolveNoShow(params: {
  order: any;
  listing: { title?: string | null; unit_type?: string | null; available_quantity?: number | null };
  farmerId: string;
  cancelledByBuyer?: boolean;
  restockingRate?: number;
}) {
  const { order, listing, farmerId, cancelledByBuyer = false } = params;
  const restockingRate = params.restockingRate ?? NO_SHOW_RESTOCKING_RATE;

  if (!isOpen(order)) {
    throw new OrderActionError(
      409,
      cancelledByBuyer ? 'This order can no longer be cancelled.' : 'Only open orders can be marked as a no-show.'
    );
  }

  if (!order.stripe_payment_intent_id) {
    throw new OrderActionError(409, 'This order was not paid through Stripe and has to be resolved manually.');
  }

  const paymentIntent = await stripeAdmin.paymentIntents.retrieve(order.stripe_payment_intent_id);
  const original = originalPurchase(order, paymentIntent);
  const originalSubtotalCents = original.subtotalCents;

  // Orders from before payouts were held already paid the farmer in full at
  // checkout, so this split doesn't apply to them.
  if (paymentIntent.transfer_data?.destination || !originalSubtotalCents) {
    throw new OrderActionError(
      409,
      'This order predates held payouts and has to be resolved manually in Stripe.'
    );
  }

  const originalQuantity = original.quantity || 1;
  // Capped at the quantity originally paid for, as in the payout above.
  const currentQuantity = Math.min(Number(order.reserved_quantity ?? order.quantity ?? 0), originalQuantity);
  const subtotalCents = Math.round((originalSubtotalCents * currentQuantity) / originalQuantity);
  // What the buyer gets back before tax, and the tax that goes with it. The
  // tax is refunded in the same proportion as the rest of the charge, which is
  // also how Stripe reverses it in its tax records.
  const currentTaxCents = Math.round(Number(order.tax_amount ?? 0) * 100);
  const { restockingCents, preTaxRefundCents, taxRefundCents, refundCents } = calculateCancellationSplit({
    subtotalCents,
    paidCents: Math.round(Number(order.total_price ?? 0) * 100),
    taxCents: currentTaxCents,
    restockingRate,
  });

  const { data: seller } = await supabaseAdmin
    .from('seller_profiles')
    .select('stripe_account_id')
    .eq('id', farmerId)
    .maybeSingle();

  if (restockingCents > 0 && !seller?.stripe_account_id) {
    throw new OrderActionError(409, 'The farmer has not finished payout setup, so the restocking fee cannot be paid.');
  }

  // The idempotency keys make a retry return the same refund/transfer instead
  // of moving money twice.
  if (refundCents > 0) {
    await stripeAdmin.refunds.create(
      { payment_intent: paymentIntent.id, amount: refundCents },
      { idempotencyKey: `order-noshow-refund-${order.id}` }
    );
  }

  let transferId: string | null = null;
  const chargeId =
    typeof paymentIntent.latest_charge === 'string'
      ? paymentIntent.latest_charge
      : paymentIntent.latest_charge?.id;

  if (restockingCents > 0 && chargeId) {
    const transfer = await stripeAdmin.transfers.create(
      {
        amount: restockingCents,
        currency: 'usd',
        destination: seller!.stripe_account_id,
        source_transaction: chargeId,
        transfer_group: paymentIntent.transfer_group ?? undefined,
        metadata: { order_id: String(order.id), reason: 'no_show_restocking_fee' },
      },
      { idempotencyKey: `order-noshow-payout-${order.id}` }
    );
    transferId = transfer.id;
  }

  const refundAmount = refundCents / 100;
  const restockingFee = restockingCents / 100;
  const keptTotal = Math.round(Number(order.total_price ?? 0) * 100 - refundCents) / 100;

  const { error: updateError } = await supabaseAdmin
    .from('orders')
    .update({
      status: 'cancelled',
      total_price: keptTotal,
      deposit_amount: keptTotal,
      authorized_amount: keptTotal,
      refunded_amount: Number(order.refunded_amount ?? 0) + refundAmount,
      no_show_fee_amount: restockingFee,
      tax_amount: (currentTaxCents - taxRefundCents) / 100,
      subtotal_amount: 0,
      farmer_payout_amount: restockingFee,
      stripe_transfer_id: transferId,
      cancel_reason: cancelledByBuyer ? 'buyer' : 'no_show',
      ...(cancelledByBuyer ? { cancelled_by_buyer_at: new Date().toISOString() } : {}),
    })
    .eq('id', order.id);

  if (updateError) {
    console.error('No-show money moved but order update failed:', order.id, updateError);
    await alertAdmin('no-show money moved but the order could not be updated', updateError, { order: order.id });
    throw new OrderActionError(
      500,
      `The refund and restocking fee were issued, but the order could not be updated: ${updateError.message}`
    );
  }

  // The buyer gets the produce price back less the restocking fee; the buyer
  // fee is kept. Lower the tax we recorded with Stripe to match.
  await reverseOrderTax({
    order,
    produceCents: preTaxRefundCents,
    feeCents: 0,
    taxCents: taxRefundCents,
    reason: 'no-show',
  });

  const { error: restockError } = await supabaseAdmin
    .from('produce_listings')
    .update({ available_quantity: Number(listing.available_quantity ?? 0) + currentQuantity })
    .eq('id', order.listing_id);

  if (restockError) {
    console.error('Failed to restock listing after no-show:', restockError);
    await alertAdmin('listing not restocked after a no-show', restockError, { order: order.id, listing: order.listing_id });
  }

  if (order.buyer_email && cancelledByBuyer) {
    await sendEmail({
      to: order.buyer_email,
      subject: `You cancelled your order of ${listing.title || 'produce'}`,
      html: `
        <div style="font-family: sans-serif; max-width: 480px;">
          <h2 style="color: #b45309;">Your order was cancelled</h2>
          <p>
            As you asked, your order of <strong>${currentQuantity} ${escapeHtml(listing.unit_type || 'units')}</strong> of
            <strong>${escapeHtml(listing.title || 'produce')}</strong> has been cancelled.
          </p>
          <p>
            A refund of <strong>$${refundAmount.toFixed(2)}</strong> has been issued to your original
            payment method. It usually takes 5–10 business days to appear. The service fee is not refunded on
            orders you cancel${
              restockingFee > 0
                ? `, and a ${restockingRate * 100}% restocking fee ($${restockingFee.toFixed(2)}) went to the farmer because the order was cancelled more than 48 hours after it was placed`
                : ''
            }.
          </p>
        </div>
      `,
    });
  } else if (order.buyer_email) {
    await sendEmail({
      to: order.buyer_email,
      subject: `Your order of ${listing.title || 'produce'} was closed as not picked up`,
      html: `
        <div style="font-family: sans-serif; max-width: 480px;">
          <h2 style="color: #b45309;">Your order was not picked up</h2>
          <p>
            Your order of <strong>${currentQuantity} ${listing.unit_type || 'units'}</strong> of
            <strong>${escapeHtml(listing.title || 'produce')}</strong> was not collected, so it has been closed.
          </p>
          <p>
            A refund of <strong>$${refundAmount.toFixed(2)}</strong> has been issued to your original
            payment method. It usually takes 5–10 business days to appear. The service fee and a
            ${NO_SHOW_RESTOCKING_RATE * 100}% restocking fee for the farmer are not refunded on missed pickups.
          </p>
        </div>
      `,
    });
  }

  return { refundAmount, restockingFee };
}
