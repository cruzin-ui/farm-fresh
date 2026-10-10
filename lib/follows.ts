import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { LISTING_CATEGORIES } from '@/lib/categories';
import { describeUsualPickup } from '@/lib/pickupRules';

// SERVER-ONLY. "Follow a farm": a signed-in shopper keeps a list of farms they
// like, and sees what each one has for sale on their Favorite Farms page. No
// emails are sent — the page is where they look.

// How many of each farm's listings the Favorite Farms page shows.
const LISTINGS_PER_FARM = 6;

export async function followFarm(farmerId: string, userId: string) {
  const { error } = await supabaseAdmin
    .from('farm_follows')
    .upsert({ farmer_id: farmerId, user_id: userId }, { onConflict: 'farmer_id,user_id', ignoreDuplicates: true });
  if (error) throw error;
}

export async function unfollowFarm(farmerId: string, userId: string) {
  const { error } = await supabaseAdmin.from('farm_follows').delete().eq('farmer_id', farmerId).eq('user_id', userId);
  if (error) throw error;
}

export async function isFollowing(farmerId: string, userId: string) {
  const { data } = await supabaseAdmin
    .from('farm_follows')
    .select('id')
    .eq('farmer_id', farmerId)
    .eq('user_id', userId)
    .maybeSingle();
  return Boolean(data);
}

// The farms a shopper follows, most recently followed first, each with what
// it currently has for sale (newest first).
export async function listFollowedFarms(userId: string) {
  const { data: follows, error } = await supabaseAdmin
    .from('farm_follows')
    .select('farmer_id, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;

  const farmerIds = (follows || []).map((follow) => follow.farmer_id as string);
  if (farmerIds.length === 0) return [];

  const { data: farms } = await supabaseAdmin
    .from('seller_profiles')
    .select('id, farm_name, avatar_url, location, pickup_days, pickup_times, stripe_onboarding_complete')
    .in('id', farmerIds);
  const farmById = new Map((farms || []).map((farm) => [farm.id as string, farm]));

  const { data: listings } = await supabaseAdmin
    .from('produce_listings')
    .select('id, farmer_id, title, variety, price_per_unit, unit_type, image_url, available_quantity, created_at')
    .in('farmer_id', farmerIds)
    .gte('available_quantity', 1)
    .in('category', LISTING_CATEGORIES)
    .order('created_at', { ascending: false });

  return (follows || [])
    .map((follow) => {
      const farm = farmById.get(follow.farmer_id as string);
      if (!farm) return null;

      // Nothing counts as for sale until the farmer has finished payout setup.
      const forSale = farm.stripe_onboarding_complete
        ? (listings || []).filter((listing) => listing.farmer_id === farm.id)
        : [];
      return {
        id: farm.id as string,
        farm_name: (farm.farm_name as string) || 'Local Farm',
        avatar_url: (farm.avatar_url as string | null) || null,
        location: (farm.location as string | null) || '',
        usual_pickup: describeUsualPickup(farm.pickup_days, farm.pickup_times) || '',
        followed_at: follow.created_at as string,
        listing_count: forSale.length,
        listings: forSale.slice(0, LISTINGS_PER_FARM).map((listing) => ({
          id: listing.id as string,
          title: listing.title as string,
          variety: (listing.variety as string | null) || null,
          price_per_unit: Number(listing.price_per_unit ?? 0),
          unit_type: (listing.unit_type as string) || 'units',
          image_url: (listing.image_url as string | null) || null,
          available_quantity: Number(listing.available_quantity ?? 0),
          created_at: listing.created_at as string,
        })),
      };
    })
    .filter((farm): farm is NonNullable<typeof farm> => farm !== null);
}
