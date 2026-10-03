import { stripeAdmin } from '@/lib/stripeAdmin';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

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

function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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

  if (!process.env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set — skipping buyer adjustment email.');
    return;
  }

  const cancelled = newQuantity === 0;
  const title = escapeHtml(listingTitle);

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Farm Fresh Direct <onboarding@resend.dev>',
        to: [buyerEmail],
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
      }),
    });

    if (!res.ok) {
      console.error('Resend error notifying buyer of adjustment:', await res.text());
    }
  } catch (err) {
    console.error('Failed to send buyer adjustment email:', err);
  }
}

// Marks an open order completed and, for orders paid through Stripe, releases
// the farmer's share: the platform has been holding the buyer's payment since
// checkout, and this is the moment it transfers to the farmer's connected
// account. Callers are responsible for deciding the order *should* complete.
export async function completeOrderAndReleasePayout(order: any, farmerId: string) {
  if (order.status === 'completed') return { payoutAmount: 0 };

  if (!isOpen(order)) {
    throw new OrderActionError(409, 'Only open orders can be completed.');
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

      // The farmer's share is the produce subtotal, scaled down if the
      // order's quantity was reduced after checkout.
      const originalQuantity = Number(paymentIntent.metadata?.quantity) || 1;
      const originalSubtotalCents = Number(paymentIntent.metadata?.subtotal_cents) || 0;
      const currentQuantity = Number(order.reserved_quantity ?? order.quantity ?? 0);
      const payoutCents = Math.round((originalSubtotalCents * currentQuantity) / originalQuantity);

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
    .update({ status: 'completed', stripe_transfer_id: transferId })
    .eq('id', order.id);

  if (updateError) {
    console.error('Payout sent but order update failed:', order.id, updateError);
    throw new OrderActionError(500, updateError.message);
  }

  return { payoutAmount };
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
}) {
  const { order, listing, newQuantity, restock = false, note = '', allowCompleted = false } = params;

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
  const originalQuantity = Number(paymentIntent.metadata?.quantity) || currentQuantity;
  const currentPaidCents = Math.round(Number(order.total_price ?? 0) * 100);
  const newTotalCents = Math.round((paymentIntent.amount * newQuantity) / originalQuantity);
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

  const { error: updateError } = await supabaseAdmin
    .from('orders')
    .update({
      quantity: newQuantity,
      reserved_quantity: newQuantity,
      total_price: newTotal,
      deposit_amount: newTotal,
      authorized_amount: newTotal,
      refunded_amount: Number(order.refunded_amount ?? 0) + refundAmount,
      ...(cancelled ? { status: 'cancelled' } : {}),
    })
    .eq('id', order.id);

  if (updateError) {
    console.error('Refund issued but order update failed:', order.id, updateError);
    throw new OrderActionError(
      500,
      `The $${refundAmount.toFixed(2)} refund was issued, but the order could not be updated: ${updateError.message}`
    );
  }

  if (restock) {
    const { error: restockError } = await supabaseAdmin
      .from('produce_listings')
      .update({
        available_quantity: Number(listing.available_quantity ?? 0) + (currentQuantity - newQuantity),
      })
      .eq('id', order.listing_id);

    if (restockError) {
      console.error('Failed to restock listing after order adjustment:', restockError);
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
