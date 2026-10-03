export const BUYER_FEE_RATE = 0.05;

// Stripe's minimum charge for USD.
export const MIN_CHARGE_CENTS = 50;

// Single source of truth for order totals, in cents. Used by the checkout page
// (to size the payment form) and by the API (to create the charge) — the two
// amounts must match exactly or Stripe rejects the confirmation.
export function calculateOrderTotals(pricePerUnit: number, quantity: number) {
  const subtotalCents = Math.round(pricePerUnit * quantity * 100);
  const feeCents = Math.round(subtotalCents * BUYER_FEE_RATE);

  return { subtotalCents, feeCents, totalCents: subtotalCents + feeCents };
}
