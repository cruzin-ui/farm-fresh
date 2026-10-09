import { createHmac } from 'crypto';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { TURNSTILE_CHECKOUT_ACTION } from '@/lib/turnstile';

// SERVER-ONLY. Two defences against "card testing": fraudsters running lists
// of stolen card numbers through a checkout to see which ones work, which
// costs the site fees and disputes.
//
// 1. A CAPTCHA (Cloudflare Turnstile) proves a person, not a script, is at the
//    checkout. It is only enforced once the widget's secret key is configured
//    (TURNSTILE_SECRET_KEY), so the checkout keeps working until then.
// 2. A limit on how many payments one visitor can start in a short time.

// How many payments one visitor (by IP address) may start.
const MAX_ATTEMPTS_PER_15_MINUTES = 6;
const MAX_ATTEMPTS_PER_DAY = 20;

export const CAPTCHA_ENABLED = Boolean(process.env.TURNSTILE_SECRET_KEY);

// "www.example.com" and "example.com" count as the same site.
const bareHost = (hostname: string) => hostname.toLowerCase().replace(/^www\./, '');

// The visitor's IP address as the host reports it.
export function requestIp(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for') || '';
  return forwarded.split(',')[0].trim() || request.headers.get('x-real-ip') || 'unknown';
}

// Attempts are recorded against a scrambled form of the IP address, so the
// table never holds the address itself.
function hashIp(ip: string) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || 'farm-fresh-direct';
  return createHmac('sha256', key).update(`checkout-attempt:${ip}`).digest('hex').slice(0, 32);
}

// Returns true if the CAPTCHA proof the browser sent is genuine: Cloudflare
// confirms it, it was issued for the checkout, and it was issued on this
// site (`siteHostname`) rather than lifted from somewhere else. Each proof can
// only be redeemed once. With the CAPTCHA not configured, everything passes.
export async function verifyCaptcha(token: string, ip: string, siteHostname: string) {
  if (!CAPTCHA_ENABLED) return true;
  if (!token) return false;

  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        secret: process.env.TURNSTILE_SECRET_KEY!,
        response: token,
        ...(ip !== 'unknown' ? { remoteip: ip } : {}),
      }),
    });
    const data = await res.json();
    if (data.success !== true) return false;
    if (data.action && data.action !== TURNSTILE_CHECKOUT_ACTION) return false;
    if (data.hostname && bareHost(String(data.hostname)) !== bareHost(siteHostname)) return false;
    return true;
  } catch (err) {
    // If the CAPTCHA service itself is down, let real buyers through; the
    // attempt limit below still applies.
    console.error('CAPTCHA check could not be completed:', err);
    return true;
  }
}

// Counts this visitor's recent payment attempts and records this one. Returns
// false once they are over the limit. If the record can't be read or written,
// the buyer is let through rather than blocked by a fault on our side.
export async function allowCheckoutAttempt(ip: string, email: string) {
  try {
    const ipHash = hashIp(ip);
    const now = Date.now();
    const dayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    const quarterHourAgo = now - 15 * 60 * 1000;

    const { data: recent, error } = await supabaseAdmin
      .from('checkout_attempts')
      .select('created_at')
      .eq('ip_hash', ipHash)
      .gte('created_at', dayAgo)
      .limit(MAX_ATTEMPTS_PER_DAY + 1);

    if (error) throw error;

    const lastQuarterHour = (recent || []).filter((row) => new Date(row.created_at).getTime() >= quarterHourAgo);
    if ((recent || []).length >= MAX_ATTEMPTS_PER_DAY || lastQuarterHour.length >= MAX_ATTEMPTS_PER_15_MINUTES) {
      return false;
    }

    await supabaseAdmin.from('checkout_attempts').insert([{ ip_hash: ipHash, email: email || null }]);
    return true;
  } catch (err) {
    console.error('Checkout attempt limit could not be checked:', err);
    return true;
  }
}

// Clears out old records. Called by the daily job.
export async function clearOldCheckoutAttempts() {
  const cutoff = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  await supabaseAdmin.from('checkout_attempts').delete().lt('created_at', cutoff);
}
