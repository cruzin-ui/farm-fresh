import { stripeAdmin } from '@/lib/stripeAdmin';
import { alertAdmin } from '@/lib/alerts';

// SERVER-ONLY. Sales tax, calculated by Stripe Tax.
//
// Tax collection is OFF unless the TAX_ENABLED environment variable is set to
// "true". Turn it on only once the business is registered to collect tax and
// that registration has been added in the Stripe Dashboard — Stripe only
// calculates tax for places where a registration exists, and returns zero
// everywhere else.

export const TAX_ENABLED = process.env.TAX_ENABLED === 'true';

// How each listing category is classified for tax. These are Stripe's product
// tax codes; Stripe applies the right rate (including exemptions for
// groceries) for the pickup location. CONFIRM THESE WITH AN ACCOUNTANT before
// turning tax on — the classification decides what is taxed.
const FOOD_FOR_HOME = 'txcd_40040000'; // Food for Non-Immediate Consumption (groceries)
const GENERAL_GOODS = 'txcd_99999999'; // General - Tangible Goods

export const CATEGORY_TAX_CODES: Record<string, string> = {
  Vegetables: FOOD_FOR_HOME,
  'Fruits & Berries': FOOD_FOR_HOME,
  'Herbs & Spices': FOOD_FOR_HOME,
  'Honey & Jam': FOOD_FOR_HOME,
  'Fresh Eggs': FOOD_FOR_HOME,
  // Seeds for planting are goods, not food.
  Seeds: GENERAL_GOODS,
};

// Used for a category that isn't listed above.
const DEFAULT_TAX_CODE = GENERAL_GOODS;

// The buyer's service fee. Set TAX_SERVICE_FEE=false to leave the fee out of
// the tax calculation entirely, if it is confirmed not to be taxable.
const SERVICE_FEE_TAX_CODE = 'txcd_20030000'; // General - Services
const TAX_SERVICE_FEE = process.env.TAX_SERVICE_FEE !== 'false';

// An error whose message is safe to show a buyer.
export class TaxError extends Error {}

export type TaxLine = {
  category: string | null | undefined;
  pickupZip: string | null | undefined;
  subtotalCents: number;
  // This item's share of the buyer's service fee.
  feeCents: number;
};

// Works out the sales tax on a cart, item by item. Orders are collected in
// person, so each item is taxed where it is picked up — its listing's zip
// code — not at the buyer's address. Returns zero tax (and no calculation)
// while tax collection is switched off.
//
// Stripe works out tax for one location at a time, so a cart with pickups in
// several zip codes takes one calculation per zip. Only a single calculation
// can be linked to a payment, which is what makes Stripe record the tax and
// reverse it on refunds automatically; `calculationId` is therefore only set
// when the whole cart is picked up in one zip code.
export async function calculateCartTax(
  lines: TaxLine[]
): Promise<{ taxCentsByLine: number[]; taxCents: number; calculationId: string | null }> {
  const taxCentsByLine = lines.map(() => 0);
  if (!TAX_ENABLED || lines.length === 0) return { taxCentsByLine, taxCents: 0, calculationId: null };

  const lineIndexesByZip = new Map<string, number[]>();
  lines.forEach((line, index) => {
    const zip = (line.pickupZip || '').trim().slice(0, 5);
    if (!/^\d{5}$/.test(zip)) {
      throw new TaxError("A listing in your cart doesn't have a valid zip code, so tax can't be calculated. Please contact us.");
    }
    lineIndexesByZip.set(zip, [...(lineIndexesByZip.get(zip) || []), index]);
  });

  try {
    const calculationIds: string[] = [];

    for (const [zip, indexes] of lineIndexesByZip) {
      const lineItems = indexes.flatMap((index) => {
        const line = lines[index];
        const items = [
          {
            amount: line.subtotalCents,
            reference: `produce_${index}`,
            tax_code: CATEGORY_TAX_CODES[line.category || ''] || DEFAULT_TAX_CODE,
            tax_behavior: 'exclusive' as const,
          },
        ];
        if (TAX_SERVICE_FEE && line.feeCents > 0) {
          items.push({
            amount: line.feeCents,
            reference: `fee_${index}`,
            tax_code: SERVICE_FEE_TAX_CODE,
            tax_behavior: 'exclusive' as const,
          });
        }
        return items;
      });

      const calculation = await stripeAdmin.tax.calculations.create({
        currency: 'usd',
        line_items: lineItems,
        customer_details: {
          address: { postal_code: zip, country: 'US' },
          address_source: 'shipping',
        },
        expand: ['line_items'],
      });
      if (calculation.id) calculationIds.push(calculation.id);

      // Stripe reports the tax on each line; add an item's produce and fee
      // lines together.
      let assigned = 0;
      for (const item of calculation.line_items?.data || []) {
        const index = Number(String(item.reference || '').split('_')[1]);
        if (Number.isInteger(index) && indexes.includes(index)) {
          taxCentsByLine[index] += item.amount_tax;
          assigned += item.amount_tax;
        }
      }

      // If the per-line breakdown didn't come back in full, put whatever is
      // unaccounted for on the first item so the total charged is still right.
      const missing = calculation.tax_amount_exclusive - assigned;
      if (missing !== 0) taxCentsByLine[indexes[0]] += missing;
    }

    return {
      taxCentsByLine,
      taxCents: taxCentsByLine.reduce((sum, cents) => sum + cents, 0),
      calculationId: lineIndexesByZip.size === 1 ? calculationIds[0] ?? null : null,
    };
  } catch (err: any) {
    if (err instanceof TaxError) throw err;
    console.error('Tax calculation failed:', err);
    await alertAdmin('sales tax calculation', err);
    throw new TaxError("We couldn't calculate tax for this order right now. Please try again in a moment.");
  }
}
