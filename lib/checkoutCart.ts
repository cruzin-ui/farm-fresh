import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { suspendedSellerIds } from '@/lib/accountBlocks';
import { calculateCartTotals } from '@/lib/pricing';
import { calculateCartTax } from '@/lib/tax';
import { isAllowedCategory, madeToOrderLimit } from '@/lib/categories';
import { describeUsualPickup } from '@/lib/pickupRules';
import { marketOptionsFor, type MarketOption } from '@/lib/appearancesServer';
import { parseMarketKey } from '@/lib/appearances';
import { formatBoxDate } from '@/lib/csaSchedule';
import { caseLabel } from '@/lib/wholesale';
import { wholesaleBuyer, wholesaleOffersFor } from '@/lib/wholesaleServer';
import {
  deliveryDates,
  deliveryFeeCents,
  deliveryKey,
  deliveryLabel,
  describeDelivery,
  parseDeliveryKey,
  EGG_CATEGORY,
  type DeliveryAddress,
} from '@/lib/delivery';
import { deliveringFarms, drivingMiles } from '@/lib/deliveryServer';

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
  // When the buyer chose delivery for this farm: the date and how it reads.
  delivery: { key: string; date: string; label: string } | null;
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
// or drop-off point ("appearanceId@date"), or to delivery ("delivery@date").
// A farm not listed is picked up at the farm.
export type PickupChoices = Record<string, string>;

export function parsePickupChoices(raw: unknown): PickupChoices {
  const choices: PickupChoices = {};
  if (!raw || typeof raw !== 'object') return choices;
  for (const [farmerId, key] of Object.entries(raw as Record<string, unknown>)) {
    if (UUID.test(farmerId) && (parseMarketKey(key) || parseDeliveryKey(key))) choices[farmerId] = key as string;
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
// `deliveryAddress` is where the buyer wants deliveries taken, if they chose
// delivery for any farm.
export async function priceCart(
  items: CartRequestItem[],
  buyerId?: string | null,
  pickups: PickupChoices = {},
  deliveryAddress: DeliveryAddress | null = null,
  // The buyer's email, for a guest: used with `buyerId` to count what they
  // already have on order from a made-to-order listing with a limit.
  buyerEmail: string | null = null
) {
  const listingIds = items.map((item) => item.listingId);

  const { data: listings } = await supabaseAdmin
    .from('produce_listings')
    .select('id, title, unit_type, price_per_unit, available_quantity, farmer_id, category, zip_code, location_name, status, harvest_ready_date, harvest_end_date, pickup_only, made_to_order')
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
  // Made-to-order listings with a limit per customer: how much this buyer
  // already has on order (not yet picked up or cancelled) from each.
  const alreadyOnOrder = new Map<string, number>();
  const limitedIds = (listings || []).filter((l) => madeToOrderLimit(l) !== null).map((l) => l.id as string);
  if (limitedIds.length > 0 && (buyerId || buyerEmail)) {
    let query = supabaseAdmin
      .from('orders')
      .select('listing_id, reserved_quantity, quantity')
      .in('listing_id', limitedIds)
      .in('status', ['pending_pickup', 'ready_for_pickup']);
    query = buyerId
      ? query.eq('buyer_id', buyerId)
      : query.ilike('buyer_email', String(buyerEmail).replace(/[\\%_]/g, (c) => `\\${c}`));
    const { data: openOrders } = await query;
    for (const o of openOrders || []) {
      const amount = Number(o.reserved_quantity ?? o.quantity ?? 0);
      alreadyOnOrder.set(o.listing_id, (alreadyOnOrder.get(o.listing_id) || 0) + amount);
    }
  }
  // The markets each farm's buyers can order ahead for.
  const marketOptions = await marketOptionsFor(farmerIds as string[]);
  // The farms that deliver, and the dates each can deliver on.
  const deliveryFarms = await deliveringFarms(farmerIds as string[]);
  const deliveryDatesByFarm = new Map([...deliveryFarms].map(([id, settings]) => [id, deliveryDates(settings)]));

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
    } else if (!offer && madeToOrderLimit(listing) !== null && item.quantity + (alreadyOnOrder.get(listing.id) || 0) > available) {
      const already = alreadyOnOrder.get(listing.id) || 0;
      problem = already > 0
        ? `The farm takes up to ${available} per customer, and you already have ${already} on order. ${available > already ? `You can add up to ${available - already} more.` : 'Please remove it for now.'}`
        : `The farm takes up to ${available} per customer. Please lower the quantity.`;
    } else if (item.quantity > available) {
      problem = `Only ${available}${offer ? ` case${available === 1 ? '' : 's'}` : ''} left. Please lower the quantity.`;
    } else if (suspended.has(listing.farmer_id)) {
      problem = "This farm isn't taking orders right now. Please remove it.";
    } else if (!seller?.stripe_account_id || !seller.stripe_onboarding_complete) {
      problem = "This farmer hasn't finished setting up payouts yet, so it can't be bought right now. Please remove it.";
    }

    // Picked up at one of the farm's markets or drop-off points, or
    // delivered, if the buyer chose that.
    const chosen = listing?.farmer_id ? pickups[listing.farmer_id] : undefined;
    const chosenDelivery = parseDeliveryKey(chosen);
    const market: MarketOption | null =
      chosen && !chosenDelivery ? (marketOptions.get(listing!.farmer_id) || []).find((o) => o.key === chosen) || null : null;
    const deliverySettings = chosenDelivery && listing?.farmer_id ? deliveryFarms.get(listing.farmer_id) : undefined;
    const delivery =
      chosenDelivery && deliverySettings && (deliveryDatesByFarm.get(listing!.farmer_id) || []).includes(chosenDelivery.date)
        ? { key: chosen!, date: chosenDelivery.date, label: deliveryLabel(deliverySettings, chosenDelivery.date) }
        : null;
    const pickupDate = market?.date || delivery?.date;
    if (!problem && chosen && !market && !delivery) {
      problem = chosenDelivery
        ? 'That delivery date is no longer available. Choose another date, or pickup, for this farm.'
        : 'That pickup is no longer available. Choose another pickup for this farm.';
    } else if (!problem && delivery && listing?.pickup_only) {
      problem = 'The farm offers this for pickup only. Choose pickup for this farm, or remove it.';
    } else if (!problem && delivery && listing?.category === EGG_CATEGORY && !deliverySettings?.delivers_eggs) {
      problem = "This farm doesn't deliver eggs, which have to be kept at 45°F or below. Choose pickup for this farm, or remove them.";
    } else if (!problem && pickupDate && listing?.harvest_ready_date && pickupDate < String(listing.harvest_ready_date)) {
      problem = `Not ready until ${formatBoxDate(String(listing.harvest_ready_date))}. Choose a later date for this farm.`;
    } else if (!problem && pickupDate && listing?.harvest_end_date && pickupDate > String(listing.harvest_end_date)) {
      problem = `Only available until ${formatBoxDate(String(listing.harvest_end_date))}. Choose an earlier date for this farm.`;
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
      delivery,
    };
  });

  // Deliveries, one per farm: the fee for the buyer's address, or why that
  // farm can't deliver there, which is put on each of that farm's items.
  const deliveries: { farmerId: string; date: string; windowLabel: string; miles: number; feeCents: number }[] = [];
  for (const farmerId of new Set(lines.filter((line) => line.delivery && line.farmerId).map((line) => line.farmerId!))) {
    // Without an address there is nothing to check yet; payment insists on
    // one (see /api/checkout).
    if (!deliveryAddress) continue;
    const settings = deliveryFarms.get(farmerId)!;
    const farmLines = lines.filter((line) => line.farmerId === farmerId);
    const date = farmLines.find((line) => line.delivery)!.delivery!.date;
    const miles = await drivingMiles(settings.farmZip, deliveryAddress.zip);
    const itemsCents = farmLines
      .filter((line) => !line.problem)
      .reduce((sum, line) => sum + Math.round(line.pricePerUnit * line.quantity * 100), 0);
    let farmProblem: string | null = null;
    if (miles === null) {
      farmProblem = "We couldn't find that zip code. Check your delivery address.";
    } else if (miles > settings.radius_miles) {
      farmProblem = `Your address is about ${miles} miles from this farm, and it delivers within ${settings.radius_miles} miles. Choose pickup for this farm.`;
    } else if (itemsCents < settings.min_order_cents) {
      farmProblem = `This farm delivers orders of $${(settings.min_order_cents / 100).toFixed(2)} or more. Add more, or choose pickup for this farm.`;
    }
    if (farmProblem) {
      for (const line of farmLines) if (!line.problem) line.problem = farmProblem;
    } else {
      deliveries.push({ farmerId, date, windowLabel: deliveryLabel(settings, date), miles: miles!, feeCents: deliveryFeeCents(settings, miles!) });
    }
  }

  const good = lines.filter((line) => !line.problem);
  // A delivery whose items all have a problem isn't charged for.
  const chargedDeliveries = deliveries.filter((d) => good.some((line) => line.farmerId === d.farmerId));
  const deliveryCents = chargedDeliveries.reduce((sum, d) => sum + d.feeCents, 0);
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

  // A delivery fee is stated separately and isn't in the tax calculation, so
  // the payment's total no longer matches the calculation's. Stripe links a
  // payment only to a calculation with the same total, so the tax is then
  // recorded by us instead, as for a cart picked up in several zip codes.
  if (deliveryCents > 0 && tax.calculationId) {
    const calculationId = tax.calculationId;
    tax.manualCalculationIds = good.map(() => calculationId);
    tax.calculationId = null;
  }

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
    // The delivery fees, one per farm delivering.
    deliveryCents,
    deliveries: chargedDeliveries,
    totalCents: totals.totalCents + tax.taxCents + deliveryCents,
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
    // The farms in the cart that deliver: how their delivery works and the
    // dates they can deliver on, by farm.
    deliveryOptions: Object.fromEntries(
      [...deliveryFarms].map(([farmerId, settings]) => [
        farmerId,
        {
          summary: describeDelivery(settings),
          note: settings.note,
          options: (deliveryDatesByFarm.get(farmerId) || []).map((date) => ({
            key: deliveryKey(date),
            label: deliveryLabel(settings, date),
          })),
        },
      ])
    ) as Record<string, { summary: string; note: string; options: { key: string; label: string }[] }>,
    // Where each farm's buyers can order ahead for pickup, by farm.
    marketOptions: Object.fromEntries(
      [...marketOptions].map(([farmerId, options]) => [farmerId, options.map((o) => ({ key: o.key, label: o.label, kind: o.kind }))])
    ) as Record<string, { key: string; label: string; kind: string }[]>,
  };
}
