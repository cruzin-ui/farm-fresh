import { calculateCartTotals, BUYER_FEE_LABEL, FREE_CANCELLATION_HOURS, RESTOCKING_RATE } from '@/lib/pricing';
import {
  CHARGE_DAYS_BEFORE,
  describeFrequency,
  formatBoxDate,
  WEEKDAYS,
  type CsaSchedule,
} from '@/lib/csaSchedule';

// What one box costs a member, in cents, before any sales tax: the box price
// plus the usual buyer service fee. The same calculation as an ordinary cart
// holding just the box.
export function boxCostCents(priceCents: number) {
  const totals = calculateCartTotals([{ pricePerUnit: priceCents / 100, quantity: 1 }]);
  return { priceCents: totals.subtotalCents, feeCents: totals.feeCents, totalCents: totals.totalCents };
}

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

// The recurring-payment agreement a member ticks to join, word for word. Built
// in one place so the join page shows exactly what is saved with the
// membership as the record of what they agreed to.
export function csaAgreementText(params: {
  farmName: string;
  planName: string;
  priceCents: number;
  plan: CsaSchedule;
  firstBoxDate: string;
  // A shared box: the other farms that fill it with the host.
  partnerNames?: string[];
}) {
  const { farmName, planName, priceCents, plan, firstBoxDate, partnerNames = [] } = params;
  const cost = boxCostCents(priceCents);
  const day = WEEKDAYS[plan.pickup_weekday];

  return [
    `I'm joining "${planName}" from ${farmName}, picked up ${describeFrequency(plan).replace(/^Every/, 'every')}, from ${formatBoxDate(firstBoxDate, { long: true })} until ${formatBoxDate(plan.season_end, { long: true })} at the latest.`,
    `I authorize Farm Fresh Direct to charge my saved card ${money(cost.totalCents)} for each box (${money(cost.priceCents)} for the box plus the ${BUYER_FEE_LABEL} service fee), plus any sales tax, ${CHARGE_DAYS_BEFORE} days before each ${day} pickup, until I cancel or the season ends.`,
    ...(partnerNames.length
      ? [
          `The box is filled by ${farmName} together with ${partnerNames.join(' and ')}, and picked up at ${farmName}. If one of those farms can't supply its part some week, that part is left out, I'm charged less for that box by the price of that part, and the reminder email says so. If a part I've paid for doesn't arrive, I'm refunded for it.`,
        ]
      : []),
    `I'll get an email the day before each charge. Up to then I can skip that week, pause or cancel online at no cost. Once a box is charged it is an ordinary order: I can cancel it free within ${FREE_CANCELLATION_HOURS} hours, after which the farm keeps a ${Math.round(RESTOCKING_RATE * 100)}% restocking fee, and if the farm cancels or changes it I'm refunded in full.`,
  ].join(' ');
}
