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
  refunded_amount: number;
  pickup_details: string | null;
  pickup_address: string | null;
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
