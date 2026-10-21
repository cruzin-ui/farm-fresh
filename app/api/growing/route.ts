import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getRequestUser } from '@/lib/apiAuth';
import { isSellerSuspended } from '@/lib/accountBlocks';
import { SELLER_TERMS_VERSION } from '@/lib/sellerTerms';
import { isAllowedCategory, PRODUCE_ONLY_NOTICE } from '@/lib/categories';
import { addDays, isDay, todayInArizona } from '@/lib/csaSchedule';
import { MAX_GROWING, describeExpected, stillShown } from '@/lib/growing';
import { alertAdmin } from '@/lib/alerts';

export const dynamic = 'force-dynamic';

// A farm's "What we're growing" list, from the Seller Dashboard.
//   { action: 'get' }
//   { action: 'save', crop: {...}, acceptTerms? }  — add or edit
//   { action: 'remove', id }
// The same rules as listings: a suspended farm can't post, the Seller Terms
// are agreed to first, and only categories the site sells are allowed.
export async function POST(request: Request) {
  try {
    const user = await getRequestUser(request);
    if (!user) return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 });
    const body = await request.json().catch(() => ({}));
    const today = todayInArizona();

    if (body.action === 'get') return NextResponse.json({ crops: await ownCrops(user.id, today) });

    if (body.action === 'save') {
      if (await isSellerSuspended(user.id)) {
        return NextResponse.json({ error: "Your seller account is suspended, so you can't post right now." }, { status: 403 });
      }
      const input = (body.crop && typeof body.crop === 'object' ? body.crop : {}) as Record<string, unknown>;
      const text = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
      const name = text(input.name, 80);
      const variety = text(input.variety, 60);
      const category = text(input.category, 40);
      const from = text(input.expectedFrom, 10);
      const until = text(input.expectedUntil, 10);
      const note = text(input.note, 200);
      if (name.length < 2) return NextResponse.json({ error: 'Enter what you’re growing, e.g. "Heirloom Tomatoes".' }, { status: 400 });
      if (!isAllowedCategory(category)) return NextResponse.json({ error: `Choose one of the listed categories. ${PRODUCE_ONLY_NOTICE}` }, { status: 400 });
      if (!isDay(from)) return NextResponse.json({ error: 'Choose roughly when it should be ready.' }, { status: 400 });
      if (from > addDays(today, 366)) return NextResponse.json({ error: 'Choose a date within the next year.' }, { status: 400 });
      if (until && (!isDay(until) || until < from)) return NextResponse.json({ error: '“Until” has to be after the expected date.' }, { status: 400 });

      const { data: acceptance } = await supabaseAdmin.from('seller_terms_acceptances').select('user_id').eq('user_id', user.id).maybeSingle();
      if (!acceptance) {
        if (body.acceptTerms !== true) return NextResponse.json({ error: 'Please read and agree to the Seller Terms first.' }, { status: 400 });
        await supabaseAdmin.from('seller_terms_acceptances').upsert({ user_id: user.id, accepted_at: new Date().toISOString(), terms_version: SELLER_TERMS_VERSION });
      }

      const values = { name, variety, category, expected_from: from, expected_until: until || null, note, updated_at: new Date().toISOString() };
      const id = typeof input.id === 'string' ? input.id : '';
      if (id) {
        const { data: updated, error } = await supabaseAdmin
          .from('growing_crops')
          .update({ ...values, status: 'growing' })
          .eq('id', id)
          .eq('farmer_id', user.id)
          .neq('status', 'removed')
          .select('id');
        if (error) throw error;
        if (!updated || updated.length === 0) return NextResponse.json({ error: 'Crop not found.' }, { status: 404 });
      } else {
        const crops = await ownCrops(user.id, today);
        if (crops.length >= MAX_GROWING) {
          return NextResponse.json({ error: `You can show up to ${MAX_GROWING} crops. Remove one that’s done first.` }, { status: 409 });
        }
        const { error } = await supabaseAdmin.from('growing_crops').insert({ ...values, farmer_id: user.id });
        if (error) throw error;
      }
      return NextResponse.json({ crops: await ownCrops(user.id, today) });
    }

    if (body.action === 'remove') {
      const { error } = await supabaseAdmin
        .from('growing_crops')
        .update({ status: 'removed', removed_by: 'farm', updated_at: new Date().toISOString() })
        .eq('id', String(body.id || ''))
        .eq('farmer_id', user.id);
      if (error) throw error;
      return NextResponse.json({ crops: await ownCrops(user.id, today) });
    }

    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  } catch (err: any) {
    console.error('growing error:', err);
    await alertAdmin('growing crops', err);
    return NextResponse.json({ error: err.message || 'Something went wrong. Please try again.' }, { status: 500 });
  }
}

// The farm's crops still showing (or overdue), soonest first.
async function ownCrops(farmerId: string, today: string) {
  const { data } = await supabaseAdmin
    .from('growing_crops')
    .select('*')
    .eq('farmer_id', farmerId)
    .eq('status', 'growing')
    .order('expected_from', { ascending: true });
  return (data || []).map((c) => ({
    id: c.id,
    name: c.name,
    variety: c.variety,
    category: c.category,
    expectedFrom: c.expected_from,
    expectedUntil: c.expected_until,
    note: c.note,
    expected: describeExpected(c.expected_from, c.expected_until, today),
    // Past its window by more than a few weeks: no longer shown to buyers.
    hidden: !stillShown(c, today),
  }));
}
