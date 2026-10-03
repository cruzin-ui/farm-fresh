// Buyer service fee: a percentage of the produce subtotal plus a fixed amount.
// The fixed part is what keeps small orders from costing the platform money —
// Stripe charges roughly 2.9% + 30¢ per card payment, which a percentage alone
// doesn't cover on orders under about $15.
export const BUYER_FEE_RATE = 0.05;
export const BUYER_FEE_FIXED_CENTS = 50;
export const BUYER_FEE_LABEL = `${BUYER_FEE_RATE * 100}% + $${(BUYER_FEE_FIXED_CENTS / 100).toFixed(2)}`;

// Stripe's minimum charge for USD.
export const MIN_CHARGE_CENTS = 50;

// Single source of truth for order totals, in cents. Used by the checkout page
// (to size the payment form) and by the API (to create the charge) — the two
// amounts must match exactly or Stripe rejects the confirmation.
export function calculateOrderTotals(pricePerUnit: number, quantity: number) {
  const subtotalCents = Math.round(pricePerUnit * quantity * 100);
  const feeCents = Math.round(subtotalCents * BUYER_FEE_RATE) + BUYER_FEE_FIXED_CENTS;

  return { subtotalCents, feeCents, totalCents: subtotalCents + feeCents };
}
