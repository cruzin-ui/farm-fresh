import { createHmac, randomInt } from 'crypto';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// SERVER-ONLY. Pickup codes live in their own table (order_pickup_codes)
// rather than on the order row, because farmers can read their orders from the
// browser — and the whole point of the code is that the farmer only learns it
// when the buyer hands it over at pickup.

export const MAX_PICKUP_CODE_ATTEMPTS = 5;

function generatePickupCode() {
  return `FFD-${randomInt(100000, 1000000)}`;
}

function signingSecret() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('Server is not configured to create pickup codes.');
  return key;
}

// One checkout can hold items from several farms, and the buyer gets ONE code
// per farm covering everything they bought from it. (If they collect only part
// of it, the rest is given a new code — see replacePickupCode.) The order is recorded by
// two callers at once (the buyer's browser and Stripe's webhook), so the code
// isn't picked at random: it is worked out from the checkout and the farm with
// a secret only the server has. Both callers arrive at the same code, and
// nobody outside can work it out.
export function pickupCodeForFarm(checkoutKey: string, farmerId: string) {
  const digest = createHmac('sha256', signingSecret()).update(`pickup-code:${checkoutKey}:${farmerId}`).digest();
  return `FFD-${100000 + (digest.readUInt32BE(0) % 900000)}`;
}

// The secret in a guest's order link, shared by every item in the checkout so
// one link shows the whole order. Worked out the same way, for the same reason.
export function guestTokenForCheckout(checkoutKey: string) {
  return createHmac('sha256', signingSecret()).update(`guest-order-link:${checkoutKey}`).digest('hex').slice(0, 48);
}

// Compares codes forgivingly: case, spaces, dashes and the "FFD" prefix are
// ignored, so "ffd 123456" and "123456" both match "FFD-123456".
export function normalizePickupCode(code: string) {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^FFD/, '');
}

// Returns the order's code, creating one if it doesn't have one yet. Safe to
// call concurrently — the first insert wins and everyone reads the same code.
// `buyerId` is null for guest orders, which instead get `guestToken`: the
// secret in the link a guest uses to view their order. It is stored here, not
// on the order row, because farmers can read their order rows and the token
// leads to the pickup code. Pass `code` to give the order a particular code
// (the one shared by its farm's items) instead of a random one.
export async function getOrCreatePickupCode(
  orderId: string,
  buyerId: string | null,
  guestToken: string | null = null,
  code: string | null = null
) {
  await supabaseAdmin
    .from('order_pickup_codes')
    .upsert(
      { order_id: orderId, buyer_id: buyerId, code: code || generatePickupCode(), guest_access_token: guestToken },
      { onConflict: 'order_id', ignoreDuplicates: true }
    );

  const { data, error } = await supabaseAdmin
    .from('order_pickup_codes')
    .select('code, guest_access_token')
    .eq('order_id', orderId)
    .single();

  if (error || !data) throw error || new Error('Could not create a pickup code for this order.');

  return { code: data.code as string, guestToken: (data.guest_access_token as string | null) ?? null };
}

export async function getPickupCodeRecord(orderId: string) {
  const { data } = await supabaseAdmin
    .from('order_pickup_codes')
    .select('code, failed_attempts, guest_access_token')
    .eq('order_id', orderId)
    .maybeSingle();

  return data
    ? {
        code: data.code as string,
        failedAttempts: Number(data.failed_attempts ?? 0),
        guestToken: (data.guest_access_token as string | null) ?? null,
      }
    : null;
}

// Gives the items still waiting to be collected a brand-new code. Called after
// a buyer collects only some of what they bought from a farm: the farmer has
// now seen the old code, so it must not work for the rest.
export async function replacePickupCode(orderIds: string[]) {
  const code = generatePickupCode();
  const { error } = await supabaseAdmin
    .from('order_pickup_codes')
    .update({ code, failed_attempts: 0 })
    .in('order_id', orderIds);

  if (error) throw error;
  return code;
}

// `orderIds` is every open item the code covers, so the limit on wrong guesses
// applies to the code as a whole rather than starting again on each item.
export async function recordFailedPickupCodeAttempt(orderIds: string[], failedAttempts: number) {
  await supabaseAdmin
    .from('order_pickup_codes')
    .update({ failed_attempts: failedAttempts + 1 })
    .in('order_id', orderIds);
}
