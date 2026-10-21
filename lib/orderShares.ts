import { stripeAdmin } from '@/lib/stripeAdmin';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { sendEmail, escapeHtml } from '@/lib/email';
import { alertAdmin } from '@/lib/alerts';
import { reverseOrderTax } from '@/lib/tax';
import { calculateFarmerPayoutCents } from '@/lib/pricing';
import { splitSharedPayout, type ShareForSplit } from '@/lib/sharedBoxTerms';

// SERVER-ONLY. The money for a shared Farm Box order: one order (on the host's
// hidden listing) whose produce price is split between the farms that filled
// the box. Each farm's part is recorded when the box is paid for, so that at
// pickup each farm is paid its own part, and so a part that never arrived can
// be refunded on its own.

export type OrderShare = {
  order_id: string;
  farmer_id: string;
  role: 'host' | 'partner';
  share_cents: number;
  status: 'included' | 'refunded' | 'substituted';
  payout_cents: number | null;
  stripe_transfer_id: string | null;
};

// The parts of a box, as carried on its payment: "farmerId:role:cents,...".
export const SHARES_METADATA_KEY = 'csa_shares';

export function encodeShares(shares: { farmerId: string; role: 'host' | 'partner'; shareCents: number }[]) {
  return shares.map((s) => `${s.farmerId}:${s.role === 'host' ? 'h' : 'p'}:${s.shareCents}`).join(',');
}

export function decodeShares(value: string | null | undefined) {
  return String(value || '')
    .split(',')
    .map((part) => part.split(':'))
    .filter(([farmerId, role, cents]) => farmerId && role && cents !== undefined)
    .map(([farmerId, role, cents]) => ({
      farmerId,
      role: (role === 'h' ? 'host' : 'partner') as 'host' | 'partner',
      shareCents: Math.max(0, Math.round(Number(cents) || 0)),
    }));
}

// Saves each farm's part of a newly recorded box order. Safe to call again.
export async function recordOrderShares(orderId: string, metadataValue: string | null | undefined) {
  const shares = decodeShares(metadataValue);
  if (shares.length === 0) return;
  const { error } = await supabaseAdmin.from('order_farm_shares').upsert(
    shares.map((s) => ({ order_id: orderId, farmer_id: s.farmerId, role: s.role, share_cents: s.shareCents })),
    { onConflict: 'order_id,farmer_id', ignoreDuplicates: true }
  );
  if (error) throw error;
}

export async function getOrderShares(orderId: string) {
  const { data } = await supabaseAdmin.from('order_farm_shares').select('*').eq('order_id', orderId);
  return (data || []) as OrderShare[];
}

const forSplit = (shares: OrderShare[]): ShareForSplit[] =>
  shares.map((s) => ({ farmerId: s.farmer_id, role: s.role, shareCents: s.share_cents, status: s.status }));

async function payoutAccounts(farmerIds: string[]) {
  const { data } = await supabaseAdmin.from('seller_profiles').select('id, stripe_account_id').in('id', farmerIds);
  return new Map((data || []).map((p) => [p.id as string, (p.stripe_account_id as string | null) || null]));
}

// Sends each farm its part of a shared box at pickup. The host's transfer is
// required (the caller has checked the host can be paid); a partner whose
// payout account is missing is skipped and an admin told, so the buyer's
// pickup still goes through. Returns the host's transfer and the total paid.
export async function payOrderShares(params: {
  order: any;
  shares: OrderShare[];
  sellerFeeRate: number;
  chargeId: string;
  transferGroup?: string;
}) {
  const { order, shares, sellerFeeRate, chargeId, transferGroup } = params;
  // If anything was refunded off the order other than a whole part (an admin
  // partial refund), every part shrinks by the same share.
  const partsCents = shares.filter((s) => s.status !== 'refunded').reduce((sum, s) => sum + s.share_cents, 0);
  const subtotalCents = Math.round(Number(order.subtotal_amount ?? 0) * 100);
  const scale = partsCents > 0 && subtotalCents < partsCents ? subtotalCents / partsCents : 1;
  const payouts = splitSharedPayout(
    forSplit(shares).map((s) => ({ ...s, shareCents: Math.round(s.shareCents * scale) })),
    sellerFeeRate
  );

  const accounts = await payoutAccounts([...payouts.keys()]);
  const host = shares.find((s) => s.role === 'host');
  let hostTransferId: string | null = null;
  let totalCents = 0;
  const transferByFarm = new Map<string, string>();

  for (const [farmerId, cents] of payouts) {
    if (cents <= 0) continue;
    const destination = accounts.get(farmerId);
    if (!destination) {
      if (farmerId === host?.farmer_id) throw new Error('The host farm has not finished payout setup.');
      await alertAdmin('shared Farm Box partner not paid: no payout account', new Error('Missing payout account'), {
        order: order.id,
        farm: farmerId,
        cents,
      });
      continue;
    }
    const transfer = await stripeAdmin.transfers.create(
      {
        amount: cents,
        currency: 'usd',
        destination,
        source_transaction: chargeId,
        transfer_group: transferGroup,
        metadata: { order_id: String(order.id), farm_id: farmerId, shared_box: '1' },
      },
      { idempotencyKey: `order-payout-${order.id}-${farmerId}` }
    );
    transferByFarm.set(farmerId, transfer.id);
    totalCents += cents;
    if (farmerId === host?.farmer_id) hostTransferId = transfer.id;
  }

  for (const share of shares) {
    await supabaseAdmin
      .from('order_farm_shares')
      .update({ payout_cents: payouts.get(share.farmer_id) || 0, stripe_transfer_id: transferByFarm.get(share.farmer_id) || null })
      .eq('order_id', order.id)
      .eq('farmer_id', share.farmer_id);
  }
  return { hostTransferId, totalCents };
}

// A restocking fee (a buyer who cancelled late or never came) split between
// the farms in proportion to their parts; parts the host substituted count as
// the host's. Returns the host's transfer.
export async function payRestockingShares(params: {
  order: any;
  shares: OrderShare[];
  restockingCents: number;
  chargeId: string;
  transferGroup?: string;
}) {
  const { order, shares, restockingCents, chargeId, transferGroup } = params;
  const host = shares.find((s) => s.role === 'host');
  const weights = new Map<string, number>();
  for (const share of shares) {
    if (share.status === 'refunded') continue;
    const to = share.status === 'substituted' ? host?.farmer_id || share.farmer_id : share.farmer_id;
    weights.set(to, (weights.get(to) || 0) + share.share_cents);
  }
  const totalWeight = [...weights.values()].reduce((a, b) => a + b, 0);
  if (totalWeight <= 0 || restockingCents <= 0) return null;

  const amounts = new Map<string, number>();
  let given = 0;
  for (const [farmerId, weight] of weights) {
    if (farmerId === host?.farmer_id) continue;
    const cents = Math.floor((restockingCents * weight) / totalWeight);
    amounts.set(farmerId, cents);
    given += cents;
  }
  if (host) amounts.set(host.farmer_id, restockingCents - given);

  const accounts = await payoutAccounts([...amounts.keys()]);
  let hostTransferId: string | null = null;
  for (const [farmerId, cents] of amounts) {
    const destination = accounts.get(farmerId);
    if (cents <= 0 || !destination) continue;
    const transfer = await stripeAdmin.transfers.create(
      {
        amount: cents,
        currency: 'usd',
        destination,
        source_transaction: chargeId,
        transfer_group: transferGroup,
        metadata: { order_id: String(order.id), farm_id: farmerId, reason: 'no_show_restocking_fee', shared_box: '1' },
      },
      { idempotencyKey: `order-noshow-payout-${order.id}-${farmerId}` }
    );
    if (farmerId === host?.farmer_id) hostTransferId = transfer.id;
    await supabaseAdmin
      .from('order_farm_shares')
      .update({ payout_cents: cents, stripe_transfer_id: transfer.id })
      .eq('order_id', order.id)
      .eq('farmer_id', farmerId);
  }
  return hostTransferId;
}

// Takes back what farms were paid for a shared box: all of it (fraction null)
// or the same share of each farm's payout. Returns false when the order isn't
// a shared box, so the caller reverses its single transfer as usual.
export async function reverseShareTransfers(order: { id: string }, fraction: number | null, key: string) {
  const shares = await getOrderShares(order.id);
  if (shares.length === 0) return false;
  for (const share of shares) {
    if (!share.stripe_transfer_id || !share.payout_cents) continue;
    const amount = fraction == null ? undefined : Math.round(share.payout_cents * fraction);
    if (amount === 0) continue;
    await stripeAdmin.transfers.createReversal(
      share.stripe_transfer_id,
      amount ? { amount } : {},
      { idempotencyKey: `order-share-reversal-${order.id}-${share.farmer_id}-${key}` }
    );
  }
  return true;
}

// One farm's part of an open shared box didn't happen (it never arrived, or
// the farm dropped out after the box was bought). Either the buyer is refunded
// that part, or, if the host filled in with its own produce, the host is paid
// for it instead. Returns the refund in cents (0 when substituted).
export async function refundFarmShare(params: {
  order: any;
  share: OrderShare;
  farmName: string;
  contribution: string;
  planName: string;
  boxLabel: string;
  substitute: boolean;
  reason: 'missing' | 'not_coming';
}) {
  const { order, share, farmName, contribution, planName, boxLabel, substitute, reason } = params;
  if (share.status !== 'included' || share.role !== 'partner') return 0;
  if (!['pending_pickup', 'ready_for_pickup'].includes(order.status)) return 0;
  const what = contribution ? `${escapeHtml(farmName)}'s ${escapeHtml(contribution)}` : `the part from ${escapeHtml(farmName)}`;

  if (substitute) {
    await supabaseAdmin
      .from('order_farm_shares')
      .update({ status: 'substituted' })
      .eq('order_id', order.id)
      .eq('farmer_id', share.farmer_id);
    if (order.buyer_email) {
      await sendEmail({
        to: order.buyer_email,
        subject: `A change to your ${planName} box for ${boxLabel}`,
        html: `<div style="font-family: sans-serif; max-width: 480px;">
          <p>${what} couldn't be part of your <strong>${escapeHtml(planName)}</strong> box for ${escapeHtml(boxLabel)}. The host farm has filled in with its own produce of at least the same value, so your box and its price are unchanged.</p>
        </div>`,
      });
    }
    return 0;
  }

  if (!order.stripe_payment_intent_id) return 0;
  const originalSubtotalCents = Math.round(Number(order.original_subtotal_amount ?? order.subtotal_amount ?? 0) * 100);
  const originalTotalCents = Math.round(Number(order.original_total_amount ?? order.total_price ?? 0) * 100);
  const originalTaxCents = Math.round(Number(order.original_tax_amount ?? order.tax_amount ?? 0) * 100);
  const paidCents = Math.round(Number(order.total_price ?? 0) * 100);
  if (originalSubtotalCents <= 0) return 0;

  const fraction = share.share_cents / originalSubtotalCents;
  const refundCents = Math.min(paidCents, Math.round(originalTotalCents * fraction));
  if (refundCents <= 0) return 0;
  const taxRefundCents = Math.min(Math.round(Number(order.tax_amount ?? 0) * 100), Math.round(originalTaxCents * fraction));
  const produceRefundCents = Math.min(share.share_cents, refundCents - taxRefundCents);
  const feeRefundCents = Math.max(0, refundCents - produceRefundCents - taxRefundCents);

  await stripeAdmin.refunds.create(
    { payment_intent: order.stripe_payment_intent_id, amount: refundCents },
    { idempotencyKey: `order-share-refund-${order.id}-${share.farmer_id}` }
  );

  const newSubtotalCents = Math.max(0, Math.round(Number(order.subtotal_amount ?? 0) * 100) - produceRefundCents);
  const newPaid = (paidCents - refundCents) / 100;
  const { error } = await supabaseAdmin
    .from('orders')
    .update({
      total_price: newPaid,
      deposit_amount: newPaid,
      authorized_amount: newPaid,
      subtotal_amount: newSubtotalCents / 100,
      tax_amount: (Math.round(Number(order.tax_amount ?? 0) * 100) - taxRefundCents) / 100,
      farmer_payout_amount: calculateFarmerPayoutCents(newSubtotalCents, Number(order.seller_fee_rate ?? 0)) / 100,
      refunded_amount: Number(order.refunded_amount ?? 0) + refundCents / 100,
    })
    .eq('id', order.id);
  if (error) {
    await alertAdmin('shared box part refunded but the order could not be updated', error, { order: order.id });
    throw error;
  }
  await supabaseAdmin
    .from('order_farm_shares')
    .update({ status: 'refunded', payout_cents: 0 })
    .eq('order_id', order.id)
    .eq('farmer_id', share.farmer_id);

  await reverseOrderTax({
    order,
    produceCents: produceRefundCents,
    feeCents: feeRefundCents,
    taxCents: taxRefundCents,
    reason: `share-${share.farmer_id}`,
  });

  if (order.buyer_email) {
    await sendEmail({
      to: order.buyer_email,
      subject: `Part of your ${planName} box for ${boxLabel} has been refunded`,
      html: `<div style="font-family: sans-serif; max-width: 480px;">
        <p>${what} ${reason === 'missing' ? "didn't arrive in time to go" : "can't be"} in your <strong>${escapeHtml(planName)}</strong> box for ${escapeHtml(boxLabel)}. The rest of your box is coming as planned.</p>
        <p>We've refunded <strong>$${(refundCents / 100).toFixed(2)}</strong> for that part to your original payment method. It usually takes 5–10 business days to appear.</p>
      </div>`,
    });
  }
  return refundCents;
}
