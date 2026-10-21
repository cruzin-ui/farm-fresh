import { addDays, formatBoxDate, todayInArizona, weekdayOf, WEEKDAYS } from '@/lib/csaSchedule';

// "Where to find us": the farmers markets, festivals and other places a farm
// will be. Safe to import anywhere.
//
// An appearance is one date, or a weekly one (same weekday from its first date
// to its last), at set times in Arizona time. A weekly one can skip dates.
// When it takes orders, buyers can order ahead at checkout and pick up there;
// ordering for a date closes at ORDER_CUTOFF_HOUR the evening before.

export const APPEARANCE_KINDS = {
  market: 'Farmers market',
  festival: 'Festival or fair',
  popup: 'Pop-up stand',
  open_farm: 'Open farm day',
  other: 'Other event',
} as const;
export type AppearanceKind = keyof typeof APPEARANCE_KINDS;

// A farm can have this many appearances running at once.
export const MAX_ACTIVE_APPEARANCES = 20;
// Ordering ahead for a date closes at this hour (Arizona time) the day before.
export const ORDER_CUTOFF_HOUR = 18;
// Buyers can order ahead for dates up to this many days away.
export const ORDER_AHEAD_DAYS = 30;
// A weekly appearance can run at most this long.
export const MAX_WEEKLY_DAYS = 366;

export type Appearance = {
  id: string;
  farmer_id: string;
  kind: string;
  name: string;
  address: string;
  city: string;
  zip: string;
  starts_on: string;
  repeats_weekly: boolean;
  ends_on: string;
  start_time: string;
  end_time: string;
  note: string;
  takes_orders: boolean;
  status: string;
};

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
export const isTime = (value: unknown): value is string => typeof value === 'string' && TIME.test(value);

// "8:00 am", "12:30 pm".
export function formatTime(time: string) {
  const [h, m] = time.split(':').map(Number);
  const suffix = h >= 12 ? 'pm' : 'am';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
}

export const formatTimes = (a: Pick<Appearance, 'start_time' | 'end_time'>) => `${formatTime(a.start_time)} – ${formatTime(a.end_time)}`;

// "Every Saturday, 8:00 am – 12:00 pm, until Dec 20" or "Sat, Oct 24, 8:00 am – 12:00 pm".
export function describeSchedule(a: Pick<Appearance, 'starts_on' | 'ends_on' | 'repeats_weekly' | 'start_time' | 'end_time'>) {
  return a.repeats_weekly
    ? `Every ${WEEKDAYS[weekdayOf(a.starts_on)]}, ${formatTimes(a)}, until ${formatBoxDate(a.ends_on)}`
    : `${formatBoxDate(a.starts_on)}, ${formatTimes(a)}`;
}

// The dates of an appearance from `from` onwards (inclusive), leaving out
// skipped dates, at most `limit`.
export function appearanceDates(a: Pick<Appearance, 'starts_on' | 'ends_on' | 'repeats_weekly'>, from: string, limit = 10, skipped: string[] = []) {
  const dates: string[] = [];
  const step = a.repeats_weekly ? 7 : 366 * 10;
  let day = a.starts_on;
  while (day < from) day = addDays(day, step);
  while (day <= a.ends_on && dates.length < limit) {
    if (!skipped.includes(day)) dates.push(day);
    if (!a.repeats_weekly) break;
    day = addDays(day, 7);
  }
  return dates;
}

export function isAppearanceDate(a: Pick<Appearance, 'starts_on' | 'ends_on' | 'repeats_weekly'>, day: string) {
  return appearanceDates(a, day, 1)[0] === day;
}

// When a date's appearance starts and ends, as moments in time.
export const appearanceStart = (a: Pick<Appearance, 'start_time'>, date: string) => new Date(`${date}T${a.start_time}:00-07:00`);
export const appearanceEnd = (a: Pick<Appearance, 'end_time'>, date: string) => new Date(`${date}T${a.end_time}:00-07:00`);

// The last moment to order ahead for a date: the evening before.
export const orderCutoff = (date: string) => new Date(`${addDays(date, -1)}T${String(ORDER_CUTOFF_HOUR).padStart(2, '0')}:00:00-07:00`);

// The dates buyers can still order ahead for, soonest first.
export function orderableDates(a: Appearance, skipped: string[] = [], now: Date = new Date()) {
  if (!a.takes_orders || a.status !== 'active') return [];
  const today = todayInArizona(now);
  return appearanceDates(a, today, 10, skipped).filter(
    (date) => now < orderCutoff(date) && date <= addDays(today, ORDER_AHEAD_DAYS)
  );
}

// The place, in one line: "Downtown Phoenix Farmers Market, 721 N Central Ave, Phoenix".
export const placeLine = (a: Pick<Appearance, 'name' | 'address'>) => `${a.name}, ${a.address}`;

// How a market pickup reads on an order: the place and the date and time.
export const pickupLabel = (a: Appearance, date: string) =>
  `${placeLine(a)} · ${formatBoxDate(date)}, ${formatTimes(a)}`;

// The choice a buyer makes at checkout: "appearanceId@2026-10-24".
export const marketKey = (appearanceId: string, date: string) => `${appearanceId}@${date}`;
export function parseMarketKey(value: unknown) {
  const match = typeof value === 'string' ? value.match(/^([0-9a-f-]{36})@(\d{4}-\d{2}-\d{2})$/i) : null;
  return match ? { appearanceId: match[1], date: match[2] } : null;
}

// Google Maps for the place.
export const mapsLink = (a: Pick<Appearance, 'name' | 'address'>) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(placeLine(a))}`;
