import type { User } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { stripeAdmin } from '@/lib/stripeAdmin';
import { cancelMembership, liveMembersOf, type CsaMember, type CsaPlan } from '@/lib/csa';
import { partnerLeaves } from '@/lib/sharedBoxes';

// SERVER-ONLY. Deleting a user's own account, which they can do from the
// Account Settings page (and which the app stores require).
//
// What goes: their sign-in, their profile picture, their favorite farms, and,
// for a seller, their farm page details, web address and anything on sale.
// What stays: the record of orders already placed, which the other side of
// each sale and our accounts and taxes depend on. Those orders are detached
// from the account. A seller's Stripe account isn't touched, so money still
// owed to them reaches their bank; they can close it with Stripe themselves.

const OPEN_STATUSES = ['pending_pickup', 'ready_for_pickup'];

// Farm details that are about the person rather than past sales, cleared when
// a seller deletes their account. The farm name is kept so past orders still
// say where they came from.
const FARM_DETAILS_TO_CLEAR = [
  'slug',
  'bio',
  'growing_practices',
  'avatar_url',
  'cover_image_url',
  'gallery_urls',
  'location',
  'zip_code',
  'phone',
  'pickup_days',
  'pickup_times',
];

async function listingIdsOf(userId: string) {
  const { data } = await supabaseAdmin.from('produce_listings').select('id').eq('farmer_id', userId);
  return (data || []).map((l) => l.id as string);
}

// What has to be finished before an account can go: orders still waiting to
// be picked up, on either side. Deleting then would strand the other person.
export async function accountDeletionBlockers(userId: string) {
  const blockers: string[] = [];

  const { count: openPurchases } = await supabaseAdmin
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('buyer_id', userId)
    .in('status', OPEN_STATUSES);
  if (openPurchases) {
    blockers.push(
      `You have ${openPurchases} purchase${openPurchases === 1 ? '' : 's'} still waiting to be picked up. Collect or cancel ${openPurchases === 1 ? 'it' : 'them'} under My Purchases first.`
    );
  }

  const listingIds = await listingIdsOf(userId);
  if (listingIds.length > 0) {
    const { count: openSales } = await supabaseAdmin
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .in('listing_id', listingIds)
      .in('status', OPEN_STATUSES);
    if (openSales) {
      blockers.push(
        `Buyers have ${openSales} open order${openSales === 1 ? '' : 's'} with your farm. Hand ${openSales === 1 ? 'it' : 'them'} over or cancel ${openSales === 1 ? 'it' : 'them'} in your Seller Dashboard first.`
      );
    }
  }

  return blockers;
}

export async function deleteAccount(user: User) {
  const userId = user.id;
  const listingIds = await listingIdsOf(userId);

  // As a seller: nothing more can be bought, and the farm page loses
  // everything personal. The name stays on past orders.
  if (listingIds.length > 0) {
    const { error } = await supabaseAdmin.from('produce_listings').update({ available_quantity: 0 }).eq('farmer_id', userId);
    if (error) throw error;
  }
  const { data: profile } = await supabaseAdmin.from('seller_profiles').select('*').eq('id', userId).maybeSingle();
  if (profile) {
    const cleared: Record<string, null | boolean> = { stripe_onboarding_complete: false };
    for (const column of FARM_DETAILS_TO_CLEAR) if (column in profile) cleared[column] = null;
    const { error } = await supabaseAdmin.from('seller_profiles').update(cleared).eq('id', userId);
    if (error) throw error;
  }
  await supabaseAdmin.from('listing_pickup_addresses').delete().eq('farmer_id', userId);

  // Farm shares. As a farm: every share ends and its members are told. As a
  // member: memberships are cancelled, and the saved cards are removed from
  // Stripe along with the Stripe customer that held them.
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.farmfreshdirect.online';
  const { data: ownPlans } = await supabaseAdmin.from('csa_plans').select('*').eq('farmer_id', userId).neq('status', 'ended');
  for (const plan of (ownPlans || []) as CsaPlan[]) {
    await supabaseAdmin.from('csa_plans').update({ status: 'ended', updated_at: new Date().toISOString() }).eq('id', plan.id);
    for (const member of await liveMembersOf(plan.id)) {
      await cancelMembership({ member, plan, reason: 'The farm has closed its account.', by: 'farm', siteUrl });
    }
  }
  // Its market and event posts come down. (Orders on its listings, including
  // any for pickup at a market, are handled with the listings above.)
  await supabaseAdmin
    .from('farm_appearances')
    .update({ status: 'removed', removed_by: 'farm', removed_reason: 'Account deleted.', updated_at: new Date().toISOString() })
    .eq('farmer_id', userId)
    .eq('status', 'active');

  // As a partner in other farms' shared boxes: the farm leaves each one.
  const { data: partnerRows } = await supabaseAdmin
    .from('csa_plan_farms')
    .select('plan_id')
    .eq('farmer_id', userId)
    .eq('role', 'partner')
    .in('status', ['invited', 'accepted']);
  for (const row of partnerRows || []) {
    const { data: plan } = await supabaseAdmin.from('csa_plans').select('*').eq('id', row.plan_id).single();
    if (plan) await partnerLeaves({ plan: plan as CsaPlan, farmerId: userId, by: 'account_deleted', reason: 'The farm has closed its account.', siteUrl });
  }
  const { data: memberships } = await supabaseAdmin.from('csa_members').select('*').eq('buyer_id', userId).neq('status', 'cancelled');
  for (const member of (memberships || []) as CsaMember[]) {
    const { data: plan } = await supabaseAdmin.from('csa_plans').select('*').eq('id', member.plan_id).single();
    if (plan) await cancelMembership({ member, plan: plan as CsaPlan, reason: 'Account deleted.', by: 'account_deleted', siteUrl });
  }
  await supabaseAdmin.from('csa_members').update({ buyer_id: null }).eq('buyer_id', userId);
  const { data: customer } = await supabaseAdmin
    .from('buyer_stripe_customers')
    .select('stripe_customer_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (customer?.stripe_customer_id) {
    try {
      await stripeAdmin.customers.del(customer.stripe_customer_id);
    } catch (err: any) {
      if (err?.code !== 'resource_missing') throw err;
    }
    await supabaseAdmin.from('buyer_stripe_customers').delete().eq('user_id', userId);
  }

  // Favorites, both ways.
  await supabaseAdmin.from('farm_follows').delete().eq('user_id', userId);
  await supabaseAdmin.from('farm_follows').delete().eq('farmer_id', userId);

  // Past purchases and reviews are kept as records, no longer tied to an
  // account. (Reviews never showed who wrote them.)
  const { error: ordersError } = await supabaseAdmin.from('orders').update({ buyer_id: null }).eq('buyer_id', userId);
  if (ordersError) throw ordersError;
  await supabaseAdmin.from('order_pickup_codes').update({ buyer_id: null }).eq('buyer_id', userId);
  await supabaseAdmin.from('seller_reviews').update({ buyer_id: null }).eq('buyer_id', userId);

  // Finally the sign-in itself. "Soft" deletion removes the account and its
  // sign-in details while leaving the records above pointing at nothing, which
  // the database needs for orders placed with it.
  const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId, true);
  if (deleteError) throw deleteError;

  return { wasSeller: Boolean(profile) || listingIds.length > 0 };
}
