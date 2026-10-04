import { createHmac, timingSafeEqual } from 'crypto';

// SERVER-ONLY. The "this isn't right" link in a buyer's no-show email has to
// work without signing in (and for guests), so it carries a signature instead:
// an HMAC of the order id that only the server can produce. Holding a valid
// link proves it came from that order's email.
function secret() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('Server is not configured to sign no-show links.');
  return key;
}

export function signNoShowDispute(orderId: string) {
  return createHmac('sha256', secret()).update(`no-show-dispute:${orderId}`).digest('hex');
}

export function verifyNoShowDispute(orderId: string, signature: string) {
  const expected = Buffer.from(signNoShowDispute(orderId));
  const given = Buffer.from(signature || '');
  return expected.length === given.length && timingSafeEqual(expected, given);
}
