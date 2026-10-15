// CSA farm shares: the calendar every part of the site works to. Safe to
// import anywhere.
//
// A plan has a pickup day (say, Thursday) and runs weekly or every other week
// through its season. For each pickup date:
//
// - REMINDER_DAYS_BEFORE: members are emailed what is coming and what it
//   will cost, with a link to skip.
// - CHARGE_DAYS_BEFORE: the box is charged to the member's saved card and
//   becomes an ordinary order. If the card is declined it is tried again the
//   next day; after that the week is missed.
// - Up to the charge, a member can skip the week, pause or cancel for free.
//   Once charged, the box follows the usual cancellation policy, like any order.
//
// Dates are plain calendar days ("2026-10-16") in Arizona time, the site's
// time zone, worked out without the viewer's own time zone getting involved.

export const CSA_BOX_CATEGORY = 'CSA Box';
export const CHARGE_DAYS_BEFORE = 2;
export const REMINDER_DAYS_BEFORE = 3;

// Changes whenever the wording members agree to changes, so each membership
// records which version its member saw.
export const CSA_TERMS_VERSION = '2026-10-14';

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export type CsaFrequency = 'weekly' | 'biweekly';

export type CsaSchedule = {
  pickup_weekday: number;
  frequency: CsaFrequency | string;
  season_start: string;
  season_end: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function toTime(day: string) {
  return Date.parse(`${day.slice(0, 10)}T00:00:00Z`);
}

function fromTime(time: number) {
  return new Date(time).toISOString().slice(0, 10);
}

export function isDay(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(toTime(value));
}

export function addDays(day: string, days: number) {
  return fromTime(toTime(day) + days * DAY_MS);
}

export function weekdayOf(day: string) {
  return new Date(toTime(day)).getUTCDay();
}

// Today's date in Arizona.
export function todayInArizona(now: Date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Phoenix' }).format(now);
}

// "Thu, Oct 16", with the year only when it isn't this year.
export function formatBoxDate(day: string, options: { long?: boolean } = {}) {
  const date = new Date(toTime(day));
  const sameYear = date.getUTCFullYear() === new Date().getUTCFullYear();
  return date.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    weekday: options.long ? 'long' : 'short',
    month: options.long ? 'long' : 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

// "Every Thursday" or "Every other Thursday".
export function describeFrequency(plan: Pick<CsaSchedule, 'pickup_weekday' | 'frequency'>) {
  const day = WEEKDAYS[plan.pickup_weekday] || 'week';
  return plan.frequency === 'biweekly' ? `Every other ${day}` : `Every ${day}`;
}

// The plan's pickup dates from `from` onwards (inclusive), at most `limit` of
// them. Every-other-week plans count their fortnights from the first pickup
// day of the season, so the dates never shift.
export function boxDates(plan: CsaSchedule, from: string, limit = 60) {
  const dates: string[] = [];
  if (!isDay(plan.season_start) || !isDay(plan.season_end)) return dates;

  const step = plan.frequency === 'biweekly' ? 14 : 7;
  let first = plan.season_start;
  while (weekdayOf(first) !== Number(plan.pickup_weekday)) first = addDays(first, 1);

  let day = first;
  if (from > day) {
    const steps = Math.ceil((toTime(from) - toTime(day)) / (step * DAY_MS));
    day = addDays(day, steps * step);
  }
  while (day <= plan.season_end && dates.length < limit) {
    dates.push(day);
    day = addDays(day, step);
  }
  return dates;
}

export function isBoxDate(plan: CsaSchedule, day: string) {
  return isDay(day) && boxDates(plan, day, 1)[0] === day;
}

export const chargeDateFor = (boxDate: string) => addDays(boxDate, -CHARGE_DAYS_BEFORE);
export const reminderDateFor = (boxDate: string) => addDays(boxDate, -REMINDER_DAYS_BEFORE);

// True while a member can still skip this date (or change their mind): up to
// the day it is charged.
export function canStillSkip(boxDate: string, today: string = todayInArizona()) {
  return today < chargeDateFor(boxDate);
}

// The first box someone joining today would get: the first pickup date that
// hasn't been charged for yet.
export function firstBoxForNewMember(plan: CsaSchedule, today: string = todayInArizona()) {
  return boxDates(plan, addDays(today, CHARGE_DAYS_BEFORE), 1)[0] || null;
}

// True when a member who joined at `joinedAt` gets the box on this date:
// only boxes charged on or after the day they joined.
export function memberGetsBox(joinedAt: string, boxDate: string) {
  return chargeDateFor(boxDate) >= todayInArizona(new Date(joinedAt));
}

// How many boxes are left in the season from a date, for "about 12 boxes".
export function boxesLeft(plan: CsaSchedule, from: string) {
  return boxDates(plan, from, 400).length;
}
