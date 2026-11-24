import { addDays, formatBoxDate, todayInArizona, weekdayOf } from '@/lib/csaSchedule';
import { formatTime, orderCutoff } from '@/lib/appearances';

// Delivery: a farm taking orders to buyers' doors itself. Safe to import
// anywhere. The server side is lib/deliveryServer.ts.
//
// - A farm sets an area (miles by road from its zip code), a fee (flat, plus
//   an optional amount per mile), a smallest order, and delivery days with a
//   time window.
// - At checkout the buyer picks "Deliver to me" and a date for that farm,
//   and gives their address. The fee is one per farm per checkout.
// - At the door the farm either scans the buyer's code (paid at once, as at a
//   pickup), or leaves the order and takes a photo. Then the buyer has
//   DELIVERY_RELEASE_HOURS to report a problem before the farm is paid.
// - The fee goes to the farm, less the seller fee, once the delivery is done;
//   it is refunded if every item in it is cancelled.

// A delivery can be booked for dates up to this many days away.
export const DELIVERY_DAYS_AHEAD = 14;
// How long a buyer has to report a problem with an order left at the door.
export const DELIVERY_RELEASE_HOURS = 24;
// The furthest a farm can deliver.
export const MAX_DELIVERY_MILES = 50;

// The food safety rule for eggs (Arizona requires shell eggs to be kept at
// 45°F or below). A farm has to confirm it before it can deliver eggs.
export const EGG_DELIVERY_RULE =
  'Eggs must be kept at 45°F or below until they are handed over or left: carry them in a cooler with ice packs, and leave them only in a cooler.';
export const EGG_CATEGORY = 'Fresh Eggs';

export type DeliverySettings = {
  enabled: boolean;
  radius_miles: number;
  fee_cents: number;
  per_mile_cents: number;
  min_order_cents: number;
  // 0 = Sunday ... 6 = Saturday.
  weekdays: number[];
  start_time: string;
  end_time: string;
  delivers_eggs: boolean;
  note: string;
};

export const DEFAULT_DELIVERY: DeliverySettings = {
  enabled: false,
  radius_miles: 10,
  fee_cents: 500,
  per_mile_cents: 0,
  min_order_cents: 0,
  weekdays: [],
  start_time: '09:00',
  end_time: '12:00',
  delivers_eggs: false,
  note: '',
};

// The fee for a delivery this many miles away.
export const deliveryFeeCents = (settings: Pick<DeliverySettings, 'fee_cents' | 'per_mile_cents'>, miles: number) =>
  settings.fee_cents + settings.per_mile_cents * Math.ceil(Math.max(0, miles));

// "9:00 am – 12:00 pm".
export const deliveryWindow = (settings: Pick<DeliverySettings, 'start_time' | 'end_time'>) =>
  `${formatTime(settings.start_time)} – ${formatTime(settings.end_time)}`;

// "Sat, Nov 21, 9:00 am – 12:00 pm".
export const deliveryLabel = (settings: Pick<DeliverySettings, 'start_time' | 'end_time'>, date: string) =>
  `${formatBoxDate(date)}, ${deliveryWindow(settings)}`;

// The end of a delivery window, as a moment.
export const deliveryEnd = (settings: Pick<DeliverySettings, 'end_time'>, date: string) =>
  new Date(`${date}T${settings.end_time}:00-07:00`);

// The dates a buyer can book now: the farm's delivery days, from tomorrow,
// with ordering closing at 6 pm the evening before (as for markets).
export function deliveryDates(settings: DeliverySettings, now: Date = new Date()) {
  if (!settings.enabled || settings.weekdays.length === 0) return [];
  const today = todayInArizona(now);
  const dates: string[] = [];
  for (let i = 1; i <= DELIVERY_DAYS_AHEAD; i++) {
    const date = addDays(today, i);
    if (settings.weekdays.includes(weekdayOf(date)) && now < orderCutoff(date)) dates.push(date);
  }
  return dates.slice(0, 8);
}

// The buyer's choice at checkout for a farm: "delivery@2026-11-21". (A market
// or drop-off point is "appearanceId@date"; nothing means pickup at the farm.)
export const deliveryKey = (date: string) => `delivery@${date}`;
export function parseDeliveryKey(value: unknown) {
  const match = typeof value === 'string' ? value.match(/^delivery@(\d{4}-\d{2}-\d{2})$/) : null;
  return match ? { date: match[1] } : null;
}

// "Mon, Wed and Sat".
const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
// Three or more days in a row read as a range: "Mon–Sat"; all seven as "Every day".
export function describeDeliveryDays(weekdays: number[]) {
  const sorted = [...new Set(weekdays)].filter((d) => d >= 0 && d <= 6).sort((a, b) => a - b);
  if (sorted.length === 7) return 'Every day';
  const runs: number[][] = [];
  for (const day of sorted) {
    const last = runs[runs.length - 1];
    if (last && last[last.length - 1] === day - 1) last.push(day);
    else runs.push([day]);
  }
  const parts = runs.flatMap((run) =>
    run.length >= 3 ? [`${SHORT_DAYS[run[0]]}–${SHORT_DAYS[run[run.length - 1]]}`] : run.map((d) => SHORT_DAYS[d])
  );
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

// "Delivers within 10 miles, Sat, 9:00 am – 12:00 pm, $5.00".
export function describeDelivery(settings: DeliverySettings) {
  const fee =
    settings.fee_cents === 0 && settings.per_mile_cents === 0
      ? 'free'
      : `$${(settings.fee_cents / 100).toFixed(2)}${settings.per_mile_cents ? ` + $${(settings.per_mile_cents / 100).toFixed(2)}/mile` : ''}`;
  return `Delivers within ${settings.radius_miles} miles · ${describeDeliveryDays(settings.weekdays)}, ${deliveryWindow(settings)} · ${fee}${
    settings.min_order_cents ? ` · $${(settings.min_order_cents / 100).toFixed(0)} minimum` : ''
  }`;
}

// Reads the delivery address a buyer typed at checkout.
export type DeliveryAddress = { address: string; zip: string; note: string };
export function readDeliveryAddress(raw: unknown): DeliveryAddress | null {
  if (!raw || typeof raw !== 'object') return null;
  const input = raw as Record<string, unknown>;
  const address = typeof input.address === 'string' ? input.address.trim().slice(0, 300) : '';
  const zip = typeof input.zip === 'string' ? input.zip.replace(/\D/g, '').slice(0, 5) : '';
  const note = typeof input.note === 'string' ? input.note.trim().slice(0, 300) : '';
  if (address.length < 5 || zip.length !== 5) return null;
  return { address, zip, note };
}
