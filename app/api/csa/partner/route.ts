import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getRequestUser } from '@/lib/apiAuth';
import { requestIp } from '@/lib/checkoutGuard';
import { getFarmPickup } from '@/lib/farmPickupAddress';
import { SELLER_TERMS_VERSION } from '@/lib/sellerTerms';
import { siteUrlFrom, type CsaPlan } from '@/lib/csa';
import {
  boxDates,
  boxKindName,
  canStillConfirm,
  confirmByFor,
  describeFrequency,
  formatBoxDate,
  isBoxDate,
  todayInArizona,
} from '@/lib/csaSchedule';
import {
  emailFarmer,
  expectedBoxes,
  farmProfiles,
  milesFromHost,
  partnerLeaves,
  planFarms,
  sharedBoxProblem,
  type PlanFarm,
} from '@/lib/sharedBoxes';
import {
  MIN_SHARE_CENTS,
  SHARED_BOX_MILES,
  SHARED_TERMS_VERSION,
  farmKeepsCents,
  sharedBoxAgreementText,
} from '@/lib/sharedBoxTerms';
import { escapeHtml } from '@/lib/email';
import { alertAdmin } from '@/lib/alerts';

export const dynamic = 'force-dynamic';

const WEEKS_SHOWN = 6;

// A partner farm's side of shared Farm Boxes, from the Seller Dashboard.
//   { action: 'get' }                                  — invitations and boxes
//   { action: 'accept', planId, contribution, shareDollars, includesEggs,
//     agreed, acceptTerms? }                           — join, with the terms
//   { action: 'update_part', planId, contribution, shareDollars, includesEggs, agreed }
//                                                      — change it before the box opens
//   { action: 'decline', planId, reason? }
//   { action: 'answer', planId, boxDate, answer: 'confirmed' | 'cant', note? }
//   { action: 'confirm_upcoming', planId }             — confirm every week still open
//   { action: 'leave', planId, reason }
export async function POST(request: Request) {
  try {
    const user = await getRequestUser(request);
    if (!user) return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 });
    const body = await request.json().catch(() => ({}));
    const today = todayInArizona();
    const siteUrl = siteUrlFrom(request);

    if (body.action === 'get') return NextResponse.json(await partnerOverview(user.id, today));

    const planId = typeof body.planId === 'string' ? body.planId : '';
    const { data: planRow } = await supabaseAdmin.from('csa_plans').select('*').eq('id', planId).maybeSingle();
    const plan = planRow as CsaPlan | null;
    const mine = plan ? (await planFarms(plan.id)).find((f) => f.farmer_id === user.id && f.role === 'partner') : null;
    if (!plan || !mine) return NextResponse.json({ error: 'Shared box not found.' }, { status: 404 });
    if (plan.status === 'ended') return NextResponse.json({ error: 'This box has ended.' }, { status: 409 });
    const hostName = (await farmProfiles([plan.farmer_id])).get(plan.farmer_id)?.farm_name || 'The host farm';
    const myName = (await farmProfiles([user.id])).get(user.id)?.farm_name || 'A partner farm';
    const kindName = boxKindName(plan.box_type);

    if (body.action === 'accept' || body.action === 'update_part') {
      if (body.action === 'accept' && mine.status !== 'invited') {
        return NextResponse.json({ error: 'This invitation has already been answered.' }, { status: 409 });
      }
      if (body.action === 'update_part' && mine.status !== 'accepted') {
        return NextResponse.json({ error: "You're not in this box." }, { status: 409 });
      }
      if (plan.status !== 'forming') {
        return NextResponse.json({ error: 'This box is already open to buyers, so its parts can’t change.' }, { status: 409 });
      }
      const contribution = typeof body.contribution === 'string' ? body.contribution.trim().slice(0, 200) : '';
      const shareCents = Math.round(Number(body.shareDollars) * 100);
      const includesEggs = plan.box_type !== 'flowers' && body.includesEggs === true;
      if (contribution.length < 3) return NextResponse.json({ error: 'Say what your farm puts in each box, e.g. "a dozen eggs".' }, { status: 400 });
      if (!Number.isFinite(shareCents) || shareCents < MIN_SHARE_CENTS || shareCents > 50000) {
        return NextResponse.json({ error: `Price your part between $${(MIN_SHARE_CENTS / 100).toFixed(2)} and $500 a box.` }, { status: 400 });
      }
      if (body.agreed !== true) return NextResponse.json({ error: 'Please agree to the shared box terms.' }, { status: 400 });

      if (body.action === 'accept') {
        const problem = await sharedBoxProblem(user.id);
        if (problem) return NextResponse.json({ error: `Your farm can't join a shared box right now, because it ${problem}.` }, { status: 409 });
        const miles = await milesFromHost(plan.farmer_id, user.id);
        if (miles === null || miles > SHARED_BOX_MILES) {
          return NextResponse.json({ error: `Partner farms must be within ${SHARED_BOX_MILES} miles of the host. Check the pickup address in your Farm Profile.` }, { status: 409 });
        }
        const { data: acceptance } = await supabaseAdmin.from('seller_terms_acceptances').select('user_id').eq('user_id', user.id).maybeSingle();
        if (!acceptance) {
          if (body.acceptTerms !== true) return NextResponse.json({ error: 'Please read and agree to the Seller Terms first.' }, { status: 400 });
          await supabaseAdmin
            .from('seller_terms_acceptances')
            .upsert({ user_id: user.id, accepted_at: new Date().toISOString(), terms_version: SELLER_TERMS_VERSION });
        }
      }

      const now = new Date().toISOString();
      const agreedText = sharedBoxAgreementText({
        role: 'partner',
        planName: plan.name,
        hostFarmName: hostName,
        contribution,
        shareCents,
        boxType: plan.box_type,
        includesEggs,
        hostSubstitutes: Boolean(plan.host_substitutes),
      });
      const { error } = await supabaseAdmin
        .from('csa_plan_farms')
        .update({
          status: 'accepted',
          contribution,
          share_cents: shareCents,
          includes_eggs: includesEggs,
          responded_at: body.action === 'accept' ? now : mine.responded_at,
          terms_version: SHARED_TERMS_VERSION,
          agreed_text: agreedText,
          agreed_at: now,
          agreed_ip: requestIp(request),
        })
        .eq('plan_id', plan.id)
        .eq('farmer_id', user.id);
      if (error) throw error;
      await emailFarmer(
        plan.farmer_id,
        body.action === 'accept' ? `${myName} joined ${plan.name}` : `${myName} changed its part of ${plan.name}`,
        `<p><strong>${escapeHtml(myName)}</strong> ${body.action === 'accept' ? 'has joined' : 'has changed its part of'} your shared ${kindName} <strong>${escapeHtml(plan.name)}</strong>: ${escapeHtml(contribution)}, at $${(shareCents / 100).toFixed(2)} a box${includesEggs ? ' (includes eggs)' : ''}.</p>
         <p>Once every invited farm has answered, open the box to buyers from your <a href="${siteUrl}/dashboard?tab=csa">Seller Dashboard</a>.</p>`
      );
      return NextResponse.json(await partnerOverview(user.id, today));
    }

    if (body.action === 'decline') {
      if (mine.status !== 'invited') return NextResponse.json({ error: 'This invitation has already been answered.' }, { status: 409 });
      const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 300) : '';
      const { error } = await supabaseAdmin
        .from('csa_plan_farms')
        .update({ status: 'declined', responded_at: new Date().toISOString(), left_reason: reason || null })
        .eq('plan_id', plan.id)
        .eq('farmer_id', user.id);
      if (error) throw error;
      await emailFarmer(
        plan.farmer_id,
        `${myName} declined your invitation to ${plan.name}`,
        `<p><strong>${escapeHtml(myName)}</strong> won't be joining <strong>${escapeHtml(plan.name)}</strong>${reason ? `: ${escapeHtml(reason)}` : '.'}</p>
         <p>You can invite another nearby farm from your <a href="${siteUrl}/dashboard?tab=csa">Seller Dashboard</a>.</p>`
      );
      return NextResponse.json(await partnerOverview(user.id, today));
    }

    if (body.action === 'answer' || body.action === 'confirm_upcoming') {
      if (mine.status !== 'accepted' || !['open', 'closed'].includes(plan.status)) {
        return NextResponse.json({ error: 'There’s nothing to confirm until the box is open to buyers.' }, { status: 409 });
      }
      const dates =
        body.action === 'answer'
          ? [String(body.boxDate || '')]
          : boxDates(plan, today, WEEKS_SHOWN).filter((d) => canStillConfirm(d, today));
      const answer = body.action === 'confirm_upcoming' ? 'confirmed' : body.answer === 'cant' ? 'cant' : 'confirmed';
      const note = typeof body.note === 'string' ? body.note.trim().slice(0, 300) : '';
      const { data: existing } = await supabaseAdmin
        .from('csa_farm_weeks')
        .select('box_date, status')
        .eq('plan_id', plan.id)
        .eq('farmer_id', user.id)
        .in('box_date', dates.length ? dates : ['1970-01-01']);
      const { data: skippedWeeks } = await supabaseAdmin
        .from('csa_box_weeks')
        .select('box_date')
        .eq('plan_id', plan.id)
        .eq('skipped', true)
        .in('box_date', dates.length ? dates : ['1970-01-01']);
      let changed = 0;
      for (const boxDate of dates) {
        if (!isBoxDate(plan, boxDate) || !canStillConfirm(boxDate, today)) {
          if (body.action === 'answer') {
            return NextResponse.json({ error: `Answers for ${formatBoxDate(boxDate)} closed on ${formatBoxDate(confirmByFor(boxDate))}.` }, { status: 409 });
          }
          continue;
        }
        if ((skippedWeeks || []).some((w) => w.box_date === boxDate)) continue;
        const before = (existing || []).find((e) => e.box_date === boxDate)?.status;
        // "Confirm every week" doesn't override a week they said they can't do.
        if (body.action === 'confirm_upcoming' && (before === 'cant' || before === 'confirmed')) continue;
        const { error } = await supabaseAdmin.from('csa_farm_weeks').upsert({
          plan_id: plan.id,
          box_date: boxDate,
          farmer_id: user.id,
          status: answer,
          note: note || null,
          updated_at: new Date().toISOString(),
        });
        if (error) throw error;
        changed += 1;
        if (answer === 'cant' && before !== 'cant') {
          await emailFarmer(
            plan.farmer_id,
            `${myName} can't supply ${plan.name} on ${formatBoxDate(boxDate)}`,
            `<p><strong>${escapeHtml(myName)}</strong> can't supply its part (${escapeHtml(mine.contribution)}) of <strong>${escapeHtml(plan.name)}</strong> for ${formatBoxDate(boxDate, { long: true })}${note ? `: ${escapeHtml(note)}` : '.'} It is left out of that week's boxes, and buyers pay less. You don't need to do anything.</p>`
          );
        } else if (answer === 'confirmed' && before === 'cant') {
          await emailFarmer(
            plan.farmer_id,
            `${myName} is back in ${plan.name} for ${formatBoxDate(boxDate)}`,
            `<p><strong>${escapeHtml(myName)}</strong> can supply its part of <strong>${escapeHtml(plan.name)}</strong> for ${formatBoxDate(boxDate, { long: true })} after all.</p>`
          );
        }
      }
      return NextResponse.json({ ...(await partnerOverview(user.id, today)), changed });
    }

    if (body.action === 'leave') {
      if (mine.status !== 'accepted') return NextResponse.json({ error: "You're not in this box." }, { status: 409 });
      const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 300) : '';
      if (!reason && plan.status !== 'forming') return NextResponse.json({ error: 'Tell the host and the members why.' }, { status: 400 });
      await partnerLeaves({ plan, farmerId: user.id, by: 'partner', reason, siteUrl });
      return NextResponse.json(await partnerOverview(user.id, today));
    }

    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  } catch (err: any) {
    console.error('csa partner error:', err);
    await alertAdmin('CSA partner', err);
    return NextResponse.json({ error: err.message || 'Something went wrong. Please try again.' }, { status: 500 });
  }
}

// The shared boxes this farm has been invited to or is part of.
async function partnerOverview(farmerId: string, today: string) {
  const { data: rows } = await supabaseAdmin
    .from('csa_plan_farms')
    .select('*')
    .eq('farmer_id', farmerId)
    .eq('role', 'partner')
    .in('status', ['invited', 'accepted'])
    .order('invited_at', { ascending: false });
  const mine = (rows || []) as PlanFarm[];
  if (mine.length === 0) return { boxes: [] };

  const { data: planRows } = await supabaseAdmin.from('csa_plans').select('*').in('id', mine.map((r) => r.plan_id)).neq('status', 'ended');
  const boxes = [];
  for (const plan of (planRows || []) as CsaPlan[]) {
    const me = mine.find((r) => r.plan_id === plan.id)!;
    const farms = await planFarms(plan.id);
    const profiles = await farmProfiles(farms.map((f) => f.farmer_id));
    const host = profiles.get(plan.farmer_id);
    const accepted = me.status === 'accepted';
    // The host's address is shared with partners once they've joined: it's
    // where they bring their part.
    const hostPickup = accepted ? await getFarmPickup(plan.farmer_id) : null;

    const live = accepted && ['open', 'closed'].includes(plan.status);
    const dates = live ? boxDates(plan, today, WEEKS_SHOWN) : [];
    const { data: answers } = dates.length
      ? await supabaseAdmin.from('csa_farm_weeks').select('box_date, status').eq('plan_id', plan.id).eq('farmer_id', farmerId).in('box_date', dates)
      : { data: [] as any[] };
    const { data: skipped } = dates.length
      ? await supabaseAdmin.from('csa_box_weeks').select('box_date, skip_reason').eq('plan_id', plan.id).eq('skipped', true).in('box_date', dates)
      : { data: [] as any[] };
    const counts = await expectedBoxes(plan, dates);

    // What this farm has been paid for its part of collected boxes.
    const { data: orders } = await supabaseAdmin.from('orders').select('id').eq('listing_id', plan.listing_id).limit(5000);
    const { data: paidShares } = orders && orders.length
      ? await supabaseAdmin
          .from('order_farm_shares')
          .select('payout_cents')
          .eq('farmer_id', farmerId)
          .in('order_id', orders.map((o) => o.id))
          .not('stripe_transfer_id', 'is', null)
      : { data: [] as any[] };

    boxes.push({
      planId: plan.id,
      name: plan.name,
      description: plan.description,
      boxType: plan.box_type || 'food',
      planStatus: plan.status,
      myStatus: me.status,
      inviteMessage: me.invite_message,
      host: { name: host?.farm_name || 'Host farm', slug: host?.slug || null },
      schedule: `${describeFrequency(plan)}${plan.pickup_window ? `, ${plan.pickup_window}` : ''}`,
      season: `${formatBoxDate(plan.season_start)} – ${formatBoxDate(plan.season_end)}`,
      dropoffNote: plan.dropoff_note || '',
      hostSubstitutes: Boolean(plan.host_substitutes),
      hostAddress: hostPickup?.address || null,
      myPart: {
        contribution: me.contribution,
        priceDollars: me.share_cents ? (me.share_cents / 100).toFixed(2) : '',
        includesEggs: me.includes_eggs,
        keepsDollars: me.share_cents ? (farmKeepsCents(me.share_cents, 'partner') / 100).toFixed(2) : null,
      },
      otherFarms: farms
        .filter((f) => f.farmer_id !== farmerId && (f.role === 'host' || f.status === 'accepted' || f.status === 'invited'))
        .map((f) => ({
          name: profiles.get(f.farmer_id)?.farm_name || 'Farm',
          role: f.role,
          status: f.status,
          contribution: f.contribution,
          priceDollars: (f.share_cents / 100).toFixed(2),
        })),
      earnedDollars: ((paidShares || []).reduce((sum, s) => sum + Number(s.payout_cents || 0), 0) / 100).toFixed(2),
      weeks: dates.map((date) => {
        const off = (skipped || []).find((s) => s.box_date === date);
        return {
          date,
          label: formatBoxDate(date, { long: true }),
          confirmByLabel: formatBoxDate(confirmByFor(date)),
          canAnswer: !off && canStillConfirm(date, today),
          answer: ((answers || []).find((a) => a.box_date === date)?.status as string) || null,
          calledOff: off ? off.skip_reason || 'The host called this week off.' : null,
          boxes: counts.get(date) || 0,
        };
      }),
    });
  }
  return { boxes };
}
