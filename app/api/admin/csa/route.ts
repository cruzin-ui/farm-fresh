import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getRequestAdmin } from '@/lib/apiAuth';
import { addDays, todayInArizona } from '@/lib/csaSchedule';
import { alertAdmin } from '@/lib/alerts';

export const dynamic = 'force-dynamic';

// The CSA overview on the admin page: every Farm Box with its members, and
// the last two weeks' charges, failed ones first.
export async function POST(request: Request) {
  try {
    const admin = await getRequestAdmin(request);
    if (!admin) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 });

    const today = todayInArizona();
    const { data: plans } = await supabaseAdmin.from('csa_plans').select('*').order('created_at', { ascending: false });
    // Shared boxes: the partner farms in each.
    const { data: partnerRows } = await supabaseAdmin
      .from('csa_plan_farms')
      .select('plan_id, farmer_id, status')
      .eq('role', 'partner')
      .in('status', ['invited', 'accepted']);
    const farmerIds = [...new Set([...(plans || []).map((p) => p.farmer_id), ...(partnerRows || []).map((r) => r.farmer_id)])];
    const { data: farms } = farmerIds.length
      ? await supabaseAdmin.from('seller_profiles').select('id, farm_name').in('id', farmerIds)
      : { data: [] as any[] };
    const farmName = new Map((farms || []).map((f) => [f.id, f.farm_name]));

    const { data: members } = await supabaseAdmin.from('csa_members').select('id, plan_id, status, buyer_email, card_label');
    const { data: boxes } = await supabaseAdmin
      .from('csa_boxes')
      .select('member_id, plan_id, box_date, status, attempts, last_error, order_id, updated_at')
      .gte('box_date', addDays(today, -14))
      .order('box_date', { ascending: true });
    const memberById = new Map((members || []).map((m) => [m.id, m]));
    const planById = new Map((plans || []).map((p) => [p.id, p]));

    return NextResponse.json({
      plans: (plans || []).map((p) => {
        const theirs = (members || []).filter((m) => m.plan_id === p.id);
        const partners = (partnerRows || []).filter((r) => r.plan_id === p.id);
        const label = [p.kind === 'shared' ? 'shared' : '', p.box_type === 'flowers' ? 'flowers' : '', p.status === 'forming' ? 'forming' : '']
          .filter(Boolean)
          .join(', ');
        return {
          id: p.id,
          name: label ? `${p.name} (${label})` : p.name,
          farmId: p.farmer_id,
          farm: partners.length
            ? `${farmName.get(p.farmer_id) || 'Unknown farm'} (host) + ${partners
                .map((r) => `${farmName.get(r.farmer_id) || 'farm'}${r.status === 'invited' ? ' (invited)' : ''}`)
                .join(', ')}`
            : farmName.get(p.farmer_id) || 'Unknown farm',
          status: p.status,
          priceCents: p.price_cents,
          frequency: p.frequency,
          pickupWeekday: p.pickup_weekday,
          seasonStart: p.season_start,
          seasonEnd: p.season_end,
          active: theirs.filter((m) => m.status === 'active').length,
          paused: theirs.filter((m) => m.status === 'paused').length,
          cancelled: theirs.filter((m) => m.status === 'cancelled').length,
        };
      }),
      boxes: (boxes || [])
        .filter((b) => ['paid', 'failed', 'farm_skipped', 'charging'].includes(b.status))
        .map((b) => ({
          ...b,
          plan: planById.get(b.plan_id)?.name || '',
          farm: farmName.get(planById.get(b.plan_id)?.farmer_id) || '',
          buyer: memberById.get(b.member_id)?.buyer_email || '',
          card: memberById.get(b.member_id)?.card_label || '',
        }))
        .sort((a, b) => Number(b.status === 'failed') - Number(a.status === 'failed')),
    });
  } catch (err: any) {
    console.error('admin csa error:', err);
    await alertAdmin('admin CSA overview', err);
    return NextResponse.json({ error: 'Could not load Farm Boxes.' }, { status: 500 });
  }
}
