import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { COTTAGE_FOOD_CATEGORIES, isCottageFood } from '@/lib/categories';

// SERVER-ONLY. Cottage food registrations: a farm's Arizona cottage food
// registration number and certificate, which it needs to list jams,
// preserves and baked goods. Kept in a server-only table
// (cottage_food_registrations) with the certificate in private storage; the
// number is also copied to the public farm profile for buyers to see.

export const COTTAGE_CERTIFICATE_BUCKET = 'cottage-food-certificates';

// The farm's registration, or null if it hasn't one.
export async function cottageRegistrationFor(farmerId: string) {
  const { data } = await supabaseAdmin
    .from('cottage_food_registrations')
    .select('reg_number, submitted_at')
    .eq('farmer_id', farmerId)
    .maybeSingle();
  return data ? { regNumber: data.reg_number as string, submittedAt: data.submitted_at as string } : null;
}

// Whether a seller may list something in a cottage food category. Returns
// the reason they can't, or null when they can (or the category isn't a
// cottage food).
export async function cottageFoodProblem(farmerId: string, category: string | null | undefined) {
  if (!isCottageFood(category)) return null;
  if (!(await cottageRegistrationFor(farmerId))) {
    return 'To list jams, preserves or baked goods, add your Arizona cottage food registration number and certificate in Farm Profile & Photo first.';
  }
  return null;
}

// Takes a farm's cottage food listings off sale (available quantity 0, which
// hides them, as a seller taking a listing down does). Their past orders are
// untouched. Returns how many were on sale.
export async function takeDownCottageListings(farmerId: string) {
  const { data, error } = await supabaseAdmin
    .from('produce_listings')
    .update({ available_quantity: 0 })
    .eq('farmer_id', farmerId)
    .in('category', COTTAGE_FOOD_CATEGORIES)
    .gt('available_quantity', 0)
    .select('id');
  if (error) throw error;
  return (data || []).length;
}

// Removes a farm's registration: the record, the certificate file, the
// number on its profile, and its cottage food listings from sale.
export async function removeCottageRegistration(farmerId: string) {
  const { data: existing } = await supabaseAdmin
    .from('cottage_food_registrations')
    .select('file_path')
    .eq('farmer_id', farmerId)
    .maybeSingle();
  const takenDown = await takeDownCottageListings(farmerId);
  await supabaseAdmin.from('cottage_food_registrations').delete().eq('farmer_id', farmerId);
  await supabaseAdmin.from('seller_profiles').update({ cottage_food_reg: null }).eq('id', farmerId);
  if (existing?.file_path) {
    await supabaseAdmin.storage.from(COTTAGE_CERTIFICATE_BUCKET).remove([existing.file_path]);
  }
  return takenDown;
}
