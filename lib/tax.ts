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
// several zip codes takes one calculation per zip. Stripe then has to be told
// the tax was actually collected, which happens in one of two ways:
//
// - A cart picked up in ONE zip code has a single calculation, returned as
//   `calculationId`. It is linked to the payment, and Stripe records the tax
//   when the payment succeeds and reverses it on refunds by itself.
// - A cart spread over SEVERAL zip codes has several calculations, and a
//   payment can only be linked to one. Their ids come back per item in
//   `manualCalculationIds`, and we record and reverse the tax ourselves — see
//   recordCartTax and reverseOrderTax below.
export async function calculateCartTax(lines: TaxLine[]): Promise<{
  taxCentsByLine: number[];
  taxCents: number;
  calculationId: string | null;
  manualCalculationIds: (string | null)[];
}> {
  const taxCentsByLine = lines.map(() => 0);
  const manualCalculationIds: (string | null)[] = lines.map(() => null);
  if (!TAX_ENABLED || lines.length === 0) {
    return { taxCentsByLine, taxCents: 0, calculationId: null, manualCalculationIds };
  }

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
            reference: produceReference(index),
            tax_code: CATEGORY_TAX_CODES[line.category || ''] || DEFAULT_TAX_CODE,
            tax_behavior: 'exclusive' as const,
          },
        ];
        if (TAX_SERVICE_FEE && line.feeCents > 0) {
          items.push({
            amount: line.feeCents,
            reference: feeReference(index),
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
      if (calculation.id) {
        calculationIds.push(calculation.id);
        for (const index of indexes) manualCalculationIds[index] = calculation.id;
      }

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

    const oneLocation = lineIndexesByZip.size === 1;
    return {
      taxCentsByLine,
      taxCents: taxCentsByLine.reduce((sum, cents) => sum + cents, 0),
      calculationId: oneLocation ? calculationIds[0] ?? null : null,
      manualCalculationIds: oneLocation ? lines.map(() => null) : manualCalculationIds,
    };
  } catch (err: any) {
    if (err instanceof TaxError) throw err;
    console.error('Tax calculation failed:', err);
    await alertAdmin('sales tax calculation', err);
    throw new TaxError("We couldn't calculate tax for this order right now. Please try again in a moment.");
  }
}

// The names given to an item's two lines in its tax calculation. `lineIndex`
// is the item's position in the cart.
const produceReference = (lineIndex: number) => `produce_${lineIndex}`;
const feeReference = (lineIndex: number) => `fee_${lineIndex}`;

// For a cart spread over several zip codes: tells Stripe the tax in each
// calculation was collected, once the payment has succeeded. Returns the tax
// transaction created for each calculation, to be saved on the orders it
// covers. Safe to run twice for the same payment — the reference makes Stripe
// refuse a duplicate, which is treated as already done.
export async function recordCartTax(paymentId: string, calculationIds: string[]) {
  const transactionIdByCalculation = new Map<string, string>();

  for (const calculationId of [...new Set(calculationIds)]) {
    const transaction = await stripeAdmin.tax.transactions.createFromCalculation(
      { calculation: calculationId, reference: `${paymentId}-${calculationId}` },
      { idempotencyKey: `tax-transaction-${paymentId}-${calculationId}` }
    );
    transactionIdByCalculation.set(calculationId, transaction.id);
  }

  return transactionIdByCalculation;
}

// For an order whose tax we recorded ourselves (see above): tells Stripe that
// part of the order was refunded, so the tax owed goes down to match. The
// amounts are what was refunded, in cents: of the produce price, of the buyer
// fee, and of the tax. Orders whose tax Stripe manages (`tax_transaction_id`
// is empty) need nothing — Stripe sees the refund itself.
//
// Never throws: the buyer's refund has already been issued by the time this
// runs, and a failure here only means Stripe's tax report needs correcting by
// hand, which an admin is alerted to.
export async function reverseOrderTax(params: {
  order: { id: string; tax_transaction_id?: string | null; tax_line_index?: number | null };
  produceCents: number;
  feeCents: number;
  taxCents: number;
  // Makes this reversal's reference unique, e.g. "qty-5-to-3" or "no-show".
  reason: string;
}) {
  const { order, produceCents, feeCents, taxCents, reason } = params;
  if (!order.tax_transaction_id || order.tax_line_index == null) return;
  if (produceCents <= 0 && feeCents <= 0 && taxCents <= 0) return;

  try {
    const lineItems = await stripeAdmin.tax.transactions.listLineItems(order.tax_transaction_id, { limit: 100 });
    const produceLine = lineItems.data.find((item) => item.reference === produceReference(order.tax_line_index!));
    const feeLine = lineItems.data.find((item) => item.reference === feeReference(order.tax_line_index!));
    if (!produceLine) throw new Error(`Tax transaction ${order.tax_transaction_id} has no line for this order.`);

    // Share the refunded tax between the produce and the fee in proportion to
    // the tax each one carried, never taking more from a line than it has.
    const lineTaxTotal = produceLine.amount_tax + (feeLine?.amount_tax || 0);
    const feeTaxCents = feeLine && lineTaxTotal > 0
      ? Math.min(feeLine.amount_tax, Math.round((taxCents * feeLine.amount_tax) / lineTaxTotal))
      : 0;
    const produceTaxCents = Math.min(produceLine.amount_tax, taxCents - feeTaxCents);

    // Reversal amounts are negative.
    const reversalLines = [
      { line: produceLine, amount: Math.min(produceCents, produceLine.amount), tax: produceTaxCents, name: 'produce' },
      { line: feeLine, amount: feeLine ? Math.min(feeCents, feeLine.amount) : 0, tax: feeTaxCents, name: 'fee' },
    ]
      .filter((entry) => entry.line && (entry.amount > 0 || entry.tax > 0))
      .map((entry) => ({
        original_line_item: entry.line!.id,
        reference: `${order.id}-${reason}-${entry.name}`,
        amount: -entry.amount,
        amount_tax: -entry.tax,
      }));

    if (reversalLines.length === 0) return;

    await stripeAdmin.tax.transactions.createReversal(
      {
        mode: 'partial',
        original_transaction: order.tax_transaction_id,
        reference: `${order.id}-${reason}`,
        line_items: reversalLines,
      },
      { idempotencyKey: `tax-reversal-${order.id}-${reason}` }
    );
  } catch (err) {
    console.error('Refund issued but its tax could not be reversed in Stripe:', order.id, err);
    await alertAdmin('refund issued but the tax record in Stripe was not updated', err, {
      order: order.id,
      'tax transaction': order.tax_transaction_id,
      'tax to reverse': `$${(taxCents / 100).toFixed(2)}`,
    });
  }
}
