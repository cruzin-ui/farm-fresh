import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { calculateCartTotals } from '@/lib/pricing';
import { calculateCartTax } from '@/lib/tax';

// SERVER-ONLY. Prices a buyer's cart. Used both to show the checkout page its
// totals and to create the charge, so the two always agree — and so nothing
// the browser says about prices is ever trusted.

export const MAX_CART_LINES = 20;

export type CartRequestItem = { listingId: string; quantity: number };

export type PricedLine = {
  listingId: string;
  title: string;
  unitType: string;
  pricePerUnit: number;
  quantity: number;
  available: number;
  farmerId: string | null;
  farmName: string;
  locationName: string;
  subtotalCents: number;
  feeCents: number;
  taxCents: number;
  totalCents: number;
  // Why this item can't be bought as it stands (sold out, not enough left…),
  // or null when it is fine. Items with a problem are left out of the totals.
  problem: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Reads the cart sent by the browser. Returns null if it isn't a usable list
// of listings and whole-number quantities. The same listing listed twice is
// combined into one line.
export function parseCartItems(raw: unknown): CartRequestItem[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;

  const quantities = new Map<string, number>();
  for (const entry of raw) {
    const listingId = typeof entry?.listingId === 'string' ? entry.listingId : '';
    const quantity = Number(entry?.quantity);
    if (!UUID.test(listingId) || !Number.isInteger(quantity) || quantity < 1) return null;
    quantities.set(listingId, (quantities.get(listingId) || 0) + quantity);
  }

  if (quantities.size > MAX_CART_LINES) return null;
  return [...quantities].map(([listingId, quantity]) => ({ listingId, quantity }));
}

export async function priceCart(items: CartRequestItem[]) {
  const listingIds = items.map((item) => item.listingId);

  const { data: listings } = await supabaseAdmin
    .from('produce_listings')
    .select('id, title, unit_type, price_per_unit, available_quantity, farmer_id, category, zip_code, location_name')
    .in('id', listingIds);
  const listingById = new Map((listings || []).map((l) => [l.id as string, l]));

  const farmerIds = [...new Set((listings || []).map((l) => l.farmer_id).filter(Boolean))];
  const { data: sellers } = farmerIds.length
    ? await supabaseAdmin
        .from('seller_profiles')
        .select('id, farm_name, stripe_account_id, stripe_onboarding_complete')
        .in('id', farmerIds)
    : { data: [] as any[] };
  const sellerById = new Map((sellers || []).map((s: any) => [s.id as string, s]));

  const lines: PricedLine[] = items.map((item) => {
    const listing = listingById.get(item.listingId);
    const seller = listing?.farmer_id ? sellerById.get(listing.farmer_id) : null;
    // Rounded down: orders are whole units, so a leftover fraction can't be bought.
    const available = listing ? Math.max(0, Math.floor(Number(listing.available_quantity ?? 0))) : 0;

    let problem: string | null = null;
    if (!listing) {
      problem = 'This listing is no longer available. Please remove it.';
    } else if (available < 1) {
      problem = 'Sold out. Please remove it.';
    } else if (item.quantity > available) {
      problem = `Only ${available} left. Please lower the quantity.`;
    } else if (!seller?.stripe_account_id || !seller.stripe_onboarding_complete) {
      problem = "This farmer hasn't finished setting up payouts yet, so it can't be bought right now. Please remove it.";
    }

    return {
      listingId: item.listingId,
      title: listing?.title || 'Listing no longer available',
      unitType: listing?.unit_type || 'units',
      pricePerUnit: Number(listing?.price_per_unit ?? 0),
      quantity: item.quantity,
      available,
      farmerId: listing?.farmer_id || null,
      farmName: seller?.farm_name || 'Local Farm',
      locationName: listing?.location_name || '',
      subtotalCents: 0,
      feeCents: 0,
      taxCents: 0,
      totalCents: 0,
      problem,
    };
  });

  const good = lines.filter((line) => !line.problem);
  const totals = calculateCartTotals(good);

  // Sales tax, if tax collection is switched on (zero otherwise).
  const tax = await calculateCartTax(
    good.map((line, i) => {
      const listing = listingById.get(line.listingId);
      return {
        category: listing?.category,
        pickupZip: listing?.zip_code,
        subtotalCents: totals.lines[i].subtotalCents,
        feeCents: totals.lines[i].feeCents,
      };
    })
  );

  good.forEach((line, i) => {
    line.subtotalCents = totals.lines[i].subtotalCents;
    line.feeCents = totals.lines[i].feeCents;
    line.taxCents = tax.taxCentsByLine[i];
    line.totalCents = line.subtotalCents + line.feeCents + line.taxCents;
  });

  return {
    lines,
    subtotalCents: totals.subtotalCents,
    feeCents: totals.feeCents,
    taxCents: tax.taxCents,
    totalCents: totals.totalCents + tax.taxCents,
    calculationId: tax.calculationId,
    // True when every item can be bought as it stands.
    ok: good.length === lines.length,
  };
}
