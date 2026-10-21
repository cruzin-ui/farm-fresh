import { addDays, todayInArizona } from '@/lib/csaSchedule';

// "What we're growing": crops a farm has in the ground, and roughly when each
// should be ready. Safe to import anywhere.
//
// A crop shows on the farm page until a few weeks after its expected window
// (GRACE_DAYS), so an old guess doesn't linger, and stops showing once the
// farm posts a listing with the same name.

export const MAX_GROWING = 30;
export const GRACE_DAYS = 21;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// "early November", "mid-November", "late November".
export function roughDate(day: string) {
  const [, m, d] = day.split('-').map(Number);
  const part = d <= 10 ? 'early' : d <= 20 ? 'mid-' : 'late';
  return part === 'mid-' ? `mid-${MONTHS[m - 1]}` : `${part} ${MONTHS[m - 1]}`;
}

// When buyers can expect it, in words.
export function describeExpected(from: string, until: string | null | undefined, today: string = todayInArizona()) {
  const end = until || from;
  if (end < today) return 'Should be ready now';
  if (from <= today) return until ? `Ready now, until about ${roughDate(until)}` : 'Ready any day now';
  if (from <= addDays(today, 7)) return 'Expected within a week';
  if (!until || roughDate(until) === roughDate(from)) return `Expected ${roughDate(from)}`;
  return `Expected ${roughDate(from)} to ${roughDate(until)}`;
}

// Whether a crop still shows on the farm page.
export function stillShown(crop: { expected_from: string; expected_until?: string | null; status: string }, today: string = todayInArizona()) {
  return crop.status === 'growing' && addDays(crop.expected_until || crop.expected_from, GRACE_DAYS) >= today;
}
