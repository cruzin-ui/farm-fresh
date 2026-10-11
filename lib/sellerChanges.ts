// When a farmer cancels or reduces part of what a buyer ordered from them, the
// buyer may cancel the rest of that order for a full refund, service fee
// included, with no restocking fee: the order they are left with isn't the one
// they placed. Safe to import anywhere; the buyer's order page uses it to show
// what cancelling will cost, and the server uses it to decide the refund.

// Reasons an order was cancelled that are the farmer's doing, not the buyer's.
export const FARMER_CANCEL_REASONS = ['seller', 'seller_late', 'seller_changed', 'never_ready', 'listing_removed'];

type OrderRow = {
  id: string;
  checkout_id?: string | null;
  status: string;
  cancel_reason?: string | null;
  original_quantity?: number | string | null;
  reserved_quantity?: number | string | null;
  quantity?: number | string | null;
};

const isOpen = (row: OrderRow) => row.status === 'pending_pickup' || row.status === 'ready_for_pickup';

// Given a buyer's orders and a way to tell which farm each is from, returns
// the ids of the open ones the buyer can cancel in full because that farm
// changed the order. "The order" is everything bought from one farm in one
// checkout.
export function sellerChangedOrderIds<T extends OrderRow>(rows: T[], farmerIdOf: (row: T) => string | null | undefined) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = row.checkout_id ? `${row.checkout_id}:${farmerIdOf(row) || ''}` : row.id;
    groups.set(key, [...(groups.get(key) || []), row]);
  }

  const eligible = new Set<string>();
  for (const group of groups.values()) {
    const changed = group.some((row) => {
      if (row.status === 'cancelled') return FARMER_CANCEL_REASONS.includes(row.cancel_reason || '');
      // Still standing, but for less than was ordered.
      const original = row.original_quantity == null ? null : Number(row.original_quantity);
      const current = Number(row.reserved_quantity ?? row.quantity ?? 0);
      return original !== null && current < original;
    });
    if (changed) group.filter(isOpen).forEach((row) => eligible.add(row.id));
  }
  return eligible;
}
