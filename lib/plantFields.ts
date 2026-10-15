import { PLANTS_CATEGORY, SUN_NEEDS, WATER_NEEDS, POT_SIZE_MAX, stateForZip } from '@/lib/plants';

// SERVER-ONLY. Reads the plant details sent with a listing. They only apply to
// Plants & Seedlings, and are cleared for any other category. "Native" is
// sent as a yes/no; the state it names comes from the farm's pickup zip code,
// never from the browser.
export async function cleanPlantFields(
  fields: Record<string, unknown>,
  category: string,
  farmZip: string | null | undefined
): Promise<{ values: Record<string, string | null> } | { error: string }> {
  if (category !== PLANTS_CATEGORY) {
    return { values: { pot_size: null, sun_needs: null, water_needs: null, native_state: null } };
  }

  const potSize = typeof fields.pot_size === 'string' ? fields.pot_size.trim().slice(0, POT_SIZE_MAX) : '';
  const sun = typeof fields.sun_needs === 'string' && fields.sun_needs in SUN_NEEDS ? fields.sun_needs : null;
  const water = typeof fields.water_needs === 'string' && fields.water_needs in WATER_NEEDS ? fields.water_needs : null;

  let nativeState: string | null = null;
  if (fields.is_native === true) {
    const state = await stateForZip(farmZip);
    if (!state) {
      return {
        error:
          "We couldn't work out your state from your pickup zip code, so the plant can't be marked as native right now. Check the zip code on your Farm Profile, or untick Native and try again.",
      };
    }
    nativeState = state.name;
  }

  return { values: { pot_size: potSize || null, sun_needs: sun, water_needs: water, native_state: nativeState } };
}
