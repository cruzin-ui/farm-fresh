import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { sendEmail, escapeHtml } from '@/lib/email';
import { alertAdmin } from '@/lib/alerts';
import { geocodeZip, milesBetween } from '@/lib/geo';
import { isSellerSuspended, suspendedSellerIds } from '@/lib/accountBlocks';
import { checkSellerCancellations } from '@/lib/fraudWatch';
import { FARMER_CANCEL_REASONS } from '@/lib/sellerChanges';
import {
  ASK_DAYS_BEFORE,
  CONFIRM_DAYS_BEFORE,
  addDays,
  boxDates,
  boxReadyBy,
  confirmByFor,
  formatBoxDate,
  memberGetsBox,
} from '@/lib/csaSchedule';
import { categoriesForBoxType, SHARED_BOX_CANCEL_LIMIT, SHARED_BOX_MILES, SHARED_BOX_WINDOW_DAYS } from '@/lib/sharedBoxTerms';
import { getOrderShares, refundFarmShare } from '@/lib/orderShares';

// SERVER-ONLY. Shared Farm Boxes: which farms are in a box, finding nearby
// partners, each partner's weekly confirmation, and what happens when a part
// doesn't come. The rules and wording are in lib/sharedBoxTerms; the money for
// each paid box is in lib/orderShares.

export type PlanFarm = {
  plan_id: string;
  farmer_id: string;
  role: 'host' | 'partner';
  status: 'invited' | 'accepted' | 'declined' | 'left' | 'removed';
  contribution: string;
  share_cents: number;
  includes_eggs: boolean;
  invite_message: string;
  invited_at: string;
  responded_at: string | null;
  agreed_at: string | null;
  left_at: string | null;
  left_reason: string | null;
};

// The fields of a Farm Box this module needs.
export type SharedPlan = {
  id: string;
  farmer_id: string;
  listing_id: string;
  name: string;
  kind?: string | null;
  box_type?: string | null;
  price_cents: number;
  status: string;
  pickup_weekday: number;
  frequency: string;
  season_start: string;
  season_end: string;
  dropoff_note?: string | null;
  host_substitutes?: boolean | null;
};

export const isShared = (plan: { kind?: string | null }) => plan.kind === 'shared';

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const DAY_MS = 24 * 60 * 60 * 1000;

export async function planFarms(planId: string) {
  const { data } = await supabaseAdmin
    .from('csa_plan_farms')
    .select('*')
    .eq('plan_id', planId)
    .order('invited_at', { ascending: true });
  // The host first.
  return ((data || []) as PlanFarm[]).sort((a, b) => Number(b.role === 'host') - Number(a.role === 'host'));
}

// The farms filling a box now: the host and the partners who accepted.
export async function activeFarms(planId: string) {
  return (await planFarms(planId)).filter((f) => f.status === 'accepted');
}

export async function farmProfiles(farmerIds: string[]) {
  if (farmerIds.length === 0) return new Map<string, { farm_name: string; slug: string | null; avatar_url: string | null }>();
  const { data } = await supabaseAdmin.from('seller_profiles').select('id, farm_name, slug, avatar_url').in('id', farmerIds);
  return new Map(
    (data || []).map((p) => [
      p.id as string,
      { farm_name: (p.farm_name as string) || 'Local Farm', slug: (p.slug as string) || null, avatar_url: (p.avatar_url as string) || null },
    ])
  );
}

export async function emailFarmer(farmerId: string, subject: string, html: string) {
  const { data } = await supabaseAdmin.auth.admin.getUserById(farmerId);
  if (!data?.user?.email) return;
  await sendEmail({ to: data.user.email, subject, html: `<div style="font-family: sans-serif; max-width: 520px;">${html}</div>` });
}

// True when a farm can be paid right now.
async function farmCanBePaid(farmerId: string) {
  const { data } = await supabaseAdmin
    .from('seller_profiles')
    .select('stripe_account_id, stripe_onboarding_complete')
    .eq('id', farmerId)
    .maybeSingle();
  return Boolean(data?.stripe_account_id && data.stripe_onboarding_complete) && !(await isSellerSuspended(farmerId));
}

// Why a farm can't host or join a shared box right now, or null when it can:
// it must be able to be paid, and not have had SHARED_BOX_CANCEL_LIMIT or
// more farm-caused cancellations (missed shared-box deliveries included) or
// any payment dispute recently. Worded to finish "…because
// the farm has …" for the farm itself.
export async function sharedBoxProblem(farmerId: string): Promise<string | null> {
  const { data: profile } = await supabaseAdmin
    .from('seller_profiles')
    .select('stripe_account_id, stripe_onboarding_complete')
    .eq('id', farmerId)
    .maybeSingle();
  if (!profile?.stripe_account_id || !profile.stripe_onboarding_complete) return "hasn't finished setting up payouts";
  if (await isSellerSuspended(farmerId)) return 'is paused from selling right now';

  const since = new Date(Date.now() - SHARED_BOX_WINDOW_DAYS * DAY_MS).toISOString();
  const { data: listings } = await supabaseAdmin.from('produce_listings').select('id').eq('farmer_id', farmerId);
  const listingIds = (listings || []).map((l) => l.id as string);
  // Cancellations are counted the way buyers see orders: one per checkout.
  let cancellations = 0;
  if (listingIds.length > 0) {
    const { data: cancelled } = await supabaseAdmin
      .from('orders')
      .select('id, checkout_id')
      .in('listing_id', listingIds)
      .eq('status', 'cancelled')
      .in('cancel_reason', FARMER_CANCEL_REASONS.filter((r) => r !== 'seller_changed'))
      .gte('created_at', since)
      .limit(1000);
    cancellations = new Set((cancelled || []).map((o) => o.checkout_id || o.id)).size;

    const { data: disputed } = await supabaseAdmin
      .from('orders')
      .select('dispute_status')
      .in('listing_id', listingIds)
      .not('dispute_status', 'is', null)
      .gte('created_at', since)
      .limit(50);
    if ((disputed || []).some((o) => !['won', 'warning_closed'].includes(String(o.dispute_status)))) {
      return 'had a buyer’s bank dispute a payment recently';
    }
  }
  const { count: missed } = await supabaseAdmin
    .from('csa_farm_weeks')
    .select('plan_id', { count: 'exact', head: true })
    .eq('farmer_id', farmerId)
    .eq('status', 'missing')
    .gte('updated_at', since);
  if (cancellations + (missed || 0) >= SHARED_BOX_CANCEL_LIMIT) {
    return `had ${SHARED_BOX_CANCEL_LIMIT} or more orders cancelled by the farm (or shared-box deliveries missed) in the last ${SHARED_BOX_WINDOW_DAYS} days`;
  }
  return null;
}

// ---------- finding partners ----------

export type PartnerSuggestion = {
  farmerId: string;
  farmName: string;
  slug: string | null;
  avatarUrl: string | null;
  location: string;
  miles: number;
  categories: string[];
  // What this farm grows that the host doesn't list.
  adds: string[];
};

// Farms within SHARED_BOX_MILES of the host that grow things for this kind
// of box and could join, best fits first: those that add the most the host
// doesn't grow, then the nearest. Farms with problems are simply left out.
export async function partnerSuggestions(plan: SharedPlan): Promise<PartnerSuggestion[]> {
  const { data: hostProfile } = await supabaseAdmin.from('seller_profiles').select('zip_code').eq('id', plan.farmer_id).maybeSingle();
  const hostCoords = await geocodeZip(String(hostProfile?.zip_code || ''));
  if (!hostCoords) return [];

  const categories = categoriesForBoxType(plan.box_type);
  const { data: candidates } = await supabaseAdmin
    .from('seller_profiles')
    .select('id, farm_name, slug, avatar_url, zip_code, location')
    .eq('stripe_onboarding_complete', true)
    .neq('id', plan.farmer_id)
    .limit(1000);

  // One lookup per zip code.
  const zips = [...new Set((candidates || []).map((c) => String(c.zip_code || '').slice(0, 5)).filter((z) => /^\d{5}$/.test(z)))].slice(0, 80);
  const coordsByZip = new Map<string, { latitude: number; longitude: number } | null>();
  await Promise.all(zips.map(async (zip) => coordsByZip.set(zip, await geocodeZip(zip))));

  const nearby = (candidates || [])
    .map((c) => {
      const coords = coordsByZip.get(String(c.zip_code || '').slice(0, 5));
      return coords ? { ...c, miles: milesBetween(hostCoords, coords) } : null;
    })
    .filter((c): c is NonNullable<typeof c> => Boolean(c) && c!.miles <= SHARED_BOX_MILES);
  if (nearby.length === 0) return [];

  const existing = new Set((await planFarms(plan.id)).filter((f) => f.status !== 'declined').map((f) => f.farmer_id));
  const suspended = new Set(await suspendedSellerIds(nearby.map((c) => c.id)));
  const recent = new Date(Date.now() - 180 * DAY_MS).toISOString();
  const { data: listings } = await supabaseAdmin
    .from('produce_listings')
    .select('farmer_id, category')
    .in('farmer_id', [...nearby.map((c) => c.id), plan.farmer_id])
    .in('category', categories)
    .neq('status', 'removed')
    .gte('created_at', recent)
    .limit(5000);
  const categoriesOf = (farmerId: string) =>
    [...new Set((listings || []).filter((l) => l.farmer_id === farmerId).map((l) => l.category as string))].sort();
  const hostCategories = new Set(categoriesOf(plan.farmer_id));

  const suggestions: PartnerSuggestion[] = [];
  for (const farm of nearby) {
    if (existing.has(farm.id) || suspended.has(farm.id)) continue;
    const theirs = categoriesOf(farm.id);
    if (theirs.length === 0) continue;
    if (await sharedBoxProblem(farm.id)) continue;
    suggestions.push({
      farmerId: farm.id,
      farmName: farm.farm_name || 'Local Farm',
      slug: farm.slug || null,
      avatarUrl: farm.avatar_url || null,
      location: farm.location || '',
      miles: Math.max(1, Math.round(farm.miles)),
      categories: theirs,
      adds: theirs.filter((c) => !hostCategories.has(c)),
    });
  }
  return suggestions.sort((a, b) => b.adds.length - a.adds.length || a.miles - b.miles).slice(0, 12);
}

// Whether a farm is close enough to the host to join, in straight-line miles
// between their pickup zip codes (null if either can't be placed).
export async function milesFromHost(hostId: string, farmerId: string) {
  const { data } = await supabaseAdmin.from('seller_profiles').select('id, zip_code').in('id', [hostId, farmerId]);
  const zipOf = (id: string) => String(data?.find((p) => p.id === id)?.zip_code || '');
  const [a, b] = await Promise.all([geocodeZip(zipOf(hostId)), geocodeZip(zipOf(farmerId))]);
  return a && b ? milesBetween(a, b) : null;
}

// ---------- each week ----------

export type WeekPart = {
  farmerId: string;
  role: 'host' | 'partner';
  farmName: string;
  contribution: string;
  shareCents: number;
  includesEggs: boolean;
  included: boolean;
  // Why a partner's part is left out: cant (they said so), no_reply (didn't
  // confirm in time), missing (never arrived), unavailable (can't be paid).
  why: 'cant' | 'no_reply' | 'missing' | 'unavailable' | null;
  // A partner who hasn't answered yet, before the deadline.
  pending: boolean;
};

// The parts of a shared box for one pickup, and which are in it. Before the
// confirmation deadline a partner who hasn't answered yet counts as in;
// after it (`final`), as out.
export async function weekParts(plan: SharedPlan, boxDate: string, final: boolean): Promise<WeekPart[]> {
  const farms = await activeFarms(plan.id);
  const profiles = await farmProfiles(farms.map((f) => f.farmer_id));
  const { data: weekRows } = await supabaseAdmin
    .from('csa_farm_weeks')
    .select('farmer_id, status')
    .eq('plan_id', plan.id)
    .eq('box_date', boxDate);
  const answer = new Map((weekRows || []).map((w) => [w.farmer_id as string, w.status as string]));

  const parts: WeekPart[] = [];
  for (const farm of farms) {
    const base = {
      farmerId: farm.farmer_id,
      role: farm.role,
      farmName: profiles.get(farm.farmer_id)?.farm_name || 'Local Farm',
      contribution: farm.contribution,
      shareCents: farm.share_cents,
      includesEggs: farm.includes_eggs,
    };
    if (farm.role === 'host') {
      parts.push({ ...base, included: true, why: null, pending: false });
      continue;
    }
    const said = answer.get(farm.farmer_id);
    let why: WeekPart['why'] = null;
    if (said === 'cant' || said === 'no_reply' || said === 'missing') why = said;
    else if (said !== 'confirmed' && final) why = 'no_reply';
    else if (!(await farmCanBePaid(farm.farmer_id))) why = 'unavailable';
    parts.push({ ...base, included: why === null, why, pending: why === null && said !== 'confirmed' });
  }
  return parts;
}

// What a box costs this week, from the full price a member (or the plan)
// has: the parts left out come off it.
export function weekPriceCents(fullPriceCents: number, parts: WeekPart[]) {
  const leftOut = parts.filter((p) => !p.included).reduce((sum, p) => sum + p.shareCents, 0);
  return fullPriceCents - leftOut;
}

// Each farm's part of one box this week, for its payment. The host's part is
// whatever of the price isn't a partner's, so the parts always add up to the
// price charged.
export function chargeShares(fullPriceCents: number, parts: WeekPart[]) {
  const partnerParts = parts.filter((p) => p.role === 'partner');
  const hostCents = fullPriceCents - partnerParts.reduce((sum, p) => sum + p.shareCents, 0);
  const host = parts.find((p) => p.role === 'host');
  return [
    ...(host ? [{ farmerId: host.farmerId, role: 'host' as const, shareCents: Math.max(0, hostCents) }] : []),
    ...partnerParts.filter((p) => p.included).map((p) => ({ farmerId: p.farmerId, role: 'partner' as const, shareCents: p.shareCents })),
  ];
}

// "This week: Mesa Grove's oranges and Sunny Acres' eggs aren't in the box."
export function leftOutSentence(parts: WeekPart[]) {
  const out = parts.filter((p) => !p.included);
  if (out.length === 0) return '';
  const names = out.map((p) => `${p.farmName}${p.contribution ? ` (${p.contribution})` : ''}`);
  return `${names.join(' and ')} ${out.length === 1 ? "isn't" : "aren't"} part of this week's box, so it costs less.`;
}

// Open orders for this plan's box on a date.
async function openOrdersFor(plan: SharedPlan, boxDate: string) {
  const { data } = await supabaseAdmin
    .from('orders')
    .select('*')
    .eq('listing_id', plan.listing_id)
    .in('status', ['pending_pickup', 'ready_for_pickup'])
    .eq('ready_by', boxReadyBy(boxDate).toISOString());
  return data || [];
}

// Takes one partner's part out of every open box for a date that still has
// it: refunded, or filled in by the host. Returns how many boxes and the total
// refunded.
async function takePartOut(plan: SharedPlan, boxDate: string, farm: { farmer_id: string; contribution: string }, farmName: string, reason: 'missing' | 'not_coming', substitute: boolean) {
  let boxes = 0;
  let refundedCents = 0;
  for (const order of await openOrdersFor(plan, boxDate)) {
    const share = (await getOrderShares(order.id)).find((s) => s.farmer_id === farm.farmer_id && s.status === 'included');
    if (!share) continue;
    try {
      refundedCents += await refundFarmShare({
        order,
        share,
        farmName,
        contribution: farm.contribution,
        planName: plan.name,
        boxLabel: formatBoxDate(boxDate, { long: true }),
        substitute,
        reason,
      });
      boxes += 1;
    } catch (err) {
      await alertAdmin('taking a partner’s part out of a shared box', err, { order: order.id, farm: farm.farmer_id });
    }
  }
  return { boxes, refundedCents };
}

// Asks partners to confirm their part of upcoming pickups: first ASK_DAYS_BEFORE
// days ahead, and again on the last day to answer. Each email goes once.
export async function askPartners(plan: SharedPlan, today: string, siteUrl: string) {
  if (!isShared(plan) || !['open', 'closed'].includes(plan.status)) return 0;
  const farms = (await activeFarms(plan.id)).filter((f) => f.role === 'partner');
  if (farms.length === 0) return 0;
  const host = (await farmProfiles([plan.farmer_id])).get(plan.farmer_id)?.farm_name || 'the host farm';
  const dates = boxDates(plan, addDays(today, CONFIRM_DAYS_BEFORE), 3).filter((d) => d <= addDays(today, ASK_DAYS_BEFORE));
  let asked = 0;

  for (const boxDate of dates) {
    const { data: week } = await supabaseAdmin.from('csa_box_weeks').select('skipped').eq('plan_id', plan.id).eq('box_date', boxDate).maybeSingle();
    if (week?.skipped) continue;
    const deadline = confirmByFor(boxDate);
    for (const farm of farms) {
      const { data: row } = await supabaseAdmin
        .from('csa_farm_weeks')
        .select('status, asks')
        .eq('plan_id', plan.id)
        .eq('box_date', boxDate)
        .eq('farmer_id', farm.farmer_id)
        .maybeSingle();
      let send: 'first' | 'last' | null = null;
      if (!row) {
        const { error } = await supabaseAdmin
          .from('csa_farm_weeks')
          .insert({ plan_id: plan.id, box_date: boxDate, farmer_id: farm.farmer_id, status: 'asked', asks: 1 });
        if (!error) send = today === deadline ? 'last' : 'first';
      } else if (row.status === 'asked' && Number(row.asks) < 2 && today === deadline) {
        const { data: claimed } = await supabaseAdmin
          .from('csa_farm_weeks')
          .update({ asks: 2, updated_at: new Date().toISOString() })
          .eq('plan_id', plan.id)
          .eq('box_date', boxDate)
          .eq('farmer_id', farm.farmer_id)
          .eq('asks', row.asks)
          .select('farmer_id');
        if (claimed && claimed.length > 0) send = 'last';
      }
      if (!send) continue;
      asked += 1;
      await emailFarmer(
        farm.farmer_id,
        send === 'last'
          ? `Last day: confirm your part of ${plan.name} for ${formatBoxDate(boxDate)}`
          : `Please confirm your part of ${plan.name} for ${formatBoxDate(boxDate)}`,
        `<p>Can you supply <strong>${escapeHtml(farm.contribution || 'your part')}</strong> for the <strong>${escapeHtml(plan.name)}</strong> boxes hosted by ${escapeHtml(host)}, picked up on <strong>${formatBoxDate(boxDate, { long: true })}</strong>?</p>
         <p>Please confirm by the end of <strong>${formatBoxDate(deadline, { long: true })}</strong>. If you don't, or you say you can't, your part is left out of that week's box and buyers pay less.</p>
         <p><a href="${siteUrl}/dashboard?tab=csa" style="display: inline-block; background: #047857; color: #ffffff; text-decoration: none; font-weight: bold; padding: 10px 18px; border-radius: 8px;">Confirm in your Seller Dashboard</a></p>`
      );
    }
  }
  return asked;
}

// After the deadline for a pickup: partners who never answered are marked as
// left out (and told, with the host), and the parts of partners who are out
// that week are taken out of any single boxes already bought for it. Members'
// boxes aren't charged yet, so they are simply charged without those parts.
export async function settleWeek(plan: SharedPlan, boxDate: string, today: string) {
  if (!isShared(plan) || today <= confirmByFor(boxDate) || today > boxDate) return;
  const { data: week } = await supabaseAdmin.from('csa_box_weeks').select('skipped').eq('plan_id', plan.id).eq('box_date', boxDate).maybeSingle();
  if (week?.skipped) return;

  const farms = (await activeFarms(plan.id)).filter((f) => f.role === 'partner');
  const profiles = await farmProfiles([plan.farmer_id, ...farms.map((f) => f.farmer_id)]);
  const newlyOut: string[] = [];
  for (const farm of farms) {
    const { data: row } = await supabaseAdmin
      .from('csa_farm_weeks')
      .select('status')
      .eq('plan_id', plan.id)
      .eq('box_date', boxDate)
      .eq('farmer_id', farm.farmer_id)
      .maybeSingle();
    if (row && row.status !== 'asked') continue;
    const { data: marked } = row
      ? await supabaseAdmin
          .from('csa_farm_weeks')
          .update({ status: 'no_reply', updated_at: new Date().toISOString() })
          .eq('plan_id', plan.id)
          .eq('box_date', boxDate)
          .eq('farmer_id', farm.farmer_id)
          .eq('status', 'asked')
          .select('farmer_id')
      : await supabaseAdmin
          .from('csa_farm_weeks')
          .insert({ plan_id: plan.id, box_date: boxDate, farmer_id: farm.farmer_id, status: 'no_reply' })
          .select('farmer_id');
    if (marked && marked.length > 0) newlyOut.push(farm.farmer_id);
  }

  for (const farmerId of newlyOut) {
    const name = profiles.get(farmerId)?.farm_name || 'A partner farm';
    await emailFarmer(
      farmerId,
      `Your part of ${plan.name} for ${formatBoxDate(boxDate)} was left out`,
      `<p>You didn't confirm your part of <strong>${escapeHtml(plan.name)}</strong> for ${formatBoxDate(boxDate, { long: true })} in time, so it has been left out of that week's boxes and you won't be paid for it. Nothing else changes; please confirm future weeks in your Seller Dashboard.</p>`
    );
    await emailFarmer(
      plan.farmer_id,
      `${name} is out of ${plan.name} for ${formatBoxDate(boxDate)}`,
      `<p><strong>${escapeHtml(name)}</strong> didn't confirm its part of <strong>${escapeHtml(plan.name)}</strong> for ${formatBoxDate(boxDate, { long: true })}, so it is left out of that week's boxes and buyers are charged less. You don't need to do anything.</p>`
    );
  }

  // Single boxes bought earlier still have the parts of partners who are out.
  const parts = await weekParts(plan, boxDate, true);
  for (const part of parts.filter((p) => p.role === 'partner' && !p.included)) {
    const farm = farms.find((f) => f.farmer_id === part.farmerId);
    if (farm) await takePartOut(plan, boxDate, farm, part.farmName, 'not_coming', false);
  }
}

// The host reports that a partner's part for a pickup never arrived. Every
// open box for that date has the part refunded, or filled in by the host if
// the host offered that. It counts against the partner like a cancellation.
export async function reportMissingPart(params: { plan: SharedPlan; boxDate: string; farmerId: string; substitute: boolean; siteUrl: string }) {
  const { plan, boxDate, farmerId, siteUrl } = params;
  const substitute = params.substitute && Boolean(plan.host_substitutes);
  const farm = (await planFarms(plan.id)).find((f) => f.farmer_id === farmerId && f.role === 'partner');
  if (!farm) throw new Error('That farm isn’t a partner in this box.');
  const profiles = await farmProfiles([farmerId, plan.farmer_id]);
  const name = profiles.get(farmerId)?.farm_name || 'The partner farm';

  const result = await takePartOut(plan, boxDate, farm, name, 'missing', substitute);
  await supabaseAdmin
    .from('csa_farm_weeks')
    .upsert({ plan_id: plan.id, box_date: boxDate, farmer_id: farmerId, status: 'missing', updated_at: new Date().toISOString() });

  await emailFarmer(
    farmerId,
    `Your part of ${plan.name} for ${formatBoxDate(boxDate)} was reported missing`,
    `<p>${escapeHtml(profiles.get(plan.farmer_id)?.farm_name || 'The host farm')} reported that your part of <strong>${escapeHtml(plan.name)}</strong> for ${formatBoxDate(boxDate, { long: true })} didn't arrive. ${
      substitute ? 'The host filled in with its own produce' : 'Buyers have been refunded that part'
    }, and you won't be paid for it. A missed delivery counts as a cancellation by your farm.</p>
     <p>If this is wrong, <a href="${siteUrl}/contact">contact us</a>.</p>`
  );
  await checkSellerCancellations(farmerId, siteUrl);
  return result;
}

// A partner leaves a box (or the host takes them out, or their account is
// deleted). While the box is still forming, that's all. Once it is open, the
// box carries on without them: its price, and every member's, comes down by
// their part, and members are told they can cancel free. Boxes already paid
// for still include their part.
export async function partnerLeaves(params: {
  plan: SharedPlan;
  farmerId: string;
  by: 'partner' | 'host' | 'account_deleted' | 'admin';
  reason: string;
  siteUrl: string;
}) {
  const { plan, farmerId, by, reason, siteUrl } = params;
  const farm = (await planFarms(plan.id)).find((f) => f.farmer_id === farmerId && f.role === 'partner');
  if (!farm || !['invited', 'accepted'].includes(farm.status)) return;
  const wasIn = farm.status === 'accepted';
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from('csa_plan_farms')
    .update({ status: by === 'host' || by === 'admin' ? 'removed' : 'left', left_at: now, left_reason: reason.slice(0, 300) })
    .eq('plan_id', plan.id)
    .eq('farmer_id', farmerId);
  if (error) throw error;

  const profiles = await farmProfiles([farmerId, plan.farmer_id]);
  const name = profiles.get(farmerId)?.farm_name || 'A partner farm';
  const hostName = profiles.get(plan.farmer_id)?.farm_name || 'The host farm';
  if (!wasIn) return;

  if (plan.status !== 'forming') {
    const newPrice = Math.max(0, plan.price_cents - farm.share_cents);
    await supabaseAdmin.from('csa_plans').update({ price_cents: newPrice, updated_at: now }).eq('id', plan.id);
    await supabaseAdmin.from('produce_listings').update({ price_per_unit: newPrice / 100 }).eq('id', plan.listing_id);
    const { data: members } = await supabaseAdmin.from('csa_members').select('*').eq('plan_id', plan.id).neq('status', 'cancelled');
    for (const member of members || []) {
      const lowered = Math.max(0, Number(member.price_cents) - farm.share_cents);
      await supabaseAdmin.from('csa_members').update({ price_cents: lowered }).eq('id', member.id);
      if (member.buyer_email) {
        await sendEmail({
          to: member.buyer_email,
          subject: `${plan.name}: ${name} is no longer part of your box`,
          html: `<div style="font-family: sans-serif; max-width: 520px;">
            <p><strong>${escapeHtml(name)}</strong>${farm.contribution ? ` (${escapeHtml(farm.contribution)})` : ''} is no longer part of <strong>${escapeHtml(plan.name)}</strong>, so from your next unpaid box it won't be included, and the box now costs <strong>${money(lowered)}</strong> plus the service fee and any tax. Boxes already paid for are unchanged.</p>
            <p>If you'd rather not carry on, you can cancel at no cost under <a href="${siteUrl}/account/csa">My Farm Boxes</a>.</p>
          </div>`,
        });
      }
    }
  }

  if (by !== 'host') {
    await emailFarmer(
      plan.farmer_id,
      `${name} has left ${plan.name}`,
      `<p><strong>${escapeHtml(name)}</strong> is no longer part of <strong>${escapeHtml(plan.name)}</strong>${reason ? `: ${escapeHtml(reason)}` : ''}. The box carries on without their part at a lower price, and members have been told. Boxes already paid for still include their part, so they still need to bring it.</p>`
    );
  }
  if (by !== 'partner' && by !== 'account_deleted') {
    await emailFarmer(
      farmerId,
      `You're no longer part of ${plan.name}`,
      `<p>${escapeHtml(hostName)} has taken your farm out of <strong>${escapeHtml(plan.name)}</strong>${reason ? `: ${escapeHtml(reason)}` : ''}. Boxes already paid for still include your part, so please still bring it.</p>`
    );
  }
}

// How many boxes are coming for each date: members getting one and single
// boxes bought, as on the host's dashboard.
export async function expectedBoxes(plan: SharedPlan, dates: string[]) {
  const counts = new Map<string, number>(dates.map((d) => [d, 0]));
  if (dates.length === 0) return counts;
  const { data: members } = await supabaseAdmin.from('csa_members').select('id, status, created_at').eq('plan_id', plan.id).eq('status', 'active');
  const { data: boxes } = await supabaseAdmin.from('csa_boxes').select('member_id, box_date, status, order_id').eq('plan_id', plan.id).in('box_date', dates);
  const { data: weeks } = await supabaseAdmin.from('csa_box_weeks').select('box_date, skipped').eq('plan_id', plan.id).in('box_date', dates);
  const { data: orders } = await supabaseAdmin
    .from('orders')
    .select('id, ready_by')
    .eq('listing_id', plan.listing_id)
    .neq('status', 'cancelled')
    .in('ready_by', dates.map((d) => boxReadyBy(d).toISOString()));
  const memberOrders = new Set((boxes || []).map((b) => b.order_id).filter(Boolean));
  for (const date of dates) {
    if ((weeks || []).some((w) => w.box_date === date && w.skipped)) continue;
    const skippers = new Set((boxes || []).filter((b) => b.box_date === date && ['skipped', 'farm_skipped'].includes(b.status)).map((b) => b.member_id));
    const memberCount = (members || []).filter((m) => memberGetsBox(m.created_at, date) && !skippers.has(m.id)).length;
    const singles = (orders || []).filter((o) => !memberOrders.has(o.id) && new Date(o.ready_by).getTime() === boxReadyBy(date).getTime()).length;
    counts.set(date, memberCount + singles);
  }
  return counts;
}

