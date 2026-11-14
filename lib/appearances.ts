import { addDays, formatBoxDate, todayInArizona, weekdayOf, WEEKDAYS } from '@/lib/csaSchedule';

// "Where to find us": the farmers markets, festivals and other places a farm
// will be. Safe to import anywhere.
//
// An appearance is one date, or a repeating one (every week, every other
// week, or once a month, from its first date to its last), at set times in
// Arizona time. A repeating one can skip dates.
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
  // Whether it repeats; repeat_every says how often (see REPEAT_EVERY).
  repeats_weekly: boolean;
  repeat_every?: string | null;
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

// ---------- how a repeating appearance repeats ----------
//
// `repeats_weekly` says it repeats at all (the name is from when weekly was
// the only choice); `repeat_every` says how often:
//   week        every week, on the first date's weekday
//   2weeks      every other week
//   month       once a month, on the same numbered weekday as the first date
//               (the first date is the 2nd Saturday: every 2nd Saturday)
//   month_last  once a month, on the last of the first date's weekday
export const REPEAT_EVERY = ['week', '2weeks', 'month', 'month_last'] as const;
export type RepeatEvery = (typeof REPEAT_EVERY)[number];

type Schedule = Pick<Appearance, 'starts_on' | 'ends_on' | 'repeats_weekly'> & { repeat_every?: string | null };

export const repeatOf = (a: Schedule): RepeatEvery | null =>
  !a.repeats_weekly ? null : (REPEAT_EVERY as readonly string[]).includes(a.repeat_every || '') ? (a.repeat_every as RepeatEvery) : 'week';

const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th'];

// Which of its weekday in the month a date is: 1 for the first Saturday, and
// whether it's also the last one.
export function weekOfMonth(day: string) {
  const date = Number(day.slice(8, 10));
  const n = Math.ceil(date / 7);
  return { n, ordinal: ORDINALS[n - 1], isLast: addDays(day, 7).slice(5, 7) !== day.slice(5, 7) };
}

// The choices for how a post repeats, worded for its first date.
export function repeatChoices(startsOn: string): { value: RepeatEvery | ''; label: string }[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startsOn)) {
    return [
      { value: '', label: "Doesn't repeat" },
      { value: 'week', label: 'Every week' },
      { value: '2weeks', label: 'Every other week' },
      { value: 'month', label: 'Once a month' },
    ];
  }
  const weekday = WEEKDAYS[weekdayOf(startsOn)];
  const { n, ordinal, isLast } = weekOfMonth(startsOn);
  const choices: { value: RepeatEvery | ''; label: string }[] = [
    { value: '', label: "Doesn't repeat" },
    { value: 'week', label: `Every week on ${weekday}` },
    { value: '2weeks', label: `Every other ${weekday}` },
  ];
  // A 5th weekday isn't in every month, so that one is only "the last".
  if (n < 5) choices.push({ value: 'month', label: `Monthly on the ${ordinal} ${weekday}` });
  if (isLast) choices.push({ value: 'month_last', label: `Monthly on the last ${weekday}` });
  return choices;
}

// The weekday `weekday` of a month: the nth one, or the last.
function weekdayInMonth(year: number, month: number, weekday: number, n: number | 'last') {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  if (n === 'last') {
    const last = new Date(Date.UTC(year, month + 1, 0));
    const back = (last.getUTCDay() - weekday + 7) % 7;
    return iso(new Date(Date.UTC(year, month + 1, -back)));
  }
  const first = new Date(Date.UTC(year, month, 1));
  const ahead = (weekday - first.getUTCDay() + 7) % 7;
  return iso(new Date(Date.UTC(year, month, 1 + ahead + (n - 1) * 7)));
}

// The first date on or after `from` that falls on `weekday` (0 is Sunday),
// or for a monthly post, on the nth (or last) such weekday of its month.
export function nextMatchingDate(from: string, weekday: number, monthly?: number | 'last') {
  if (monthly === undefined) {
    let day = from;
    while (weekdayOf(day) !== weekday) day = addDays(day, 1);
    return day;
  }
  const year = Number(from.slice(0, 4));
  const month = Number(from.slice(5, 7)) - 1;
  for (let i = 0; i < 14; i++) {
    const day = weekdayInMonth(year, month + i, weekday, monthly);
    if (day >= from) return day;
  }
  return from;
}

// The i-th date of an appearance (0 is the first date).
function occurrence(a: Schedule, repeat: RepeatEvery, i: number) {
  if (repeat === 'week') return addDays(a.starts_on, 7 * i);
  if (repeat === '2weeks') return addDays(a.starts_on, 14 * i);
  const year = Number(a.starts_on.slice(0, 4));
  const month = Number(a.starts_on.slice(5, 7)) - 1 + i;
  return weekdayInMonth(year, month, weekdayOf(a.starts_on), repeat === 'month_last' ? 'last' : weekOfMonth(a.starts_on).n);
}

// "Every Saturday, 8:00 am – 12:00 pm, until Dec 20" or "Sat, Oct 24, 8:00 am – 12:00 pm".
export function describeSchedule(a: Schedule & Pick<Appearance, 'start_time' | 'end_time'>) {
  const repeat = repeatOf(a);
  if (!repeat) return `${formatBoxDate(a.starts_on)}, ${formatTimes(a)}`;
  const weekday = WEEKDAYS[weekdayOf(a.starts_on)];
  const how = {
    week: `Every ${weekday}`,
    '2weeks': `Every other ${weekday}`,
    month: `The ${weekOfMonth(a.starts_on).ordinal} ${weekday} of each month`,
    month_last: `The last ${weekday} of each month`,
  }[repeat];
  return `${how}, ${formatTimes(a)}, until ${formatBoxDate(a.ends_on)}`;
}

// The dates of an appearance from `from` onwards (inclusive), leaving out
// skipped dates, at most `limit`.
export function appearanceDates(a: Schedule, from: string, limit = 10, skipped: string[] = []) {
  const repeat = repeatOf(a);
  if (!repeat) return a.starts_on >= from && !skipped.includes(a.starts_on) && limit > 0 ? [a.starts_on] : [];
  const dates: string[] = [];
  // A post runs for up to a year, so this is at most about 53 steps.
  for (let i = 0; dates.length < limit; i++) {
    const day = occurrence(a, repeat, i);
    if (day > a.ends_on) break;
    if (day >= from && !skipped.includes(day)) dates.push(day);
  }
  return dates;
}

export function isAppearanceDate(a: Schedule, day: string) {
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
