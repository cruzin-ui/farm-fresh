import { WHOLESALE_FEE_RATE, WHOLESALE_FEE_CAP_CENTS } from '@/lib/wholesale';

// Buyer service fee: a percentage of the produce subtotal plus a fixed amount.
// The fixed part is what keeps small orders from costing the platform money.
// Two per-payment charges from Stripe have to come out of it: roughly 30¢ of
// its 2.9% + 30¢ card fee, and 50¢ for working out sales tax on a payment
// wherever the business is registered to collect it (charged even when the
// tax comes to zero). A percentage alone doesn't cover those on small orders.
export const BUYER_FEE_RATE = 0.06;
export const BUYER_FEE_FIXED_CENTS = 100;
export const BUYER_FEE_LABEL = `${BUYER_FEE_RATE * 100}% + $${(BUYER_FEE_FIXED_CENTS / 100).toFixed(2)}`;

// Seller fee: the share of the produce subtotal the platform keeps out of the
// farmer's payout. It helps cover Stripe's per-farmer Connect charges, which
// the buyer fee alone doesn't on low-volume farmers. The rate in force at
// checkout is saved on each order, so changing it here only affects new
// orders.
export const SELLER_FEE_RATE = 0.06;

// What a seller keeps of each sale, as a percentage, for wording such as
// "Sellers keep 94% of every sale".
export const SELLER_KEEPS_PERCENT = Math.round((1 - SELLER_FEE_RATE) * 100);

// Roughly how much of each dollar of produce sold the platform keeps once
// card processing and tax calculation are paid, combining both sides' fees,
// for a typical order of $20 to $50. It is used in wording on the site.
// UPDATE IT WHENEVER THE FEES CHANGE: at 6% + $1.00 and 6% it is about 9 cents.
export const PLATFORM_KEEPS_CENTS_PER_DOLLAR = 9;

// What the farmer is paid for a given produce subtotal, in cents.
export function calculateFarmerPayoutCents(subtotalCents: number, sellerFeeRate: number) {
  return subtotalCents - Math.round(subtotalCents * sellerFeeRate);
}

// Stripe's minimum charge for USD.
export const MIN_CHARGE_CENTS = 50;

// Single source of truth for what a cart costs, in cents. The buyer fee is
// charged once for the whole cart — the percentage on everything plus one
// fixed amount — and then shared out across the items in proportion to their
// price. An item's share is what comes back to the buyer, along with its
// price, if that item alone is later cancelled.
//
// Items bought wholesale (by the case, by an approved business) have their own
// lower fee instead: a percentage with no fixed part, capped per checkout,
// shared out across just those items.
export function calculateCartTotals(lines: { pricePerUnit: number; quantity: number; wholesale?: boolean }[]) {
  const subtotals = lines.map((line) => Math.round(line.pricePerUnit * line.quantity * 100));
  const subtotalCents = subtotals.reduce((sum, cents) => sum + cents, 0);
  const fees = subtotals.map(() => 0);

  const shareOut = (indexes: number[], feeCents: number) => {
    const groupCents = indexes.reduce((sum, i) => sum + subtotals[i], 0);
    // Round each share down, then hand out the leftover cents one at a time so
    // the shares always add up to the fee exactly.
    for (const i of indexes) fees[i] = groupCents > 0 ? Math.floor((feeCents * subtotals[i]) / groupCents) : 0;
    let leftover = feeCents - indexes.reduce((sum, i) => sum + fees[i], 0);
    for (let k = 0; leftover > 0 && indexes.length > 0; k = (k + 1) % indexes.length) {
      fees[indexes[k]] += 1;
      leftover -= 1;
    }
  };

  const retail = lines.flatMap((line, i) => (line.wholesale ? [] : [i]));
  const wholesale = lines.flatMap((line, i) => (line.wholesale ? [i] : []));
  const retailCents = retail.reduce((sum, i) => sum + subtotals[i], 0);
  const wholesaleCents = wholesale.reduce((sum, i) => sum + subtotals[i], 0);
  const retailFeeCents = retail.length ? Math.round(retailCents * BUYER_FEE_RATE) + BUYER_FEE_FIXED_CENTS : 0;
  const wholesaleFeeCents = wholesale.length
    ? Math.min(Math.round(wholesaleCents * WHOLESALE_FEE_RATE), WHOLESALE_FEE_CAP_CENTS)
    : 0;
  shareOut(retail, retailFeeCents);
  shareOut(wholesale, wholesaleFeeCents);
  const feeCents = retailFeeCents + wholesaleFeeCents;

  return {
    lines: subtotals.map((cents, i) => ({ subtotalCents: cents, feeCents: fees[i] })),
    subtotalCents,
    feeCents,
    retailFeeCents,
    wholesaleFeeCents,
    totalCents: subtotalCents + feeCents,
  };
}

// When an order is closed without being picked up — a no-show, or a buyer
// cancelling late — the farmer keeps this share of the produce price as a
// restocking fee.
export const RESTOCKING_RATE = 0.1;

// A buyer can cancel their own order. For this long after ordering there is no
// restocking fee; after that there is. Either way the service fee is kept,
// because the card processor charges us for the payment whether or not it is
// later refunded.
export const FREE_CANCELLATION_HOURS = 24;

export function isWithinFreeCancellation(orderedAt: string | Date, now: number = Date.now()) {
  return now - new Date(orderedAt).getTime() <= FREE_CANCELLATION_HOURS * 60 * 60 * 1000;
}

// How the money for an uncollected order is split, in cents. The buyer gets
// back the produce price less any restocking fee, plus the tax that goes with
// that amount (in the same proportion as the rest of what they paid). The
// service fee stays with the platform.
export function calculateCancellationSplit(params: {
  subtotalCents: number;
  paidCents: number;
  taxCents: number;
  restockingRate: number;
}) {
  const { subtotalCents, paidCents, taxCents, restockingRate } = params;

  const restockingCents = Math.round(subtotalCents * restockingRate);
  const preTaxRefundCents = subtotalCents - restockingCents;
  const preTaxPaidCents = paidCents - taxCents;
  const taxRefundCents =
    taxCents > 0 && preTaxPaidCents > 0 ? Math.round((taxCents * preTaxRefundCents) / preTaxPaidCents) : 0;
  const refundCents = preTaxRefundCents + taxRefundCents;

  return {
    restockingCents,
    preTaxRefundCents,
    taxRefundCents,
    refundCents,
    // What the platform keeps: the service fee (and any tax on it).
    keptCents: paidCents - refundCents - restockingCents,
  };
}
