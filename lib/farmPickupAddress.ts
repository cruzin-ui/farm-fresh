import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { geocodeZip } from '@/lib/geo';
import { stateForZip } from '@/lib/plants';

// SERVER-ONLY. A farm's pickup address: entered once on the Farm Profile, and
// used for every listing the farm posts (see db/farm_pickup_address.sql).
//
// The street address stays private, in its own table only the server reads.
// Each listing still carries the public city and zip code (for distances and
// search) and its own private copy of the address, which is what an order
// copies when it is placed. So changing the farm's address moves all of its
// listings, while orders already placed keep the address they were bought at.

export type FarmPickup = { address: string; zip: string; city: string };

export async function getFarmPickup(farmerId: string): Promise<FarmPickup | null> {
  const { data: row } = await supabaseAdmin
    .from('seller_pickup_addresses')
    .select('address')
    .eq('farmer_id', farmerId)
    .maybeSingle();
  if (!row?.address) return null;

  const { data: profile } = await supabaseAdmin
    .from('seller_profiles')
    .select('location, zip_code')
    .eq('id', farmerId)
    .maybeSingle();

  return { address: row.address, zip: String(profile?.zip_code || ''), city: String(profile?.location || '') };
}

// Saves the farm's address and moves its listings to it, except any listing
// the seller gave an address of its own (one that differs from the farm's
// old address), which stays where it is.
export async function saveFarmPickup(farmerId: string, pickup: FarmPickup) {
  const { data: oldRow } = await supabaseAdmin
    .from('seller_pickup_addresses')
    .select('address')
    .eq('farmer_id', farmerId)
    .maybeSingle();
  const { data: ownRows } = await supabaseAdmin
    .from('listing_pickup_addresses')
    .select('listing_id, address')
    .eq('farmer_id', farmerId);
  const keepOwn = oldRow?.address
    ? (ownRows || []).filter((row) => row.address && row.address !== oldRow.address).map((row) => row.listing_id as string)
    : [];

  const { error: addressError } = await supabaseAdmin
    .from('seller_pickup_addresses')
    .upsert({ farmer_id: farmerId, address: pickup.address, updated_at: new Date().toISOString() });
  if (addressError) throw addressError;

  const { error: profileError } = await supabaseAdmin
    .from('seller_profiles')
    .update({ location: pickup.city, zip_code: pickup.zip })
    .eq('id', farmerId);
  if (profileError) throw profileError;

  const coordinates = await geocodeZip(pickup.zip);
  let move = supabaseAdmin
    .from('produce_listings')
    .update({
      location_name: pickup.city,
      zip_code: pickup.zip,
      latitude: coordinates?.latitude ?? null,
      longitude: coordinates?.longitude ?? null,
    })
    .eq('farmer_id', farmerId);
  if (keepOwn.length > 0) move = move.not('id', 'in', `(${keepOwn.join(',')})`);
  const { data: listings, error: listingsError } = await move.select('id');
  if (listingsError) throw listingsError;
  const movedIds = (listings || []).map((l) => l.id as string);

  // Plants marked native are native to wherever the farm is, so they follow
  // it to its new state. (If the state can't be looked up, they keep the old.)
  const state = await stateForZip(pickup.zip);
  if (state && movedIds.length > 0) {
    await supabaseAdmin
      .from('produce_listings')
      .update({ native_state: state.name })
      .in('id', movedIds)
      .not('native_state', 'is', null);
  }

  const copies = movedIds.map((id) => ({ listing_id: id, farmer_id: farmerId, address: pickup.address }));
  if (copies.length > 0) {
    const { error: copyError } = await supabaseAdmin
      .from('listing_pickup_addresses')
      .upsert(copies, { onConflict: 'listing_id' });
    if (copyError) throw copyError;
  }

  return { listingsMoved: copies.length, listingsKept: keepOwn.length, coordinates };
}
