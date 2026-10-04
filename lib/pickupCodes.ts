import { randomInt } from 'crypto';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// SERVER-ONLY. Pickup codes live in their own table (order_pickup_codes)
// rather than on the order row, because farmers can read their orders from the
// browser — and the whole point of the code is that the farmer only learns it
// when the buyer hands it over at pickup.

export const MAX_PICKUP_CODE_ATTEMPTS = 5;

function generatePickupCode() {
  return `FFD-${randomInt(100000, 1000000)}`;
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
// leads to the pickup code.
export async function getOrCreatePickupCode(orderId: string, buyerId: string | null, guestToken: string | null = null) {
  await supabaseAdmin
    .from('order_pickup_codes')
    .upsert(
      { order_id: orderId, buyer_id: buyerId, code: generatePickupCode(), guest_access_token: guestToken },
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

export async function recordFailedPickupCodeAttempt(orderId: string, failedAttempts: number) {
  await supabaseAdmin
    .from('order_pickup_codes')
    .update({ failed_attempts: failedAttempts + 1 })
    .eq('order_id', orderId);
}
