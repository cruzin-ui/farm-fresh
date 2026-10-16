import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { geocodeZip } from '@/lib/geo';
import { saveListingPickupAddress } from '@/lib/listingRules';
import type { FarmPickup } from '@/lib/farmPickupAddress';

// SERVER-ONLY. A listing picked up somewhere other than the farm's own
// address (set on the Farm Profile). Most listings use the farm's address; a
// seller can give one listing its own, say a market stall or a second plot.
// A listing whose address differs from the farm's is left where it is when
// the farm's address changes (see saveFarmPickup).

// Reads a pickup address sent by the browser. Returns null when none was sent.
export function readPickupInput(raw: unknown): { pickup: FarmPickup } | { error: string } | null {
  if (!raw || typeof raw !== 'object') return null;
  const input = raw as Record<string, unknown>;
  const address = typeof input.address === 'string' ? input.address.trim().slice(0, 300) : '';
  const zip = typeof input.zip === 'string' ? input.zip.replace(/\D/g, '').slice(0, 5) : '';
  const city = typeof input.city === 'string' ? input.city.trim().slice(0, 100) : '';
  if (!address) return { error: 'Enter the pickup address for this listing.' };
  if (zip.length !== 5) return { error: 'Enter the 5-digit zip code for this listing’s pickup address.' };
  if (!city) return { error: 'Enter the city for this listing’s pickup address.' };
  return { pickup: { address, zip, city } };
}

// The public part of a pickup address, for the listing row: its city, zip
// code and map position (the street address stays private).
export async function publicPlace(pickup: FarmPickup) {
  const coordinates = await geocodeZip(pickup.zip);
  return {
    location_name: pickup.city,
    zip_code: pickup.zip,
    latitude: coordinates?.latitude ?? null,
    longitude: coordinates?.longitude ?? null,
  };
}

// Moves one listing to a pickup address.
export async function setListingPickup(listingId: string, farmerId: string, pickup: FarmPickup) {
  const { error } = await supabaseAdmin.from('produce_listings').update(await publicPlace(pickup)).eq('id', listingId);
  if (error) throw error;
  await saveListingPickupAddress(listingId, farmerId, pickup.address);
}
