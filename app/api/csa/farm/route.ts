import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getRequestUser } from '@/lib/apiAuth';
import { getFarmPickup } from '@/lib/farmPickupAddress';
import { saveListingPickupAddress } from '@/lib/listingRules';
import { isSellerSuspended } from '@/lib/accountBlocks';
import { SELLER_TERMS_VERSION } from '@/lib/sellerTerms';
import { geocodeZip } from '@/lib/geo';
import { requestIp } from '@/lib/checkoutGuard';
import {
  cancelMembership,
  emailMembers,
  farmCantSell,
  maskEmail,
  siteUrlFrom,
  singleBoxCounts,
  refundSingleBoxes,
  type CsaMember,
  type CsaPlan,
} from '@/lib/csa';
import {
  addDays,
  boxCategoryFor,
  boxDates,
  boxKindName,
  canStillSkip,
  chargeDateFor,
  confirmByFor,
  formatBoxDate,
  isBoxDate,
  isDay,
  memberGetsBox,
  todayInArizona,
} from '@/lib/csaSchedule';
import {
  emailFarmer,
  farmProfiles,
  isShared,
  milesFromHost,
  partnerLeaves,
  partnerSuggestions,
  planFarms,
  reportMissingPart,
  sharedBoxProblem,
} from '@/lib/sharedBoxes';
import {
  MIN_HOST_SHARE_CENTS,
  SHARED_BOX_MAX_PARTNERS,
  SHARED_BOX_MILES,
  SHARED_TERMS_VERSION,
  sharedBoxAgreementText,
} from '@/lib/sharedBoxTerms';
import { escapeHtml } from '@/lib/email';
import { alertAdmin } from '@/lib/alerts';

export const dynamic = 'force-dynamic';

const WEEKS_SHOWN = 6;

// A farm's own Farm Boxes, from the Seller Dashboard.
//   { action: 'get' }                                   — plans, weeks, members
//   { action: 'save_plan', plan: {...}, acceptTerms?, acceptSharedTerms? }
//                                                       — create or edit
//   { action: 'save_week', planId, boxDate, note }      — this week's box note
//   { action: 'skip_week', planId, boxDate, skipped, reason }
//   { action: 'end_plan', planId, reason }
//   { action: 'remove_member', planId, memberId, reason }
// A shared box (one this farm hosts):
//   { action: 'suggest', planId }                       — nearby farms to invite
//   { action: 'invite', planId, farmerId, message }
//   { action: 'remove_partner', planId, farmerId, reason } — also withdraws an invitation
//   { action: 'open_shared', planId }                   — show it to buyers
//   { action: 'report_missing', planId, boxDate, farmerId, substitute }
export async function POST(request: Request) {
  try {
    const user = await getRequestUser(request);
    if (!user) return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const today = todayInArizona();
    const siteUrl = siteUrlFrom(request);

    if (body.action === 'get') return NextResponse.json(await farmOverview(user.id, today));

    if (body.action === 'save_plan') {
      const result = await savePlan(user.id, body.plan || {}, {
        acceptTerms: body.acceptTerms === true,
        acceptSharedTerms: body.acceptSharedTerms === true,
        ip: requestIp(request),
        today,
        siteUrl,
      });
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
    if (!plan) return NextResponse.json({ error: 'Farm Box not found.' }, { status: 404 });
    const kindName = boxKindName(plan.box_type);

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
        // Anyone who bought just this one box is refunded in full.
        if (skipped && !week?.skipped) await refundSingleBoxes(plan, boxDate, reason);
        if (skipped !== Boolean(week?.skipped)) {
          await emailMembers(
            plan.id,
            skipped ? `No ${plan.name} box on ${formatBoxDate(boxDate)}` : `${plan.name} is back on for ${formatBoxDate(boxDate)}`,
            skipped
              ? `<p>The farm has called off the <strong>${escapeHtml(plan.name)}</strong> box for ${formatBoxDate(boxDate, { long: true })}: ${escapeHtml(reason)}</p><p>You won't be charged for that week. Your membership carries on as normal.</p>`
              : `<p>Good news: the <strong>${escapeHtml(plan.name)}</strong> box for ${formatBoxDate(boxDate, { long: true })} is back on. It will be charged as usual, ${formatBoxDate(chargeDateFor(boxDate))}, unless you skip it under <a href="${siteUrl}/account/csa">My Farm Boxes</a>.</p>`
          );
          // Partners needn't bring anything for a week that is off.
          if (isShared(plan)) {
            for (const farm of (await planFarms(plan.id)).filter((f) => f.role === 'partner' && f.status === 'accepted')) {
              await emailFarmer(
                farm.farmer_id,
                skipped ? `No ${plan.name} boxes on ${formatBoxDate(boxDate)}` : `${plan.name} is back on for ${formatBoxDate(boxDate)}`,
                skipped
                  ? `<p>The host has called off the <strong>${escapeHtml(plan.name)}</strong> boxes for ${formatBoxDate(boxDate, { long: true })}: ${escapeHtml(reason)}. You don't need to bring anything that week.</p>`
                  : `<p>The <strong>${escapeHtml(plan.name)}</strong> boxes for ${formatBoxDate(boxDate, { long: true })} are back on. Please confirm your part in your Seller Dashboard by ${formatBoxDate(confirmByFor(boxDate))}.</p>`
              );
            }
          }
        }
      }
      return NextResponse.json(await farmOverview(user.id, today));
    }

    if (body.action === 'end_plan') {
      const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 300) : '';
      if (!reason) return NextResponse.json({ error: `Tell your members why this ${kindName} is ending.` }, { status: 400 });
      const { error } = await supabaseAdmin
        .from('csa_plans')
        .update({ status: 'ended', updated_at: new Date().toISOString() })
        .eq('id', plan.id);
      if (error) throw error;
      for (const member of await liveMembers(plan.id)) {
        await cancelMembership({ member, plan, reason, by: 'farm', siteUrl });
      }
      if (isShared(plan)) {
        for (const farm of (await planFarms(plan.id)).filter((f) => f.role === 'partner' && ['invited', 'accepted'].includes(f.status))) {
          await emailFarmer(
            farm.farmer_id,
            `${plan.name} has ended`,
            `<p>The host has ended the shared ${kindName} <strong>${escapeHtml(plan.name)}</strong>: ${escapeHtml(reason)}. ${
              farm.status === 'accepted' ? 'Boxes already paid for still include your part, so please still bring it.' : ''
            }</p>`
          );
        }
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

    // ---- shared boxes ----
    if (!isShared(plan)) return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
    if (plan.status === 'ended') return NextResponse.json({ error: `This ${kindName} has ended.` }, { status: 409 });
    const farms = await planFarms(plan.id);

    if (body.action === 'suggest') {
      return NextResponse.json({ suggestions: await partnerSuggestions(plan) });
    }

    if (body.action === 'invite') {
      const farmerId = typeof body.farmerId === 'string' ? body.farmerId : '';
      const message = typeof body.message === 'string' ? body.message.trim().slice(0, 500) : '';
      if (plan.status !== 'forming') {
        return NextResponse.json({ error: 'Partners can only be added before the box opens to buyers. Start a new box to add a farm.' }, { status: 409 });
      }
      if (!farmerId || farmerId === user.id) return NextResponse.json({ error: 'Choose a farm to invite.' }, { status: 400 });
      const taken = farms.filter((f) => f.role === 'partner' && ['invited', 'accepted'].includes(f.status));
      if (taken.some((f) => f.farmer_id === farmerId)) return NextResponse.json({ error: 'That farm is already invited.' }, { status: 409 });
      if (taken.length >= SHARED_BOX_MAX_PARTNERS) {
        return NextResponse.json({ error: `A shared box can have up to ${SHARED_BOX_MAX_PARTNERS} partner farms.` }, { status: 409 });
      }
      if (await sharedBoxProblem(farmerId)) {
        return NextResponse.json({ error: "That farm can't join a shared box right now." }, { status: 409 });
      }
      const miles = await milesFromHost(user.id, farmerId);
      if (miles === null || miles > SHARED_BOX_MILES) {
        return NextResponse.json({ error: `Partner farms must be within ${SHARED_BOX_MILES} miles of you.` }, { status: 409 });
      }
      const { error } = await supabaseAdmin.from('csa_plan_farms').upsert({
        plan_id: plan.id,
        farmer_id: farmerId,
        role: 'partner',
        status: 'invited',
        invite_message: message,
        invited_at: new Date().toISOString(),
        responded_at: null,
        contribution: '',
        share_cents: 0,
        includes_eggs: false,
        left_at: null,
        left_reason: null,
      });
      if (error) throw error;
      const host = (await farmProfiles([user.id])).get(user.id)?.farm_name || 'A nearby farm';
      await emailFarmer(
        farmerId,
        `${host} invited you to a shared ${kindName}`,
        `<h2 style="color: #059669;">You're invited to fill a box together</h2>
         <p><strong>${escapeHtml(host)}</strong> is starting a shared ${kindName}, <strong>${escapeHtml(plan.name)}</strong>, and would like your farm to add its produce. Buyers pick up at ${escapeHtml(host)}; you say what you put in each box and set your own price for it, and you're paid for your part when each box is collected.</p>
         ${message ? `<p style="padding: 12px; background: #ecfdf5; border-radius: 8px;">${escapeHtml(message)}</p>` : ''}
         <p><a href="${siteUrl}/dashboard?tab=csa" style="display: inline-block; background: #047857; color: #ffffff; text-decoration: none; font-weight: bold; padding: 10px 18px; border-radius: 8px;">See the invitation</a></p>`
      );
      return NextResponse.json(await farmOverview(user.id, today));
    }

    if (body.action === 'remove_partner') {
      const farmerId = typeof body.farmerId === 'string' ? body.farmerId : '';
      const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 300) : '';
      const farm = farms.find((f) => f.farmer_id === farmerId && f.role === 'partner');
      if (!farm || !['invited', 'accepted'].includes(farm.status)) return NextResponse.json({ error: 'Partner not found.' }, { status: 404 });
      if (farm.status === 'accepted' && plan.status !== 'forming' && !reason) {
        return NextResponse.json({ error: 'Tell the farm and your members why.' }, { status: 400 });
      }
      await partnerLeaves({ plan, farmerId, by: 'host', reason, siteUrl });
      return NextResponse.json(await farmOverview(user.id, today));
    }

    if (body.action === 'open_shared') {
      if (plan.status !== 'forming') return NextResponse.json({ error: 'This box is already open.' }, { status: 409 });
      const partners = farms.filter((f) => f.role === 'partner');
      if (partners.some((f) => f.status === 'invited')) {
        return NextResponse.json({ error: 'Every invited farm has to answer first. Wait for them, or withdraw the invitation.' }, { status: 409 });
      }
      const accepted = partners.filter((f) => f.status === 'accepted');
      if (accepted.length === 0) return NextResponse.json({ error: 'At least one partner farm has to join first.' }, { status: 409 });
      const profiles = await farmProfiles(accepted.map((f) => f.farmer_id));
      for (const farm of accepted) {
        if (await sharedBoxProblem(farm.farmer_id)) {
          return NextResponse.json(
            { error: `${profiles.get(farm.farmer_id)?.farm_name || 'A partner farm'} can't be in a shared box right now. Take it out of the box to open it.` },
            { status: 409 }
          );
        }
      }
      const host = farms.find((f) => f.role === 'host');
      const priceCents = (host?.share_cents || 0) + accepted.reduce((sum, f) => sum + f.share_cents, 0);
      const { error } = await supabaseAdmin
        .from('csa_plans')
        .update({ status: 'open', price_cents: priceCents, updated_at: new Date().toISOString() })
        .eq('id', plan.id);
      if (error) throw error;
      await supabaseAdmin.from('produce_listings').update({ price_per_unit: priceCents / 100 }).eq('id', plan.listing_id);
      for (const farm of accepted) {
        await emailFarmer(
          farm.farmer_id,
          `${plan.name} is open to buyers`,
          `<p>The shared ${kindName} <strong>${escapeHtml(plan.name)}</strong> is now open to buyers. Each week you'll be asked to confirm your part before buyers are charged; you can confirm ahead in your Seller Dashboard.</p>`
        );
      }
      return NextResponse.json(await farmOverview(user.id, today));
    }

    if (body.action === 'report_missing') {
      const boxDate = String(body.boxDate || '');
      const farmerId = typeof body.farmerId === 'string' ? body.farmerId : '';
      if (!isBoxDate(plan, boxDate) || today < chargeDateFor(boxDate) || today > addDays(boxDate, 3)) {
        return NextResponse.json({ error: 'You can report a missing part from the day boxes are charged until a few days after pickup.' }, { status: 400 });
      }
      if (!farms.some((f) => f.farmer_id === farmerId && f.role === 'partner' && ['accepted', 'left', 'removed'].includes(f.status))) {
        return NextResponse.json({ error: 'That farm isn’t a partner in this box.' }, { status: 404 });
      }
      const result = await reportMissingPart({ plan, boxDate, farmerId, substitute: body.substitute === true, siteUrl });
      return NextResponse.json({ ...(await farmOverview(user.id, today)), missing: result });
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
  // The box price, or for a shared box the host's own part of it.
  priceDollars?: number | string;
  frequency?: string;
  pickupWeekday?: number | string;
  pickupWindow?: string;
  seasonStart?: string;
  seasonEnd?: string;
  maxMembers?: number | string | null;
  status?: string;
  // A photo already uploaded to our storage, or empty for none.
  imageUrl?: string | null;
  // 'food' or 'flowers'; set when the box is created.
  boxType?: string;
  // 'shared' to fill the box with nearby farms; set when the box is created.
  kind?: string;
  // Shared boxes: what the host puts in each box, eggs, where partners drop
  // off, and whether the host fills in for a missing part.
  hostContribution?: string;
  includesEggs?: boolean;
  dropoffNote?: string;
  hostSubstitutes?: boolean;
};

// Only photos uploaded to the site's own storage are accepted.
const PHOTO_PREFIX = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/produce-images/`;
function cleanPhoto(value: unknown) {
  return typeof value === 'string' && value.startsWith(PHOTO_PREFIX) && value.length < 500 ? value : null;
}

async function savePlan(
  farmerId: string,
  input: PlanInput,
  opts: { acceptTerms: boolean; acceptSharedTerms: boolean; ip: string; today: string; siteUrl: string }
) {
  const { today, siteUrl } = opts;
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
  const imageUrl = cleanPhoto(input.imageUrl);
  const boxType = input.boxType === 'flowers' ? 'flowers' : 'food';
  const hostContribution = String(input.hostContribution || '').trim().slice(0, 200);
  const includesEggs = boxType === 'food' && input.includesEggs === true;
  const dropoffNote = String(input.dropoffNote || '').trim().slice(0, 200);
  const hostSubstitutes = input.hostSubstitutes === true;

  // A shared box is decided when it is created; an edit keeps what it is.
  const { data: existing } = input.id
    ? await supabaseAdmin.from('csa_plans').select('*').eq('id', input.id).eq('farmer_id', farmerId).maybeSingle()
    : { data: null as any };
  if (input.id && !existing) return { error: 'Farm Box not found.' };
  const shared = existing ? existing.kind === 'shared' : input.kind === 'shared';
  const kindName = boxKindName(existing ? existing.box_type : boxType);

  if (name.length < 3) return { error: `Give your ${kindName} a name, e.g. "${boxType === 'flowers' ? 'Weekly Bouquet' : 'Weekly Veggie Box'}".` };
  if (description.length < 10) return { error: 'Describe what members can expect in a typical box.' };
  if (shared) {
    if (!Number.isFinite(priceCents) || priceCents < MIN_HOST_SHARE_CENTS || priceCents > 50000) {
      return { error: `Your own part of the box must be priced between $${(MIN_HOST_SHARE_CENTS / 100).toFixed(2)} and $500.` };
    }
    if (hostContribution.length < 3) return { error: 'Say what your farm puts in each box, e.g. "6–8 seasonal vegetables".' };
  } else if (!Number.isFinite(priceCents) || priceCents < 500 || priceCents > 50000) {
    return { error: 'The box price must be between $5 and $500.' };
  }
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
    if (!opts.acceptTerms) return { error: 'Please read and agree to the Seller Terms first.' };
    await supabaseAdmin
      .from('seller_terms_acceptances')
      .upsert({ user_id: farmerId, accepted_at: new Date().toISOString(), terms_version: SELLER_TERMS_VERSION });
  }

  const now = new Date().toISOString();
  const farmName = (await farmProfiles([farmerId])).get(farmerId)?.farm_name || 'My farm';

  // ---- editing ----
  if (existing) {
    if (existing.status === 'ended') return { error: `This ${kindName} has ended. Start a new one instead.` };

    const { count: everJoined } = await supabaseAdmin
      .from('csa_members')
      .select('id', { count: 'exact', head: true })
      .eq('plan_id', existing.id);
    // Members signed up for a day and a schedule; those can't change under them.
    if (everJoined) {
      if (weekday !== existing.pickup_weekday || frequency !== existing.frequency || seasonStart !== existing.season_start) {
        return { error: `The pickup day, how often and the start date can’t change once members have joined. End this ${kindName} and start a new one if they need to.` };
      }
    } else if (seasonStart < today && seasonStart !== existing.season_start) {
      return { error: 'The season can’t start in the past.' };
    }

    let planPrice = priceCents;
    if (shared) {
      const farms = await planFarms(existing.id);
      const host = farms.find((f) => f.role === 'host');
      const changedPart = !host || host.share_cents !== priceCents || host.contribution !== hostContribution || host.includes_eggs !== includesEggs;
      // A shared box's parts make up its price, which members have agreed to.
      if (changedPart && (everJoined || existing.status !== 'forming')) {
        return { error: 'Your part and its price can’t change once the box is open to buyers. Start a new box to change them.' };
      }
      if (changedPart) {
        if (!opts.acceptSharedTerms) return { error: 'Please agree to the shared box terms for your new part.' };
        await supabaseAdmin
          .from('csa_plan_farms')
          .update({
            contribution: hostContribution,
            share_cents: priceCents,
            includes_eggs: includesEggs,
            terms_version: SHARED_TERMS_VERSION,
            agreed_text: sharedBoxAgreementText({
              role: 'host',
              planName: name,
              hostFarmName: farmName,
              contribution: hostContribution,
              shareCents: priceCents,
              boxType: existing.box_type,
              includesEggs,
              hostSubstitutes,
            }),
            agreed_at: now,
            agreed_ip: opts.ip,
          })
          .eq('plan_id', existing.id)
          .eq('farmer_id', farmerId);
      }
      planPrice = priceCents + farms.filter((f) => f.role === 'partner' && f.status === 'accepted').reduce((sum, f) => sum + f.share_cents, 0);
    }

    const { error } = await supabaseAdmin
      .from('csa_plans')
      .update({
        name,
        description,
        price_cents: planPrice,
        frequency,
        pickup_weekday: weekday,
        pickup_window: pickupWindow,
        season_start: seasonStart,
        season_end: seasonEnd,
        max_members: maxMembers,
        // A shared box still forming stays so until the host opens it.
        status: existing.status === 'forming' ? 'forming' : status,
        ...(shared ? { dropoff_note: dropoffNote, host_substitutes: everJoined ? existing.host_substitutes : hostSubstitutes } : {}),
        updated_at: now,
      })
      .eq('id', existing.id);
    if (error) throw error;
    await supabaseAdmin
      .from('produce_listings')
      .update({ title: name, description, price_per_unit: planPrice / 100, pickup_instructions: pickupWindow, image_url: imageUrl })
      .eq('id', existing.listing_id);

    if (seasonEnd !== existing.season_end && everJoined) {
      await emailMembers(
        existing.id,
        `${name}: the season now ends ${formatBoxDate(seasonEnd)}`,
        `<p>The farm has changed the last pickup of <strong>${escapeHtml(name)}</strong> to <strong>${formatBoxDate(seasonEnd, { long: true })}</strong>. Nothing else changes, and you can skip, pause or cancel under <a href="${siteUrl}/account/csa">My Farm Boxes</a>.</p>`
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
  if ((running || 0) >= 5) return { error: 'A farm can run up to 5 Farm Boxes at once.' };

  let agreedText = '';
  if (shared) {
    const problem = await sharedBoxProblem(farmerId);
    if (problem) return { error: `Your farm can't host a shared box right now, because it ${problem}.` };
    if (!opts.acceptSharedTerms) return { error: 'Please read and agree to the shared box terms.' };
    agreedText = sharedBoxAgreementText({
      role: 'host',
      planName: name,
      hostFarmName: farmName,
      contribution: hostContribution,
      shareCents: priceCents,
      boxType,
      includesEggs,
      hostSubstitutes,
    });
  }

  // The hidden listing each box's order is placed on. It is never shown in
  // the shop (its category isn't one of the shop's), and it moves with the
  // farm's pickup address like every other listing.
  const coordinates = await geocodeZip(farmPickup.zip);
  const { data: listing, error: listingError } = await supabaseAdmin
    .from('produce_listings')
    .insert({
      farmer_id: farmerId,
      title: name,
      variety: kindName,
      category: boxCategoryFor(boxType),
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
      image_url: imageUrl,
      status: 'csa',
    })
    .select('id')
    .single();
  if (listingError) throw listingError;

  let planId: string | null = null;
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
        // A shared box opens to buyers once its partners have joined.
        status: shared ? 'forming' : status,
        box_type: boxType,
        kind: shared ? 'shared' : 'solo',
        dropoff_note: shared ? dropoffNote : '',
        host_substitutes: shared && hostSubstitutes,
      })
      .select('id')
      .single();
    if (error) throw error;
    planId = plan.id as string;
    if (shared) {
      const { error: hostError } = await supabaseAdmin.from('csa_plan_farms').insert({
        plan_id: planId,
        farmer_id: farmerId,
        role: 'host',
        status: 'accepted',
        contribution: hostContribution,
        share_cents: priceCents,
        includes_eggs: includesEggs,
        responded_at: now,
        terms_version: SHARED_TERMS_VERSION,
        agreed_text: agreedText,
        agreed_at: now,
        agreed_ip: opts.ip,
      });
      if (hostError) throw hostError;
    }
    return { planId };
  } catch (err) {
    if (planId) await supabaseAdmin.from('csa_plans').delete().eq('id', planId);
    await supabaseAdmin.from('listing_pickup_addresses').delete().eq('listing_id', listing.id);
    await supabaseAdmin.from('produce_listings').delete().eq('id', listing.id);
    throw err;
  }
}

// Everything the Farm Boxes section of the Seller Dashboard shows about the
// boxes this farm runs (including shared boxes it hosts).
async function farmOverview(farmerId: string, today: string) {
  const { data: planRows } = await supabaseAdmin
    .from('csa_plans')
    .select('*')
    .eq('farmer_id', farmerId)
    .order('created_at', { ascending: false });
  const plans = (planRows || []) as CsaPlan[];
  const payoutsProblem = await farmCantSell(farmerId);
  // Each Farm Box's photo is kept on its hidden listing.
  const { data: photoRows } = plans.length
    ? await supabaseAdmin.from('produce_listings').select('id, image_url').in('id', plans.map((p) => p.listing_id))
    : { data: [] as any[] };
  const photoByListing = new Map((photoRows || []).map((l) => [l.id, l.image_url as string | null]));

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
    // Boxes bought one at a time, by people who haven't signed up.
    const singles = await singleBoxCounts(plan, dates);

    // A shared box: its farms, and each partner's answer for each week.
    const shared = isShared(plan);
    const farms = shared ? await planFarms(plan.id) : [];
    const profiles = await farmProfiles(farms.map((f) => f.farmer_id));
    const { data: answerRows } = shared && dates.length
      ? await supabaseAdmin.from('csa_farm_weeks').select('farmer_id, box_date, status').eq('plan_id', plan.id).in('box_date', dates)
      : { data: [] as any[] };

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
        boxes: week?.skipped ? 0 : getting.length + (singles.get(date) || 0),
        oneOff: singles.get(date) || 0,
        paid: rows.filter((b) => b.status === 'paid').length,
        failed: rows.filter((b) => b.status === 'failed').length,
        memberSkips: rows.filter((b) => b.status === 'skipped').length,
        confirmByLabel: formatBoxDate(confirmByFor(date)),
        // From the charge until a few days after pickup, a missing part can
        // be reported.
        canReportMissing: shared && today >= chargeDateFor(date) && today <= addDays(date, 3),
        partners: farms
          .filter((f) => f.role === 'partner' && f.status === 'accepted')
          .map((f) => ({
            farmerId: f.farmer_id,
            name: profiles.get(f.farmer_id)?.farm_name || 'Partner farm',
            answer: ((answerRows || []).find((a) => a.farmer_id === f.farmer_id && a.box_date === date)?.status as string) || null,
          })),
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
      kind: plan.kind || 'solo',
      boxType: plan.box_type || 'food',
      dropoffNote: plan.dropoff_note || '',
      hostSubstitutes: Boolean(plan.host_substitutes),
      imageUrl: photoByListing.get(plan.listing_id) || null,
      everJoined: members.length > 0,
      // For a shared box: the host's own part (what the form edits) and every farm.
      hostPart: (() => {
        const host = farms.find((f) => f.role === 'host');
        return host
          ? { contribution: host.contribution, priceDollars: (host.share_cents / 100).toFixed(2), includesEggs: host.includes_eggs }
          : null;
      })(),
      farms: farms.map((f) => ({
        farmerId: f.farmer_id,
        role: f.role,
        name: profiles.get(f.farmer_id)?.farm_name || 'Partner farm',
        slug: profiles.get(f.farmer_id)?.slug || null,
        status: f.status,
        contribution: f.contribution,
        priceDollars: (f.share_cents / 100).toFixed(2),
        includesEggs: f.includes_eggs,
        leftReason: f.left_reason || '',
      })),
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
