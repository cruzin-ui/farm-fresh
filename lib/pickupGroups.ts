// A buyer's orders, arranged the way they are picked up: everything bought
// from one farm in one checkout is collected together and shares one pickup
// code. Used by My Orders and the order confirmation page.

export type BuyerOrder = {
  id: string;
  checkout_id: string | null;
  status: string;
  created_at: string;
  quantity: number;
  total_price: number;
  // The produce price and the sales tax within total_price.
  subtotal_amount: number;
  tax_amount: number;
  refunded_amount: number;
  // When the farmer must have it ready by, and — once it is ready — when the
  // buyer must collect it by. Empty on orders from before deadlines existed.
  ready_by: string | null;
  pickup_by: string | null;
  // The buyer's own account of the order: confirmed received, or a problem
  // they reported (and when).
  buyer_received: boolean;
  buyer_problem_at: string | null;
  // True once the farmer has reported the order as not collected.
  no_show_reported: boolean;
  pickup_details: string | null;
  // The full address appears once the farmer marks the order ready; until
  // then the buyer sees only the area (city and zip).
  pickup_address: string | null;
  pickup_area: string;
  pickup_code: string | null;
  reviewed: boolean;
  listing_title: string;
  listing_unit_type: string;
  farmer_id: string | null;
  farm_name: string;
};

export type PickupGroup = {
  key: string;
  farmerId: string | null;
  farmName: string;
  code: string | null;
  items: BuyerOrder[];
};

export const isOpenStatus = (status: string) => status === 'pending_pickup' || status === 'ready_for_pickup';

// Groups keep the order the orders arrive in, so a newest-first list stays
// newest-first. Orders from before carts existed have no checkout and are each
// their own group.
export function groupOrdersForPickup(orders: BuyerOrder[]): PickupGroup[] {
  const groups = new Map<string, PickupGroup>();

  for (const order of orders) {
    const key = order.checkout_id ? `${order.checkout_id}:${order.farmer_id || 'farm'}` : order.id;
    const group = groups.get(key);

    if (group) {
      group.items.push(order);
      group.code = group.code || order.pickup_code;
    } else {
      groups.set(key, {
        key,
        farmerId: order.farmer_id,
        farmName: order.farm_name,
        code: order.pickup_code,
        items: [order],
      });
    }
  }

  return [...groups.values()];
}

// "Potatoes", "Potatoes and Corn", "Potatoes, Corn and Basil" — what a pickup
// code is for, in words.
export function describeItems(items: { listing_title: string }[]) {
  const titles = items.map((item) => item.listing_title);
  if (titles.length <= 1) return titles[0] || 'your order';
  return `${titles.slice(0, -1).join(', ')} and ${titles[titles.length - 1]}`;
}

// The short order number shown to both the buyer and the seller: the same for
// everything a buyer bought in one checkout. It isn't secret — the pickup code
// is what proves a handover — it just lets a seller find the right bag and the
// right order when a buyer turns up.
export function orderRef(order: { id: string; checkout_id?: string | null }) {
  return (order.checkout_id || order.id).replace(/-/g, '').slice(0, 6).toUpperCase();
}
