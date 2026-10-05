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

// Works out the sales tax on an order. Orders are collected in person, so the
// tax location is the listing's pickup zip code, not the buyer's address.
// Returns zero tax (and no calculation) while tax collection is switched off.
export async function calculateOrderTax(params: {
  category: string | null | undefined;
  pickupZip: string | null | undefined;
  subtotalCents: number;
  feeCents: number;
}): Promise<{ taxCents: number; calculationId: string | null }> {
  if (!TAX_ENABLED) return { taxCents: 0, calculationId: null };

  const zip = (params.pickupZip || '').trim().slice(0, 5);
  if (!/^\d{5}$/.test(zip)) {
    throw new TaxError("This listing doesn't have a valid zip code, so tax can't be calculated. Please contact us.");
  }

  const lineItems = [
    {
      amount: params.subtotalCents,
      reference: 'produce',
      tax_code: CATEGORY_TAX_CODES[params.category || ''] || DEFAULT_TAX_CODE,
      tax_behavior: 'exclusive' as const,
    },
  ];

  if (TAX_SERVICE_FEE && params.feeCents > 0) {
    lineItems.push({
      amount: params.feeCents,
      reference: 'service_fee',
      tax_code: SERVICE_FEE_TAX_CODE,
      tax_behavior: 'exclusive' as const,
    });
  }

  try {
    const calculation = await stripeAdmin.tax.calculations.create({
      currency: 'usd',
      line_items: lineItems,
      customer_details: {
        address: { postal_code: zip, country: 'US' },
        address_source: 'shipping',
      },
    });

    return { taxCents: calculation.tax_amount_exclusive, calculationId: calculation.id };
  } catch (err: any) {
    console.error('Tax calculation failed:', err);
    await alertAdmin('sales tax calculation', err);
    throw new TaxError("We couldn't calculate tax for this order right now. Please try again in a moment.");
  }
}
