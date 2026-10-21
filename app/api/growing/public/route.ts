import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { isSellerSuspended } from '@/lib/accountBlocks';
import { todayInArizona } from '@/lib/csaSchedule';
import { describeExpected, stillShown } from '@/lib/growing';
import { alertAdmin } from '@/lib/alerts';

export const dynamic = 'force-dynamic';

// What a farm is growing, for anyone: { farmerId }. Shown, like listings, only
// once the farm can be paid and while it isn't suspended.
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const farmerId = typeof body.farmerId === 'string' && /^[0-9a-f-]{36}$/i.test(body.farmerId) ? body.farmerId : '';
    if (!farmerId) return NextResponse.json({ crops: [] });
    const { data: profile } = await supabaseAdmin.from('seller_profiles').select('stripe_onboarding_complete').eq('id', farmerId).maybeSingle();
    if (!profile?.stripe_onboarding_complete || (await isSellerSuspended(farmerId))) return NextResponse.json({ crops: [] });

    const today = todayInArizona();
    const { data } = await supabaseAdmin
      .from('growing_crops')
      .select('*')
      .eq('farmer_id', farmerId)
      .eq('status', 'growing')
      .order('expected_from', { ascending: true })
      .limit(50);
    return NextResponse.json({
      crops: (data || [])
        .filter((c) => stillShown(c, today))
        .map((c) => ({
          id: c.id,
          name: c.name,
          variety: c.variety,
          category: c.category,
          note: c.note,
          expected: describeExpected(c.expected_from, c.expected_until, today),
        })),
    });
  } catch (err: any) {
    console.error('public growing error:', err);
    await alertAdmin('public growing crops', err);
    return NextResponse.json({ crops: [] });
  }
}
