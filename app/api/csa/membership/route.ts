import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getRequestUser } from '@/lib/apiAuth';
import {
  getOrCreateStripeCustomer,
  startSavingCard,
  finishSavingCard,
  cancelMembership,
  chargeBox,
  emailFarm,
  maskEmail,
  siteUrlFrom,
  type CsaPlan,
  type CsaMember,
  type CsaBox,
} from '@/lib/csa';
import { boxCostCents } from '@/lib/csaTerms';
import {
  boxDates,
  canStillSkip,
  chargeDateFor,
  isBoxDate,
  todayInArizona,
  addDays,
  formatBoxDate,
  memberGetsBox,
} from '@/lib/csaSchedule';
import { alertAdmin } from '@/lib/alerts';

export const dynamic = 'force-dynamic';

const UPCOMING = 8;

// A signed-in member's own Farm Boxes.
//   { action: 'list' }                          — memberships and upcoming boxes
//   { action: 'skip' | 'unskip', memberId, boxDate }
//   { action: 'pause' | 'resume', memberId }
//   { action: 'cancel', memberId, reason? }
//   { action: 'card_start' }                    — start saving a new card
//   { action: 'card_finish', setupIntentId }    — use it for every membership,
//                                                 and retry any box it failed on
export async function POST(request: Request) {
  try {
    const user = await getRequestUser(request);
    if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const siteUrl = siteUrlFrom(request);
    const today = todayInArizona();

    if (body.action === 'list') {
      return NextResponse.json({ memberships: await listMemberships(user.id, today) });
    }

    if (body.action === 'card_start') {
      const customerId = await getOrCreateStripeCustomer(user);
      const clientSecret = await startSavingCard(customerId, { purpose: 'csa_card_update', buyer_id: user.id });
      return NextResponse.json({ clientSecret });
    }

    if (body.action === 'card_finish') {
      const customerId = await getOrCreateStripeCustomer(user);
      const saved = await finishSavingCard(body.setupIntentId, customerId);
      if (!saved) return NextResponse.json({ error: "Your card wasn't saved. Please try again." }, { status: 400 });

      const { error } = await supabaseAdmin
        .from('csa_members')
        .update({ stripe_payment_method_id: saved.paymentMethodId, card_label: saved.cardLabel, stripe_customer_id: customerId })
        .eq('buyer_id', user.id)
        .neq('status', 'cancelled');
      if (error) throw error;

      // A box whose charge failed and is still before its pickup is charged
      // to the new card straight away.
      const retried = await retryFailedBoxes(user.id, today, siteUrl);
      return NextResponse.json({ success: true, cardLabel: saved.cardLabel, retried });
    }

    // Everything else is about one of their memberships.
    const { data: memberRow } = await supabaseAdmin
      .from('csa_members')
      .select('*')
      .eq('id', typeof body.memberId === 'string' ? body.memberId : '')
      .eq('buyer_id', user.id)
      .maybeSingle();
    const member = memberRow as CsaMember | null;
    if (!member) return NextResponse.json({ error: 'Membership not found.' }, { status: 404 });
    const { data: planRow } = await supabaseAdmin.from('csa_plans').select('*').eq('id', member.plan_id).single();
    const plan = planRow as CsaPlan;

    if (member.status === 'cancelled') {
      return NextResponse.json({ error: 'This membership has been cancelled.' }, { status: 409 });
    }

    if (body.action === 'skip' || body.action === 'unskip') {
      const boxDate = String(body.boxDate || '');
      if (!isBoxDate(plan, boxDate)) return NextResponse.json({ error: "That isn't one of this Farm Box's pickup dates." }, { status: 400 });
      if (!canStillSkip(boxDate, today)) {
        return NextResponse.json(
          { error: 'This box has already been charged. You can cancel it under My Purchases instead.' },
          { status: 409 }
        );
      }

      const { data: box } = await supabaseAdmin
        .from('csa_boxes')
        .select('*')
        .eq('member_id', member.id)
        .eq('box_date', boxDate)
        .maybeSingle();

      if (body.action === 'skip') {
        if (box && !['reminded', 'skipped'].includes(box.status)) {
          return NextResponse.json({ error: "This box can't be skipped now." }, { status: 409 });
        }
        const { error } = box
          ? await supabaseAdmin.from('csa_boxes').update({ status: 'skipped', updated_at: new Date().toISOString() }).eq('id', box.id)
          : await supabaseAdmin.from('csa_boxes').insert({ member_id: member.id, plan_id: plan.id, box_date: boxDate, status: 'skipped' });
        if (error) throw error;
      } else if (box?.status === 'skipped') {
        // Back to how it was: reminded if the reminder had gone, else nothing.
        const { error } = box.reminder_sent_at
          ? await supabaseAdmin.from('csa_boxes').update({ status: 'reminded', updated_at: new Date().toISOString() }).eq('id', box.id)
          : await supabaseAdmin.from('csa_boxes').delete().eq('id', box.id);
        if (error) throw error;
      }
      return NextResponse.json({ memberships: await listMemberships(user.id, today) });
    }

    if (body.action === 'pause' || body.action === 'resume') {
      const { error } = await supabaseAdmin
        .from('csa_members')
        .update({ status: body.action === 'pause' ? 'paused' : 'active' })
        .eq('id', member.id);
      if (error) throw error;
      await emailFarm(
        plan.farmer_id,
        `${body.action === 'pause' ? 'A member paused' : 'A member is back in'} ${plan.name}`,
        `<p>${maskEmail(member.buyer_email)} has ${body.action === 'pause' ? 'paused their boxes for now' : 'resumed their boxes'} in <strong>${plan.name}</strong>. Your members list in the Seller Dashboard shows who is getting a box each week.</p>`
      );
      return NextResponse.json({ memberships: await listMemberships(user.id, today) });
    }

    if (body.action === 'cancel') {
      const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
      await cancelMembership({ member, plan, reason, by: 'member', siteUrl });
      return NextResponse.json({ memberships: await listMemberships(user.id, today) });
    }

    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  } catch (err: any) {
    console.error('csa membership error:', err);
    await alertAdmin('CSA membership', err);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}

async function retryFailedBoxes(buyerId: string, today: string, siteUrl: string) {
  const { data: members } = await supabaseAdmin.from('csa_members').select('*').eq('buyer_id', buyerId).eq('status', 'active');
  let paid = 0;
  for (const member of (members || []) as CsaMember[]) {
    const { data: failed } = await supabaseAdmin
      .from('csa_boxes')
      .select('box_date')
      .eq('member_id', member.id)
      .eq('status', 'failed')
      .gt('box_date', today);
    for (const box of failed || []) {
      // Only while there is still time for the farm to pack it.
      if (today < chargeDateFor(box.box_date) || today >= box.box_date) continue;
      const { data: plan } = await supabaseAdmin.from('csa_plans').select('*').eq('id', member.plan_id).single();
      if (!plan || plan.status === 'ended') continue;
      const outcome = await chargeBox({ plan: plan as CsaPlan, member, boxDate: box.box_date, siteUrl, today });
      if (outcome === 'paid') paid += 1;
    }
  }
  return paid;
}

// Each of the buyer's memberships (newest first, cancelled ones last) with
// its next pickups and what is happening with each.
async function listMemberships(buyerId: string, today: string) {
  const { data: members } = await supabaseAdmin
    .from('csa_members')
    .select('*')
    .eq('buyer_id', buyerId)
    .order('created_at', { ascending: false });
  if (!members || members.length === 0) return [];

  const planIds = [...new Set(members.map((m) => m.plan_id))];
  const { data: plans } = await supabaseAdmin.from('csa_plans').select('*').in('id', planIds);
  const planById = new Map((plans || []).map((p) => [p.id, p as CsaPlan]));
  const farmerIds = [...new Set((plans || []).map((p) => p.farmer_id))];
  const { data: farms } = await supabaseAdmin.from('seller_profiles').select('id, farm_name, slug').in('id', farmerIds);
  const farmById = new Map((farms || []).map((f) => [f.id, f]));

  const result = [];
  for (const member of members as CsaMember[]) {
    const plan = planById.get(member.plan_id);
    if (!plan) continue;
    const farm = farmById.get(plan.farmer_id);
    const live = member.status !== 'cancelled' && plan.status !== 'ended';

    // Recent and upcoming pickups: a week back (so a paid box still waiting to
    // be collected shows) and the next few.
    const dates = live
      ? boxDates(plan, addDays(today, -7), UPCOMING + 1).filter((d) => memberGetsBox(member.created_at, d))
      : [];
    const { data: boxRows } = dates.length
      ? await supabaseAdmin.from('csa_boxes').select('*').eq('member_id', member.id).in('box_date', dates)
      : { data: [] as CsaBox[] };
    const boxByDate = new Map((boxRows || []).map((b: CsaBox) => [b.box_date, b]));
    const { data: weeks } = dates.length
      ? await supabaseAdmin.from('csa_box_weeks').select('box_date, note, skipped, skip_reason').eq('plan_id', plan.id).in('box_date', dates)
      : { data: [] as any[] };
    const weekByDate = new Map((weeks || []).map((w) => [w.box_date, w]));

    result.push({
      id: member.id,
      status: member.status,
      cardLabel: member.card_label,
      cost: boxCostCents(member.price_cents),
      joinedAt: member.created_at,
      cancelledAt: (member as any).cancelled_at || null,
      plan: {
        id: plan.id,
        name: plan.name,
        description: plan.description,
        frequency: plan.frequency,
        pickupWeekday: plan.pickup_weekday,
        pickupWindow: plan.pickup_window,
        seasonEnd: plan.season_end,
        status: plan.status,
      },
      farm: { id: plan.farmer_id, name: farm?.farm_name || 'Local Farm', slug: farm?.slug || null },
      boxes: dates
        .map((date) => {
          const box = boxByDate.get(date);
          const week = weekByDate.get(date);
          const charged = box?.status === 'paid';
          // A past date matters only if its box was paid (it may still be
          // waiting to be collected).
          if (date < today && !charged) return null;
          let state: string;
          if (week?.skipped || box?.status === 'farm_skipped') state = 'farm_skipped';
          else if (box?.status === 'paid') state = 'paid';
          else if (box?.status === 'skipped') state = 'skipped';
          else if (box?.status === 'failed') state = today < date ? 'failed' : 'missed';
          else if (member.status === 'paused') state = 'paused';
          else if (!canStillSkip(date, today)) state = 'charging';
          else state = 'upcoming';
          return {
            date,
            label: formatBoxDate(date),
            chargeDate: chargeDateFor(date),
            state,
            canSkip: member.status === 'active' && canStillSkip(date, today) && ['upcoming', 'skipped'].includes(state),
            orderId: box?.order_id || null,
            note: week?.note || '',
            farmReason: week?.skip_reason || (box?.status === 'farm_skipped' ? box.last_error : '') || '',
            error: box?.status === 'failed' ? box.last_error || '' : '',
          };
        })
        .filter(Boolean)
        .slice(0, UPCOMING),
    });
  }

  // Live memberships first.
  return result.sort((a, b) => Number(a.status === 'cancelled') - Number(b.status === 'cancelled'));
}
