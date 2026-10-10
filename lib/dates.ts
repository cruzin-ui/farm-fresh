// Turns a listing's stored date ("2026-10-12") into one that reads naturally
// ("Oct 12"), adding the year only when it isn't this year. The parts are read
// directly so the day doesn't shift with the viewer's time zone.
export function friendlyDate(value: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value || '');
  if (!match) return value || '';

  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}
