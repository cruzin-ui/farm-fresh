// Plants & Seedlings: the category and the plant details on its listings.
// Safe to import anywhere.

export const PLANTS_CATEGORY = 'Plants & Seedlings';

export const SUN_NEEDS = {
  full_sun: 'Full sun',
  part_sun: 'Part sun',
  shade: 'Shade',
} as const;

export const WATER_NEEDS = {
  low: 'Low water',
  moderate: 'Moderate water',
  high: 'High water',
} as const;

export type SunNeeds = keyof typeof SUN_NEEDS;
export type WaterNeeds = keyof typeof WATER_NEEDS;

export const POT_SIZE_MAX = 40;

// The plant details a listing can carry (all optional).
export type PlantDetails = {
  pot_size?: string | null;
  sun_needs?: SunNeeds | string | null;
  water_needs?: WaterNeeds | string | null;
  // The state the plant is native to, e.g. "Arizona", or empty if it isn't.
  native_state?: string | null;
};

// The plant details as short labels for cards and listing pages, e.g.
// ["4-inch pot", "Full sun", "Low water"]. The native label is separate.
export function plantDetailLabels(listing: PlantDetails) {
  const labels: string[] = [];
  if (listing.pot_size) labels.push(listing.pot_size);
  if (listing.sun_needs && listing.sun_needs in SUN_NEEDS) labels.push(SUN_NEEDS[listing.sun_needs as SunNeeds]);
  if (listing.water_needs && listing.water_needs in WATER_NEEDS) labels.push(WATER_NEEDS[listing.water_needs as WaterNeeds]);
  return labels;
}

export function nativeLabel(listing: PlantDetails) {
  return listing.native_state ? `Native to ${listing.native_state}` : '';
}

// The state a US zip code is in, e.g. { name: "Arizona", code: "AZ" }, or null
// when it can't be found or the lookup service can't be reached.
export async function stateForZip(zip: string | null | undefined): Promise<{ name: string; code: string } | null> {
  const cleaned = (zip || '').trim().slice(0, 5);
  if (!/^\d{5}$/.test(cleaned)) return null;
  try {
    const res = await fetch(`https://api.zippopotam.us/us/${cleaned}`);
    if (!res.ok) return null;
    const place = (await res.json()).places?.[0];
    const name = String(place?.state || '').trim();
    const code = String(place?.['state abbreviation'] || '').trim();
    return name ? { name, code } : null;
  } catch {
    return null;
  }
}
