import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { suspendedSellerIds } from '@/lib/accountBlocks';
import { calculateCartTotals } from '@/lib/pricing';
import { calculateCartTax } from '@/lib/tax';
import { isAllowedCategory } from '@/lib/categories';
import { describeUsualPickup } from '@/lib/pickupRules';
import { marketOptionsFor, type MarketOption } from '@/lib/appearancesServer';
import { parseMarketKey } from '@/lib/appearances';
import { formatBoxDate } from '@/lib/csaSchedule';
import { caseLabel } from '@/lib/wholesale';
import { wholesaleBuyer, wholesaleOffersFor } from '@/lib/wholesaleServer';

// SERVER-ONLY. Prices a buyer's cart. Used both to show the checkout page its
// totals and to create the charge, so the two always agree — and so nothing
// the browser says about prices is ever trusted.

export const MAX_CART_LINES = 20;

// `wholesale` items are bought by the case, and their quantity is a number of
// cases.
export type CartRequestItem = { listingId: string; quantity: number; wholesale?: boolean };

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
  // The listing's zip code, for showing the buyer how far away it is.
  zipCode: string;
  // When the farm is usually available for pickup, in words; empty if the
  // farm hasn't said.
  usualPickup: string;
  subtotalCents: number;
  feeCents: number;
  taxCents: number;
  totalCents: number;
  // Why this item can't be bought as it stands (sold out, not enough left…),
  // or null when it is fine. Items with a problem are left out of the totals.
  problem: string | null;
  // When the buyer chose to pick up at one of the farm's markets: which one,
  // and how it reads. Null for pickup at the farm.
  market: { key: string; label: string } | null;
  // Bought wholesale: then `pricePerUnit`, `quantity`, `available` and
  // `unitType` are all per case ("case of 20 lbs"), and this says how big a
  // case is, in the listing's own unit, and the fewest cases the farm sells.
  wholesale: { caseSize: number; minCases: number; listingUnit: string } | null;
  // How much of the listing this takes, in the listing's own units: the
  // quantity, or cases x case size. It is what the order records.
  orderQuantity: number;
  // Tax-exempt: bought wholesale by a business with an approved resale
  // certificate.
  taxExempt: boolean;
};

// The buyer's choice of where to pick up from each farm: farm id to a market
// ("appearanceId@date"). A farm not listed is picked up at the farm.
export type PickupChoices = Record<string, string>;

export function parsePickupChoices(raw: unknown): PickupChoices {
  const choices: PickupChoices = {};
  if (!raw || typeof raw !== 'object') return choices;
  for (const [farmerId, key] of Object.entries(raw as Record<string, unknown>)) {
    if (UUID.test(farmerId) && parseMarketKey(key)) choices[farmerId] = key as string;
  }
  return choices;
}

// The zip code in a street address: the last five-digit number in it, so a
// five-digit house number at the front isn't mistaken for it.
export function zipFromAddress(address: string | null | undefined) {
  const matches = [...(address || '').trim().matchAll(/\b\d{5}(?!\d)/g)].filter((match) => match.index! > 0);
  return matches.length ? matches[matches.length - 1][0] : null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Reads the cart sent by the browser. Returns null if it isn't a usable list
// of listings and whole-number quantities. The same listing listed twice is
// combined into one line; it can't be in the cart both by the case and not.
export function parseCartItems(raw: unknown): CartRequestItem[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;

  const items = new Map<string, CartRequestItem>();
  for (const entry of raw) {
    const listingId = typeof entry?.listingId === 'string' ? entry.listingId : '';
    const quantity = Number(entry?.quantity);
    const wholesale = entry?.wholesale === true;
    if (!UUID.test(listingId) || !Number.isInteger(quantity) || quantity < 1) return null;
    const existing = items.get(listingId);
    if (existing && Boolean(existing.wholesale) !== wholesale) return null;
    items.set(listingId, { listingId, quantity: (existing?.quantity || 0) + quantity, ...(wholesale ? { wholesale } : {}) });
  }

  if (items.size > MAX_CART_LINES) return null;
  return [...items.values()];
}

// `buyerId` is the signed-in buyer, if there is one: they can't buy from their
// own listings.
export async function priceCart(items: CartRequestItem[], buyerId?: string | null, pickups: PickupChoices = {}) {
  const listingIds = items.map((item) => item.listingId);

  const { data: listings } = await supabaseAdmin
    .from('produce_listings')
    .select('id, title, unit_type, price_per_unit, available_quantity, farmer_id, category, zip_code, location_name, status, harvest_ready_date, harvest_end_date')
    .in('id', listingIds);
  const listingById = new Map((listings || []).map((l) => [l.id as string, l]));

  // Where each item is actually collected. Sales tax is worked out for that
  // place, so the zip in the pickup address is used in preference to the zip
  // typed on the listing, which is only the general area shown to shoppers.
  const { data: addressRows } = await supabaseAdmin
    .from('listing_pickup_addresses')
    .select('listing_id, address')
    .in('listing_id', listingIds);
  const pickupZipByListing = new Map(
    (addressRows || []).map((row) => [row.listing_id as string, zipFromAddress(row.address as string)])
  );

  const farmerIds = [...new Set((listings || []).map((l) => l.farmer_id).filter(Boolean))];
  const { data: sellers } = farmerIds.length
    ? await supabaseAdmin
        .from('seller_profiles')
        .select('id, farm_name, stripe_account_id, stripe_onboarding_complete, pickup_days, pickup_times')
        .in('id', farmerIds)
    : { data: [] as any[] };
  const sellerById = new Map((sellers || []).map((s: any) => [s.id as string, s]));
  const suspended = await suspendedSellerIds(farmerIds as string[]);
  // The markets each farm's buyers can order ahead for.
  const marketOptions = await marketOptionsFor(farmerIds as string[]);

  // Wholesale items: the offers, and whether this buyer may buy them (and
  // tax-free).
  const wholesaleIds = items.filter((item) => item.wholesale).map((item) => item.listingId);
  const offers = await wholesaleOffersFor(wholesaleIds);
  const buyer = wholesaleIds.length ? await wholesaleBuyer(buyerId) : { approved: false, exemptCertificateId: null };

  const lines: PricedLine[] = items.map((item) => {
    const listing = listingById.get(item.listingId);
    const seller = listing?.farmer_id ? sellerById.get(listing.farmer_id) : null;
    const offer = item.wholesale ? offers.get(item.listingId) : undefined;
    const listingUnit = listing?.unit_type || 'units';
    // Rounded down: orders are whole units (or whole cases), so a leftover
    // fraction can't be bought.
    const availableUnits = listing ? Math.max(0, Math.floor(Number(listing.available_quantity ?? 0))) : 0;
    const available = offer ? Math.floor(availableUnits / offer.caseSize) : availableUnits;

    let problem: string | null = null;
    if (item.wholesale && !buyer.approved) {
      problem = 'Wholesale prices are for approved business accounts. Please remove it, or add it at the retail price.';
    } else if (item.wholesale && !offer) {
      problem = "This farm no longer sells this by the case. Please remove it, or add it at the retail price.";
    } else if (offer && item.quantity < offer.minCases) {
      problem = `The farm's minimum is ${offer.minCases} cases. Please raise the quantity.`;
    } else if (!listing) {
      problem = 'This listing is no longer available. Please remove it.';
    } else if (buyerId && listing.farmer_id === buyerId) {
      problem = "This is your own listing, and you can't buy from yourself. Please remove it.";
    } else if (listing.status === 'removed' || !isAllowedCategory(listing.category)) {
      problem = 'This kind of item is no longer sold on Farm Fresh Direct. Please remove it.';
    } else if (available < 1) {
      problem = offer ? 'Not enough left for a full case. Please remove it.' : 'Sold out. Please remove it.';
    } else if (item.quantity > available) {
      problem = `Only ${available}${offer ? ` case${available === 1 ? '' : 's'}` : ''} left. Please lower the quantity.`;
    } else if (suspended.has(listing.farmer_id)) {
      problem = "This farm isn't taking orders right now. Please remove it.";
    } else if (!seller?.stripe_account_id || !seller.stripe_onboarding_complete) {
      problem = "This farmer hasn't finished setting up payouts yet, so it can't be bought right now. Please remove it.";
    }

    // Picked up at one of the farm's markets, if the buyer chose one.
    const chosen = listing?.farmer_id ? pickups[listing.farmer_id] : undefined;
    const market: MarketOption | null = chosen ? (marketOptions.get(listing!.farmer_id) || []).find((o) => o.key === chosen) || null : null;
    if (!problem && chosen && !market) {
      problem = 'That market pickup is no longer available. Choose another pickup for this farm.';
    } else if (!problem && market && listing?.harvest_ready_date && market.date < String(listing.harvest_ready_date)) {
      problem = `Not ready until ${formatBoxDate(String(listing.harvest_ready_date))}. Choose a later pickup for this farm.`;
    } else if (!problem && market && listing?.harvest_end_date && market.date > String(listing.harvest_end_date)) {
      problem = `Only available until ${formatBoxDate(String(listing.harvest_end_date))}. Choose an earlier pickup for this farm.`;
    }

    return {
      listingId: item.listingId,
      title: listing?.title || 'Listing no longer available',
      unitType: offer ? caseLabel(offer.caseSize, listingUnit) : listingUnit,
      pricePerUnit: offer ? offer.casePrice : Number(listing?.price_per_unit ?? 0),
      quantity: item.quantity,
      wholesale: offer ? { caseSize: offer.caseSize, minCases: offer.minCases, listingUnit } : null,
      orderQuantity: offer ? item.quantity * offer.caseSize : item.quantity,
      taxExempt: Boolean(offer && buyer.exemptCertificateId),
      available,
      farmerId: listing?.farmer_id || null,
      farmName: seller?.farm_name || 'Local Farm',
      locationName: listing?.location_name || '',
      zipCode: String(listing?.zip_code || '').slice(0, 5),
      usualPickup: describeUsualPickup(seller?.pickup_days, seller?.pickup_times) || '',
      subtotalCents: 0,
      feeCents: 0,
      taxCents: 0,
      totalCents: 0,
      problem,
      market: market ? { key: market.key, label: market.label } : null,
    };
  });

  const good = lines.filter((line) => !line.problem);
  const totals = calculateCartTotals(good.map((line) => ({ ...line, wholesale: Boolean(line.wholesale) })));

  // Sales tax, if tax collection is switched on (zero otherwise).
  const tax = await calculateCartTax(
    good.map((line, i) => {
      const listing = listingById.get(line.listingId);
      return {
        category: listing?.category,
        // At a market, tax is for the market's place.
        pickupZip: (line.market && marketOptions.get(line.farmerId || '')?.find((o) => o.key === line.market!.key)?.zip) || pickupZipByListing.get(line.listingId) || listing?.zip_code,
        subtotalCents: totals.lines[i].subtotalCents,
        feeCents: totals.lines[i].feeCents,
        exempt: line.taxExempt,
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
    // The fee in two parts, for showing which is which.
    retailFeeCents: totals.retailFeeCents,
    wholesaleFeeCents: totals.wholesaleFeeCents,
    // The resale certificate that makes this cart's wholesale items tax-free,
    // if it does.
    exemptCertificateId: good.some((line) => line.taxExempt) ? buyer.exemptCertificateId : null,
    taxCents: tax.taxCents,
    totalCents: totals.totalCents + tax.taxCents,
    calculationId: tax.calculationId,
    // Only for a cart picked up in several zip codes: the tax calculation each
    // item belongs to, by listing, for recording the tax ourselves.
    manualTaxCalculationByListing: new Map(
      good.flatMap((line, i): [string, string][] =>
        tax.manualCalculationIds[i] ? [[line.listingId, tax.manualCalculationIds[i]!]] : []
      )
    ),
    // True when every item can be bought as it stands.
    ok: good.length === lines.length,
    // Where each farm's buyers can order ahead for pickup, by farm.
    marketOptions: Object.fromEntries(
      [...marketOptions].map(([farmerId, options]) => [farmerId, options.map((o) => ({ key: o.key, label: o.label }))])
    ) as Record<string, { key: string; label: string }[]>,
  };
}
