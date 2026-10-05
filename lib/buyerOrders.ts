import { supabase } from '@/lib/supabaseClient';
import type { BuyerOrder } from '@/lib/pickupGroups';

// Fills in what a signed-in buyer's order rows need for display: the listing
// and farm names, the pickup codes (stored separately so only the buyer can
// read them) and whether each order has been reviewed. Runs in the browser as
// the buyer, so it only ever sees their own orders and codes.
export async function describeBuyerOrders(rows: any[]): Promise<BuyerOrder[]> {
  if (rows.length === 0) return [];

  const orderIds = rows.map((o) => o.id);
  const listingIds = [...new Set(rows.map((o) => o.listing_id).filter(Boolean))];

  const { data: listings } = listingIds.length
    ? await supabase.from('produce_listings').select('id, title, unit_type, farmer_id').in('id', listingIds)
    : { data: [] as any[] };
  const listingById = new Map((listings || []).map((l) => [l.id, l]));

  const farmerIds = [...new Set((listings || []).map((l) => l.farmer_id).filter(Boolean))];
  const { data: farms } = farmerIds.length
    ? await supabase.from('seller_profiles').select('id, farm_name').in('id', farmerIds)
    : { data: [] as any[] };
  const farmNameById = new Map((farms || []).map((f) => [f.id, f.farm_name]));

  const { data: codes } = await supabase.from('order_pickup_codes').select('order_id, code').in('order_id', orderIds);
  const codeByOrderId = new Map((codes || []).map((c) => [c.order_id, c.code]));

  const { data: reviews } = await supabase.from('seller_reviews').select('order_id').in('order_id', orderIds);
  const reviewedOrderIds = new Set((reviews || []).map((r) => r.order_id));

  return rows.map((o) => {
    const listing = listingById.get(o.listing_id);
    return {
      id: o.id,
      checkout_id: o.checkout_id || null,
      status: o.status,
      created_at: o.created_at,
      quantity: Number(o.reserved_quantity ?? o.quantity ?? 0),
      total_price: Number(o.total_price ?? 0),
      refunded_amount: Number(o.refunded_amount ?? 0),
      pickup_details: o.pickup_details || null,
      pickup_address: o.pickup_address || null,
      // Orders from before codes were stored separately keep theirs on the row.
      pickup_code: codeByOrderId.get(o.id) || o.pickup_code || null,
      reviewed: reviewedOrderIds.has(o.id),
      listing_title: listing?.title || 'Harvest Crop',
      listing_unit_type: listing?.unit_type || 'units',
      farmer_id: listing?.farmer_id || null,
      farm_name: (listing?.farmer_id && farmNameById.get(listing.farmer_id)) || 'Local Farm',
    };
  });
}
