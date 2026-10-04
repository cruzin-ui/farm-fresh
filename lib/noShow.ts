// How long a buyer has to respond to a farmer's no-show report before the
// order is closed as a no-show automatically. Safe to import anywhere.
export const NO_SHOW_REVIEW_HOURS = 48;

// When a report made at `reportedAt` becomes eligible to be closed automatically.
export function noShowAutoApproveAt(reportedAt: string | Date) {
  return new Date(new Date(reportedAt).getTime() + NO_SHOW_REVIEW_HOURS * 60 * 60 * 1000);
}
