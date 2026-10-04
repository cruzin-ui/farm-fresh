import { supabaseAdmin } from '@/lib/supabaseAdmin';

// SERVER-ONLY. Rules that keep one farmer from crowding Browse: no two
// listings on sale for the same crop and variety, and a cap on how many
// listings a farmer can have on sale at once. "On sale" means it has stock —
// sold-out and taken-down listings don't count.

export const MAX_ACTIVE_LISTINGS = 25;
export const MAX_LISTING_TAGS = 3;

function normalize(text: string | null | undefined) {
  return (text || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// Checks whether a farmer may put a listing with this crop name and variety on
// sale. Pass `excludeListingId` when the listing already exists (an edit), so
// it isn't compared against itself. Returns an error message, or null if fine.
export async function checkListingAllowed(params: {
  farmerId: string;
  title: string;
  variety: string | null;
  excludeListingId?: string;
  enforceCap: boolean;
}) {
  const { farmerId, title, variety, excludeListingId, enforceCap } = params;

  const { data: activeListings, error } = await supabaseAdmin
    .from('produce_listings')
    .select('id, title, variety')
    .eq('farmer_id', farmerId)
    .gt('available_quantity', 0);

  if (error) throw error;

  const others = (activeListings || []).filter((l) => l.id !== excludeListingId);

  const duplicate = others.find(
    (l) => normalize(l.title) === normalize(title) && normalize(l.variety) === normalize(variety)
  );

  if (duplicate) {
    const name = variety ? `${title} (${variety})` : title;
    return `You already have a listing on sale for ${name}. Edit that listing to change its quantity or price instead of posting it again.`;
  }

  if (enforceCap && others.length >= MAX_ACTIVE_LISTINGS) {
    return `You can have up to ${MAX_ACTIVE_LISTINGS} listings on sale at once. Take one down or let one sell out before adding another.`;
  }

  return null;
}
