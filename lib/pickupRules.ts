// The deadlines both sides of an order work to. Safe to import anywhere.
//
// - The SELLER has SELLER_READY_DAYS to mark an order ready, counted from when
//   it was placed or from the listing's harvest date, whichever is later. If
//   they miss it the buyer can cancel for a full refund, and at
//   AUTO_CANCEL_DAYS the order is cancelled and refunded automatically.
// - The BUYER has BUYER_PICKUP_DAYS to collect an order once it is marked
//   ready. Only after that can the seller report them as a no-show.
//
// Each deadline is saved on the order when it starts (ready_by at checkout,
// pickup_by when the order is marked ready), so changing these numbers only
// affects orders placed afterwards. Orders from before deadlines existed have
// neither saved, and are left alone: no reminders, no automatic cancellation.

export const SELLER_READY_DAYS = 3;
export const BUYER_PICKUP_DAYS = 3;
export const AUTO_CANCEL_DAYS = 7;

// Reminders go out this long before a deadline.
export const REMINDER_HOURS_BEFORE = 24;

// Dates in emails are written out in this time zone. The site launches in
// Arizona, which keeps the same UTC offset all year.
export const SITE_TIME_ZONE = 'America/Phoenix';
const SITE_UTC_OFFSET = '-07:00';

const DAY_MS = 24 * 60 * 60 * 1000;

type OrderDates = {
  status?: string | null;
  created_at: string;
  ready_by?: string | null;
  pickup_by?: string | null;
};

// When an order placed now must be marked ready by. `harvestReadyDate` is the
// listing's harvest date ("YYYY-MM-DD"); for a crop that isn't ready yet, the
// seller's days start counting on that date.
export function readyDeadline(orderedAt: Date, harvestReadyDate?: string | null) {
  let start = orderedAt.getTime();

  if (harvestReadyDate && /^\d{4}-\d{2}-\d{2}$/.test(harvestReadyDate)) {
    const harvest = new Date(`${harvestReadyDate}T00:00:00${SITE_UTC_OFFSET}`).getTime();
    if (!Number.isNaN(harvest)) start = Math.max(start, harvest);
  }

  return new Date(start + SELLER_READY_DAYS * DAY_MS);
}

// The saved deadline for marking an order ready, or null for an order from
// before deadlines existed.
export function readyBy(order: OrderDates) {
  return order.ready_by ? new Date(order.ready_by) : null;
}

// When an order that still hasn't been marked ready is cancelled automatically.
export function autoCancelAt(order: OrderDates) {
  const deadline = readyBy(order);
  return deadline ? new Date(deadline.getTime() + (AUTO_CANCEL_DAYS - SELLER_READY_DAYS) * DAY_MS) : null;
}

// True when the seller has missed their deadline: the order is still waiting
// to be marked ready after its ready-by date.
export function isSellerLate(order: OrderDates, now: number = Date.now()) {
  const deadline = readyBy(order);
  return order.status === 'pending_pickup' && deadline !== null && now > deadline.getTime();
}

// When an order marked ready now must be collected by.
export function pickupDeadline(markedReadyAt: Date) {
  return new Date(markedReadyAt.getTime() + BUYER_PICKUP_DAYS * DAY_MS);
}

// A no-show can be reported once the buyer's time to collect has run out.
// Orders marked ready before deadlines were saved have none, and can be
// reported at any time, as before.
export function canReportNoShow(order: OrderDates, now: number = Date.now()) {
  return !order.pickup_by || now > new Date(order.pickup_by).getTime();
}

// "Monday, October 12" — for emails, which are written on the server.
export function formatDeadline(date: Date | string) {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: SITE_TIME_ZONE,
  }).format(new Date(date));
}

// The days and times of day a seller can offer for pickup. A seller saves the
// ones they're usually available on their farm profile; shoppers see those
// before they buy, and they are ticked for the seller when marking an order
// ready.
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const PICKUP_TIMES = ['Morning (8am–12pm)', 'Afternoon (12–4pm)', 'Evening (4–7pm)'];

// "Sat, Sun · Morning (8am–12pm)" — a seller's usual availability in words, or
// null if they haven't set it.
export function describeUsualPickup(days?: string[] | null, times?: string[] | null) {
  const usualDays = WEEKDAYS.filter((day) => (days || []).includes(day));
  const usualTimes = PICKUP_TIMES.filter((time) => (times || []).includes(time));
  if (usualDays.length === 0 && usualTimes.length === 0) return null;

  const dayText = usualDays.length === 7 ? 'Every day' : usualDays.join(', ');
  return [dayText, usualTimes.join(', ')].filter(Boolean).join(' · ');
}

// A link that opens directions to an address in the reader's maps app.
export function mapLink(address: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}
