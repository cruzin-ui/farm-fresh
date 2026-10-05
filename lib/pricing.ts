// Buyer service fee: a percentage of the produce subtotal plus a fixed amount.
// The fixed part is what keeps small orders from costing the platform money —
// Stripe charges roughly 2.9% + 30¢ per card payment, which a percentage alone
// doesn't cover on orders under about $15.
export const BUYER_FEE_RATE = 0.05;
export const BUYER_FEE_FIXED_CENTS = 50;
export const BUYER_FEE_LABEL = `${BUYER_FEE_RATE * 100}% + $${(BUYER_FEE_FIXED_CENTS / 100).toFixed(2)}`;

// Seller fee: the share of the produce subtotal the platform keeps out of the
// farmer's payout. It helps cover Stripe's per-farmer Connect charges, which
// the buyer fee alone doesn't on low-volume farmers. The rate in force at
// checkout is saved on each order, so changing it here only affects new
// orders.
export const SELLER_FEE_RATE = 0.05;

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
export function calculateCartTotals(lines: { pricePerUnit: number; quantity: number }[]) {
  const subtotals = lines.map((line) => Math.round(line.pricePerUnit * line.quantity * 100));
  const subtotalCents = subtotals.reduce((sum, cents) => sum + cents, 0);
  const feeCents = lines.length ? Math.round(subtotalCents * BUYER_FEE_RATE) + BUYER_FEE_FIXED_CENTS : 0;

  // Round each share down, then hand out the leftover cents one at a time so
  // the shares always add up to the fee exactly.
  const fees = subtotals.map((cents) => (subtotalCents > 0 ? Math.floor((feeCents * cents) / subtotalCents) : 0));
  let leftover = feeCents - fees.reduce((sum, cents) => sum + cents, 0);
  for (let i = 0; leftover > 0 && fees.length > 0; i = (i + 1) % fees.length) {
    fees[i] += 1;
    leftover -= 1;
  }

  return {
    lines: subtotals.map((cents, i) => ({ subtotalCents: cents, feeCents: fees[i] })),
    subtotalCents,
    feeCents,
    totalCents: subtotalCents + feeCents,
  };
}
