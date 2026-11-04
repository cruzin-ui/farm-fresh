// Wholesale: listings offered by the case to approved businesses. Safe to
// import anywhere; the server-only parts are in lib/wholesaleServer.ts.

// The buyer fee on wholesale items: a lower percentage than retail, with no
// fixed part, capped per checkout. The farm's seller fee is the same as for
// retail.
export const WHOLESALE_FEE_RATE = 0.03;
export const WHOLESALE_FEE_CAP_CENTS = 2500;
export const WHOLESALE_FEE_LABEL = `${WHOLESALE_FEE_RATE * 100}%, max $${WHOLESALE_FEE_CAP_CENTS / 100}`;

export const BUSINESS_TYPES = ['Restaurant', 'Grocer', 'Co-op', 'Caterer', 'Florist', 'Other'];

// A certificate is emailed about this many days before it expires.
export const CERTIFICATE_REMINDER_DAYS = 30;

// The largest certificate file accepted (the host refuses uploads over about
// 4.5 MB; photos are shrunk in the browser first), and the kinds of file.
export const CERTIFICATE_MAX_BYTES = 4 * 1024 * 1024;
export const CERTIFICATE_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
  'image/webp': 'webp',
};

export type WholesaleOffer = { caseSize: number; casePrice: number; minCases: number };

// "case of 20 lbs".
export const caseLabel = (caseSize: number, unitType: string) => `case of ${caseSize} ${unitType}`;

// "2 cases (40 lbs)", for an order bought wholesale.
export const casesText = (cases: number, caseSize: number, unitType: string) =>
  `${cases} case${cases === 1 ? '' : 's'} (${cases * caseSize} ${unitType})`;

// Reads a seller's wholesale offer from a listing form. Returns null when the
// listing isn't offered wholesale, or an error to show.
export function readWholesaleOffer(raw: unknown): { offer: WholesaleOffer | null } | { error: string } {
  if (!raw || typeof raw !== 'object') return { offer: null };
  const input = raw as Record<string, unknown>;
  if (input.enabled !== true) return { offer: null };

  const caseSize = Number(input.caseSize);
  const casePrice = Math.round(Number(input.casePrice) * 100) / 100;
  const minCases = input.minCases === '' || input.minCases == null ? 1 : Number(input.minCases);

  if (!Number.isInteger(caseSize) || caseSize < 2 || caseSize > 10000) {
    return { error: 'For wholesale, enter the case size as a whole number of at least 2.' };
  }
  if (!Number.isFinite(casePrice) || casePrice <= 0 || casePrice > 100000) {
    return { error: 'For wholesale, enter a case price.' };
  }
  if (!Number.isInteger(minCases) || minCases < 1 || minCases > 1000) {
    return { error: 'For wholesale, enter the minimum order as a whole number of cases (at least 1).' };
  }
  return { offer: { caseSize, casePrice, minCases } };
}

// The status a business sees about its wholesale account, as returned by
// /api/wholesale/account.
export type WholesaleStatus = {
  account: {
    businessName: string;
    businessType: string;
    businessAddress: string;
    phone: string;
    status: 'pending' | 'approved' | 'declined';
    declineReason: string | null;
  } | null;
  // The newest certificate, if any.
  certificate: {
    expiresOn: string;
    status: 'pending' | 'approved' | 'declined' | 'replaced';
    declineReason: string | null;
    uploadedAt: string;
  } | null;
  // True when wholesale purchases are tax-exempt today.
  taxExempt: boolean;
  // The date the exemption runs until, when it applies.
  exemptUntil: string | null;
};

// Today in Arizona, as yyyy-mm-dd. Certificates are good through their
// expiration date.
export function arizonaToday(now: Date = new Date()) {
  return new Date(now.getTime() - 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// "Mar 31, 2027" from yyyy-mm-dd.
export function formatDay(day: string) {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}
