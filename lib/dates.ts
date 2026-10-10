import { SELLER_READY_DAYS } from '@/lib/pickupRules';

// A listing's stored date ("2026-10-12") as a local calendar day. The parts
// are read directly so the day doesn't shift with the viewer's time zone.
function parseDay(value: string | null | undefined): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value || '');
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
}

function formatDay(date: Date) {
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

// Turns a stored date into one that reads naturally ("Oct 12"), adding the
// year only when it isn't this year.
export function friendlyDate(value: string | null | undefined): string {
  const date = parseDay(value);
  return date ? formatDay(date) : value || '';
}

// What a shopper wants to know about a listing's harvest date: can I have it
// now, or when will it be ready? A crop still growing is ready for pickup
// within the seller's SELLER_READY_DAYS of its harvest date.
export function pickupAvailability(harvestReadyDate: string | null | undefined): {
  availableNow: boolean;
  // "Available now" or "Ready for pickup by Oct 18".
  label: string;
} {
  const harvest = parseDay(harvestReadyDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (!harvest || harvest.getTime() <= today.getTime()) {
    return { availableNow: true, label: 'Available now' };
  }

  const readyBy = new Date(harvest);
  readyBy.setDate(readyBy.getDate() + SELLER_READY_DAYS);
  return { availableNow: false, label: `Ready for pickup by ${formatDay(readyBy)}` };
}
