import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { farmCantSell, type CsaPlan } from '@/lib/csa';
import { boxCostCents } from '@/lib/csaTerms';
import { boxesLeft, firstBoxForNewMember, todayInArizona } from '@/lib/csaSchedule';
import { alertAdmin } from '@/lib/alerts';
import { activeFarms, farmProfiles, isShared } from '@/lib/sharedBoxes';

export const dynamic = 'force-dynamic';

// What anyone can see of Farm Boxes: { farmId } for all of a farm's Farm
// Boxes still running (its farm page), { planId } for one (the join page), or
// { all: true } for every Farm Box someone can sign up for right now (Browse
// and the home page strip). Members, notes and anything private stay out.
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const UUID = /^[0-9a-f-]{36}$/i;

    // A shared box still gathering its farms isn't shown yet.
    let query = supabaseAdmin.from('csa_plans').select('*').in('status', ['open', 'closed']);
    if (typeof body.planId === 'string' && UUID.test(body.planId)) query = query.eq('id', body.planId);
    else if (typeof body.farmId === 'string' && UUID.test(body.farmId)) query = query.eq('farmer_id', body.farmId);
    else if (body.all === true) query = query.eq('status', 'open');
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
    const { data: photoRows } = await supabaseAdmin
      .from('produce_listings')
      .select('id, image_url, zip_code, location_name, latitude, longitude')
      .in('id', plans.map((p) => p.listing_id));
    const photoByListing = new Map((photoRows || []).map((l) => [l.id, l.image_url as string | null]));
    // Where each Farm Box is picked up: its hidden listing moves with the
    // farm's pickup address, so it has the zip code and map position.
    const placeByListing = new Map((photoRows || []).map((l) => [l.id, l]));

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
      // A shared box: every farm in it and what each puts in, the host first.
      const sharedFarms = isShared(plan) ? await activeFarms(plan.id) : [];
      const sharedProfiles = await farmProfiles(sharedFarms.map((f) => f.farmer_id));

      result.push({
        id: plan.id,
        farmerId: plan.farmer_id,
        farmName: farm?.farm_name || 'Local Farm',
        farmSlug: farm?.slug || null,
        farmLocation: placeByListing.get(plan.listing_id)?.location_name || farm?.location || '',
        farmAvatar: farm?.avatar_url || null,
        zipCode: String(placeByListing.get(plan.listing_id)?.zip_code || '').slice(0, 5),
        latitude: placeByListing.get(plan.listing_id)?.latitude ?? null,
        longitude: placeByListing.get(plan.listing_id)?.longitude ?? null,
        name: plan.name,
        description: plan.description,
        imageUrl: photoByListing.get(plan.listing_id) || null,
        priceCents: plan.price_cents,
        cost: boxCostCents(plan.price_cents),
        frequency: plan.frequency,
        pickupWeekday: plan.pickup_weekday,
        pickupWindow: plan.pickup_window,
        seasonStart: plan.season_start,
        seasonEnd: plan.season_end,
        boxType: plan.box_type || 'food',
        kind: plan.kind || 'solo',
        farms: sharedFarms.map((f) => ({
          id: f.farmer_id,
          role: f.role,
          name: sharedProfiles.get(f.farmer_id)?.farm_name || 'Local Farm',
          slug: sharedProfiles.get(f.farmer_id)?.slug || null,
          contribution: f.contribution,
          includesEggs: f.includes_eggs,
        })),
        firstBox,
        boxesLeft: firstBox ? boxesLeft(plan, firstBox) : 0,
        spotsLeft,
        // Why it can't be joined right now, or null when it can.
        closedReason:
          plan.status !== 'open'
            ? 'This Farm Box isn’t taking new members right now.'
            : spotsLeft === 0
              ? 'This Farm Box is full.'
              : !firstBox
                ? 'There are no pickups left this season.'
                : cantSell
                  ? 'This farm isn’t taking new members just yet.'
                  : null,
      });
    }

    return NextResponse.json({ plans: body.all === true ? result.filter((p) => !p.closedReason) : result });
  } catch (err: any) {
    console.error('csa plans error:', err);
    await alertAdmin('CSA plans', err);
    return NextResponse.json({ error: 'Could not load Farm Boxes.' }, { status: 500 });
  }
}
