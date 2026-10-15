import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { farmCantSell, type CsaPlan } from '@/lib/csa';
import { boxCostCents } from '@/lib/csaTerms';
import { boxesLeft, firstBoxForNewMember, todayInArizona } from '@/lib/csaSchedule';
import { alertAdmin } from '@/lib/alerts';

export const dynamic = 'force-dynamic';

// What anyone can see of a farm's CSA plans, for its farm page and the join
// page: { farmId } for all of a farm's plans still running, or { planId } for
// one. Members, notes and anything private stay out.
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const UUID = /^[0-9a-f-]{36}$/i;

    let query = supabaseAdmin.from('csa_plans').select('*').neq('status', 'ended');
    if (typeof body.planId === 'string' && UUID.test(body.planId)) query = query.eq('id', body.planId);
    else if (typeof body.farmId === 'string' && UUID.test(body.farmId)) query = query.eq('farmer_id', body.farmId);
    else return NextResponse.json({ plans: [] });

    const today = todayInArizona();
    const { data: rows } = await query.gte('season_end', today).order('created_at', { ascending: true });
    const plans = (rows || []) as CsaPlan[];
    if (plans.length === 0) return NextResponse.json({ plans: [] });

    const farmIds = [...new Set(plans.map((p) => p.farmer_id))];
    const { data: farms } = await supabaseAdmin
      .from('seller_profiles')
      .select('id, farm_name, slug, location, avatar_url')
      .in('id', farmIds);
    const farmById = new Map((farms || []).map((f) => [f.id, f]));

    const result = [];
    for (const plan of plans) {
      const { count: members } = await supabaseAdmin
        .from('csa_members')
        .select('id', { count: 'exact', head: true })
        .eq('plan_id', plan.id)
        .neq('status', 'cancelled');
      const spotsLeft = plan.max_members == null ? null : Math.max(0, plan.max_members - (members || 0));
      const firstBox = firstBoxForNewMember(plan, today);
      const cantSell = await farmCantSell(plan.farmer_id);
      const farm = farmById.get(plan.farmer_id);

      result.push({
        id: plan.id,
        farmerId: plan.farmer_id,
        farmName: farm?.farm_name || 'Local Farm',
        farmSlug: farm?.slug || null,
        farmLocation: farm?.location || '',
        name: plan.name,
        description: plan.description,
        priceCents: plan.price_cents,
        cost: boxCostCents(plan.price_cents),
        frequency: plan.frequency,
        pickupWeekday: plan.pickup_weekday,
        pickupWindow: plan.pickup_window,
        seasonStart: plan.season_start,
        seasonEnd: plan.season_end,
        firstBox,
        boxesLeft: firstBox ? boxesLeft(plan, firstBox) : 0,
        spotsLeft,
        // Why it can't be joined right now, or null when it can.
        closedReason:
          plan.status !== 'open'
            ? 'This farm share isn’t taking new members right now.'
            : spotsLeft === 0
              ? 'This farm share is full.'
              : !firstBox
                ? 'There are no pickups left this season.'
                : cantSell
                  ? 'This farm isn’t taking new members just yet.'
                  : null,
      });
    }

    return NextResponse.json({ plans: result });
  } catch (err: any) {
    console.error('csa plans error:', err);
    await alertAdmin('CSA plans', err);
    return NextResponse.json({ error: 'Could not load farm shares.' }, { status: 500 });
  }
}
