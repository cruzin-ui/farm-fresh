import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getRequestUser } from '@/lib/apiAuth';
import { getFarmPickup } from '@/lib/farmPickupAddress';
import { saveListingPickupAddress } from '@/lib/listingRules';
import { isSellerSuspended } from '@/lib/accountBlocks';
import { SELLER_TERMS_VERSION } from '@/lib/sellerTerms';
import { geocodeZip } from '@/lib/geo';
import {
  cancelMembership,
  emailMembers,
  farmCantSell,
  maskEmail,
  siteUrlFrom,
  type CsaMember,
  type CsaPlan,
} from '@/lib/csa';
import {
  CSA_BOX_CATEGORY,
  addDays,
  boxDates,
  canStillSkip,
  chargeDateFor,
  formatBoxDate,
  isBoxDate,
  isDay,
  memberGetsBox,
  todayInArizona,
} from '@/lib/csaSchedule';
import { escapeHtml } from '@/lib/email';
import { alertAdmin } from '@/lib/alerts';

export const dynamic = 'force-dynamic';

const WEEKS_SHOWN = 6;

// A farm's own CSA farm shares, from the Seller Dashboard.
//   { action: 'get' }                                   — plans, weeks, members
//   { action: 'save_plan', plan: {...}, acceptTerms? }  — create or edit
//   { action: 'save_week', planId, boxDate, note }      — this week's box note
//   { action: 'skip_week', planId, boxDate, skipped, reason }
//   { action: 'end_plan', planId, reason }
//   { action: 'remove_member', planId, memberId, reason }
export async function POST(request: Request) {
  try {
    const user = await getRequestUser(request);
    if (!user) return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const today = todayInArizona();
    const siteUrl = siteUrlFrom(request);

    if (body.action === 'get') return NextResponse.json(await farmOverview(user.id, today));

    if (body.action === 'save_plan') {
      const result = await savePlan(user.id, body.plan || {}, body.acceptTerms === true, today, siteUrl);
      if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 });
      return NextResponse.json({ ...(await farmOverview(user.id, today)), savedPlanId: result.planId });
    }

    // The rest act on one of the farm's own plans.
    const { data: planRow } = await supabaseAdmin
      .from('csa_plans')
      .select('*')
      .eq('id', typeof body.planId === 'string' ? body.planId : '')
      .eq('farmer_id', user.id)
      .maybeSingle();
    const plan = planRow as CsaPlan | null;
    if (!plan) return NextResponse.json({ error: 'Farm share not found.' }, { status: 404 });

    if (body.action === 'save_week' || body.action === 'skip_week') {
      const boxDate = String(body.boxDate || '');
      if (!isBoxDate(plan, boxDate) || boxDate < today) {
        return NextResponse.json({ error: "That isn't an upcoming pickup date." }, { status: 400 });
      }
      const { data: week } = await supabaseAdmin
        .from('csa_box_weeks')
        .select('*')
        .eq('plan_id', plan.id)
        .eq('box_date', boxDate)
        .maybeSingle();

      if (body.action === 'save_week') {
        const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) : '';
        const { error } = await supabaseAdmin
          .from('csa_box_weeks')
          .upsert({ plan_id: plan.id, box_date: boxDate, note, skipped: week?.skipped || false, skip_reason: week?.skip_reason || null, updated_at: new Date().toISOString() });
        if (error) throw error;
      } else {
        const skipped = body.skipped === true;
        const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 300) : '';
        if (!canStillSkip(boxDate, today)) {
          return NextResponse.json(
            { error: "Boxes for this date have already been charged. To call it off now, cancel each box in your Orders; members get a full refund." },
            { status: 409 }
          );
        }
        if (skipped && !reason) return NextResponse.json({ error: 'Tell your members why there is no box that week.' }, { status: 400 });
        const { error } = await supabaseAdmin
          .from('csa_box_weeks')
          .upsert({ plan_id: plan.id, box_date: boxDate, note: week?.note || '', skipped, skip_reason: skipped ? reason : null, updated_at: new Date().toISOString() });
        if (error) throw error;
        if (skipped !== Boolean(week?.skipped)) {
          await emailMembers(
            plan.id,
            skipped ? `No ${plan.name} box on ${formatBoxDate(boxDate)}` : `${plan.name} is back on for ${formatBoxDate(boxDate)}`,
            skipped
              ? `<p>The farm has called off the <strong>${escapeHtml(plan.name)}</strong> box for ${formatBoxDate(boxDate, { long: true })}: ${escapeHtml(reason)}</p><p>You won't be charged for that week. Your membership carries on as normal.</p>`
              : `<p>Good news: the <strong>${escapeHtml(plan.name)}</strong> box for ${formatBoxDate(boxDate, { long: true })} is back on. It will be charged as usual, ${formatBoxDate(chargeDateFor(boxDate))}, unless you skip it under <a href="${siteUrl}/account/csa">My Farm Shares</a>.</p>`
          );
        }
      }
      return NextResponse.json(await farmOverview(user.id, today));
    }

    if (body.action === 'end_plan') {
      const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 300) : '';
      if (!reason) return NextResponse.json({ error: 'Tell your members why the share is ending.' }, { status: 400 });
      const { error } = await supabaseAdmin
        .from('csa_plans')
        .update({ status: 'ended', updated_at: new Date().toISOString() })
        .eq('id', plan.id);
      if (error) throw error;
      for (const member of await liveMembers(plan.id)) {
        await cancelMembership({ member, plan, reason, by: 'farm', siteUrl });
      }
      return NextResponse.json(await farmOverview(user.id, today));
    }

    if (body.action === 'remove_member') {
      const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 300) : '';
      if (!reason) return NextResponse.json({ error: 'Give the member a reason.' }, { status: 400 });
      const member = (await liveMembers(plan.id)).find((m) => m.id === body.memberId);
      if (!member) return NextResponse.json({ error: 'Member not found.' }, { status: 404 });
      await cancelMembership({ member, plan, reason, by: 'farm', siteUrl });
      return NextResponse.json(await farmOverview(user.id, today));
    }

    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  } catch (err: any) {
    console.error('csa farm error:', err);
    await alertAdmin('CSA farm', err);
    return NextResponse.json({ error: err.message || 'Something went wrong. Please try again.' }, { status: 500 });
  }
}

async function liveMembers(planId: string) {
  const { data } = await supabaseAdmin.from('csa_members').select('*').eq('plan_id', planId).neq('status', 'cancelled');
  return (data || []) as CsaMember[];
}

type PlanInput = {
  id?: string;
  name?: string;
  description?: string;
  priceDollars?: number | string;
  frequency?: string;
  pickupWeekday?: number | string;
  pickupWindow?: string;
  seasonStart?: string;
  seasonEnd?: string;
  maxMembers?: number | string | null;
  status?: string;
};

async function savePlan(farmerId: string, input: PlanInput, acceptTerms: boolean, today: string, siteUrl: string) {
  const name = String(input.name || '').trim().slice(0, 80);
  const description = String(input.description || '').trim().slice(0, 1500);
  const priceCents = Math.round(Number(input.priceDollars) * 100);
  const frequency = input.frequency === 'biweekly' ? 'biweekly' : 'weekly';
  const weekday = Number(input.pickupWeekday);
  const pickupWindow = String(input.pickupWindow || '').trim().slice(0, 80);
  const seasonStart = String(input.seasonStart || '');
  const seasonEnd = String(input.seasonEnd || '');
  const maxRaw = input.maxMembers;
  const maxMembers = maxRaw === null || maxRaw === undefined || maxRaw === '' ? null : Math.floor(Number(maxRaw));
  const status = input.status === 'closed' ? 'closed' : 'open';

  if (name.length < 3) return { error: 'Give your farm share a name, e.g. "Weekly Veggie Box".' };
  if (description.length < 10) return { error: 'Describe what members can expect in a typical box.' };
  if (!Number.isFinite(priceCents) || priceCents < 500 || priceCents > 50000) return { error: 'The box price must be between $5 and $500.' };
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) return { error: 'Choose the pickup day.' };
  if (!isDay(seasonStart) || !isDay(seasonEnd)) return { error: 'Choose the first and last dates of the season.' };
  if (seasonEnd < seasonStart) return { error: 'The season has to end after it starts.' };
  if (seasonEnd > addDays(seasonStart, 366)) return { error: 'A season can be at most a year long.' };
  if (maxMembers !== null && (!Number.isInteger(maxMembers) || maxMembers < 1 || maxMembers > 1000)) {
    return { error: 'The member limit must be a whole number from 1 to 1000, or left empty for no limit.' };
  }
  if (await isSellerSuspended(farmerId)) return { error: "Your farm can't take new members right now. Please contact us." };

  const farmPickup = await getFarmPickup(farmerId);
  if (!farmPickup) return { error: 'Add your pickup address to your Farm Profile first. Boxes are picked up there.' };

  const { data: acceptance } = await supabaseAdmin
    .from('seller_terms_acceptances')
    .select('user_id')
    .eq('user_id', farmerId)
    .maybeSingle();
  if (!acceptance) {
    if (!acceptTerms) return { error: 'Please read and agree to the Seller Terms first.' };
    await supabaseAdmin
      .from('seller_terms_acceptances')
      .upsert({ user_id: farmerId, accepted_at: new Date().toISOString(), terms_version: SELLER_TERMS_VERSION });
  }

  const now = new Date().toISOString();

  // ---- editing ----
  if (input.id) {
    const { data: existing } = await supabaseAdmin
      .from('csa_plans')
      .select('*')
      .eq('id', input.id)
      .eq('farmer_id', farmerId)
      .maybeSingle();
    if (!existing) return { error: 'Farm share not found.' };
    if (existing.status === 'ended') return { error: 'This farm share has ended. Start a new one instead.' };

    const { count: everJoined } = await supabaseAdmin
      .from('csa_members')
      .select('id', { count: 'exact', head: true })
      .eq('plan_id', existing.id);
    // Members signed up for a day and a schedule; those can't change under them.
    if (everJoined) {
      if (weekday !== existing.pickup_weekday || frequency !== existing.frequency || seasonStart !== existing.season_start) {
        return { error: 'The pickup day, how often and the start date can’t change once members have joined. End this share and start a new one if they need to.' };
      }
    } else if (seasonStart < today && seasonStart !== existing.season_start) {
      return { error: 'The season can’t start in the past.' };
    }

    const { error } = await supabaseAdmin
      .from('csa_plans')
      .update({
        name,
        description,
        price_cents: priceCents,
        frequency,
        pickup_weekday: weekday,
        pickup_window: pickupWindow,
        season_start: seasonStart,
        season_end: seasonEnd,
        max_members: maxMembers,
        status,
        updated_at: now,
      })
      .eq('id', existing.id);
    if (error) throw error;
    await supabaseAdmin
      .from('produce_listings')
      .update({ title: name, description, price_per_unit: priceCents / 100, pickup_instructions: pickupWindow })
      .eq('id', existing.listing_id);

    if (seasonEnd !== existing.season_end && everJoined) {
      await emailMembers(
        existing.id,
        `${name}: the season now ends ${formatBoxDate(seasonEnd)}`,
        `<p>The farm has changed the last pickup of <strong>${escapeHtml(name)}</strong> to <strong>${formatBoxDate(seasonEnd, { long: true })}</strong>. Nothing else changes, and you can skip, pause or cancel under <a href="${siteUrl}/account/csa">My Farm Shares</a>.</p>`
      );
    }
    return { planId: existing.id as string };
  }

  // ---- creating ----
  if (seasonStart < today) return { error: 'The season can’t start in the past.' };
  if (boxDates({ pickup_weekday: weekday, frequency, season_start: seasonStart, season_end: seasonEnd }, seasonStart, 1).length === 0) {
    return { error: 'There is no pickup day between those dates.' };
  }
  const { count: running } = await supabaseAdmin
    .from('csa_plans')
    .select('id', { count: 'exact', head: true })
    .eq('farmer_id', farmerId)
    .neq('status', 'ended');
  if ((running || 0) >= 5) return { error: 'A farm can run up to 5 farm shares at once.' };

  // The hidden listing each box's order is placed on. It is never shown in
  // the shop (its category isn't one of the shop's), and it moves with the
  // farm's pickup address like every other listing.
  const coordinates = await geocodeZip(farmPickup.zip);
  const { data: listing, error: listingError } = await supabaseAdmin
    .from('produce_listings')
    .insert({
      farmer_id: farmerId,
      title: name,
      variety: 'Farm share box',
      category: CSA_BOX_CATEGORY,
      description,
      unit_type: 'box',
      price_per_unit: priceCents / 100,
      available_quantity: 0,
      harvest_ready_date: seasonStart,
      location_name: farmPickup.city,
      zip_code: farmPickup.zip,
      latitude: coordinates?.latitude ?? null,
      longitude: coordinates?.longitude ?? null,
      pickup_instructions: pickupWindow,
      tags: [],
      image_url: null,
      status: 'csa',
    })
    .select('id')
    .single();
  if (listingError) throw listingError;

  try {
    await saveListingPickupAddress(listing.id, farmerId, farmPickup.address);
    const { data: plan, error } = await supabaseAdmin
      .from('csa_plans')
      .insert({
        farmer_id: farmerId,
        listing_id: listing.id,
        name,
        description,
        price_cents: priceCents,
        frequency,
        pickup_weekday: weekday,
        pickup_window: pickupWindow,
        season_start: seasonStart,
        season_end: seasonEnd,
        max_members: maxMembers,
        status,
      })
      .select('id')
      .single();
    if (error) throw error;
    return { planId: plan.id as string };
  } catch (err) {
    await supabaseAdmin.from('listing_pickup_addresses').delete().eq('listing_id', listing.id);
    await supabaseAdmin.from('produce_listings').delete().eq('id', listing.id);
    throw err;
  }
}

// Everything the CSA section of the Seller Dashboard shows.
async function farmOverview(farmerId: string, today: string) {
  const { data: planRows } = await supabaseAdmin
    .from('csa_plans')
    .select('*')
    .eq('farmer_id', farmerId)
    .order('created_at', { ascending: false });
  const plans = (planRows || []) as CsaPlan[];
  const payoutsProblem = await farmCantSell(farmerId);

  const result = [];
  for (const plan of plans) {
    const { data: memberRows } = await supabaseAdmin
      .from('csa_members')
      .select('*')
      .eq('plan_id', plan.id)
      .order('created_at', { ascending: true });
    const members = (memberRows || []) as (CsaMember & { cancelled_at?: string | null })[];

    const dates = plan.status === 'ended' ? [] : boxDates(plan, today, WEEKS_SHOWN);
    const { data: boxRows } = dates.length
      ? await supabaseAdmin.from('csa_boxes').select('member_id, box_date, status').eq('plan_id', plan.id).in('box_date', dates)
      : { data: [] as any[] };
    const { data: weekRows } = dates.length
      ? await supabaseAdmin.from('csa_box_weeks').select('*').eq('plan_id', plan.id).in('box_date', dates)
      : { data: [] as any[] };
    const weekByDate = new Map((weekRows || []).map((w) => [w.box_date, w]));

    const weeks = dates.map((date) => {
      const rows = (boxRows || []).filter((b) => b.box_date === date);
      const statusOf = (memberId: string) => rows.find((b) => b.member_id === memberId)?.status;
      const getting = members.filter(
        (m) => m.status === 'active' && memberGetsBox(m.created_at, date) && !['skipped', 'farm_skipped'].includes(statusOf(m.id) || '')
      );
      const week = weekByDate.get(date);
      return {
        date,
        label: formatBoxDate(date, { long: true }),
        chargeDate: chargeDateFor(date),
        chargeLabel: formatBoxDate(chargeDateFor(date)),
        canChange: canStillSkip(date, today),
        note: week?.note || '',
        skipped: Boolean(week?.skipped),
        skipReason: week?.skip_reason || '',
        boxes: week?.skipped ? 0 : getting.length,
        paid: rows.filter((b) => b.status === 'paid').length,
        failed: rows.filter((b) => b.status === 'failed').length,
        memberSkips: rows.filter((b) => b.status === 'skipped').length,
      };
    });

    result.push({
      id: plan.id,
      name: plan.name,
      description: plan.description,
      priceDollars: (plan.price_cents / 100).toFixed(2),
      frequency: plan.frequency,
      pickupWeekday: plan.pickup_weekday,
      pickupWindow: plan.pickup_window,
      seasonStart: plan.season_start,
      seasonEnd: plan.season_end,
      maxMembers: plan.max_members,
      status: plan.status,
      everJoined: members.length > 0,
      counts: {
        active: members.filter((m) => m.status === 'active').length,
        paused: members.filter((m) => m.status === 'paused').length,
        cancelled: members.filter((m) => m.status === 'cancelled').length,
      },
      members: members.map((m) => ({
        id: m.id,
        who: maskEmail(m.buyer_email),
        status: m.status,
        joined: m.created_at,
        priceDollars: (m.price_cents / 100).toFixed(2),
        cancelledAt: m.cancelled_at || null,
      })),
      weeks,
    });
  }

  return { plans: result, payoutsProblem };
}
