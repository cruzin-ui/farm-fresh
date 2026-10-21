import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getRequestUser } from '@/lib/apiAuth';
import { isSellerSuspended } from '@/lib/accountBlocks';
import { SELLER_TERMS_VERSION } from '@/lib/sellerTerms';
import { siteUrlFrom } from '@/lib/csa';
import { formatBoxDate, todayInArizona } from '@/lib/csaSchedule';
import {
  APPEARANCE_KINDS,
  MAX_ACTIVE_APPEARANCES,
  appearanceDates,
  describeSchedule,
  formatTimes,
  isAppearanceDate,
  type Appearance,
} from '@/lib/appearances';
import {
  announceAppearance,
  cancelMarketOrders,
  farmAppearances,
  openMarketOrders,
  placeCoordinates,
  readAppearanceInput,
} from '@/lib/appearancesServer';
import { alertAdmin } from '@/lib/alerts';

export const dynamic = 'force-dynamic';

// A farm's "Where to find us" posts, from the Seller Dashboard.
//   { action: 'get' }
//   { action: 'save', appearance: {...}, acceptTerms? }   — add or edit
//   { action: 'remove', id, reason, cancelOrders? }        — take it down
//   { action: 'skip' | 'unskip', id, date, reason?, cancelOrders? } — one week of a weekly post
// Removing a post, or skipping a date, that buyers have orders to pick up at
// needs cancelOrders: true; those orders are then cancelled and refunded.
export async function POST(request: Request) {
  try {
    const user = await getRequestUser(request);
    if (!user) return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 });
    const body = await request.json().catch(() => ({}));
    const today = todayInArizona();
    const siteUrl = siteUrlFrom(request);

    if (body.action === 'get') return NextResponse.json(await overview(user.id, today));

    if (body.action === 'save') {
      if (await isSellerSuspended(user.id)) {
        return NextResponse.json({ error: "Your seller account is suspended, so you can't post right now. Contact us if you'd like to talk about it." }, { status: 403 });
      }
      const read = readAppearanceInput(body.appearance, today);
      if ('error' in read) return NextResponse.json({ error: read.error }, { status: 400 });
      const values = read.values;

      // Same as a first listing: the Seller Terms are agreed to once.
      const { data: acceptance } = await supabaseAdmin.from('seller_terms_acceptances').select('user_id').eq('user_id', user.id).maybeSingle();
      if (!acceptance) {
        if (body.acceptTerms !== true) return NextResponse.json({ error: 'Please read and agree to the Seller Terms first.' }, { status: 400 });
        await supabaseAdmin.from('seller_terms_acceptances').upsert({ user_id: user.id, accepted_at: new Date().toISOString(), terms_version: SELLER_TERMS_VERSION });
      }

      const id = typeof body.appearance?.id === 'string' ? body.appearance.id : '';
      const now = new Date().toISOString();
      if (id) {
        const { data: existing } = await supabaseAdmin
          .from('farm_appearances')
          .select('*')
          .eq('id', id)
          .eq('farmer_id', user.id)
          .eq('status', 'active')
          .maybeSingle();
        if (!existing) return NextResponse.json({ error: 'Post not found.' }, { status: 404 });
        // Buyers who ordered for pickup here were told where and when.
        const moved = ['address', 'zip', 'starts_on', 'ends_on', 'repeats_weekly', 'start_time', 'end_time'].some(
          (field) => (existing as any)[field] !== (values as any)[field]
        );
        if (moved && (await openMarketOrders(existing.id)).length > 0) {
          return NextResponse.json(
            { error: 'Buyers have orders to pick up here, so the place, dates and times can’t change. Skip a date, or take the post down and add a new one.' },
            { status: 409 }
          );
        }
        const { error } = await supabaseAdmin
          .from('farm_appearances')
          .update({ ...values, ...(values.zip !== existing.zip ? await placeCoordinates(values.zip) : {}), updated_at: now })
          .eq('id', existing.id);
        if (error) throw error;
        return NextResponse.json({ ...(await overview(user.id, today)), notice: 'Saved.' });
      }

      const { count } = await supabaseAdmin
        .from('farm_appearances')
        .select('id', { count: 'exact', head: true })
        .eq('farmer_id', user.id)
        .eq('status', 'active')
        .gte('ends_on', today);
      if ((count || 0) >= MAX_ACTIVE_APPEARANCES) {
        return NextResponse.json({ error: `You can have up to ${MAX_ACTIVE_APPEARANCES} posts at once. Take an old one down first.` }, { status: 409 });
      }
      const { data: created, error } = await supabaseAdmin
        .from('farm_appearances')
        .insert({ ...values, ...(await placeCoordinates(values.zip)), farmer_id: user.id })
        .select('*')
        .single();
      if (error) throw error;
      const emailed = await announceAppearance(created as Appearance, siteUrl);
      return NextResponse.json({
        ...(await overview(user.id, today)),
        notice: emailed ? 'Posted. Followers who asked to hear about your markets have been emailed.' : 'Posted. It now shows on your farm page.',
      });
    }

    // The rest act on one of the farm's own posts.
    const { data: row } = await supabaseAdmin
      .from('farm_appearances')
      .select('*')
      .eq('id', typeof body.id === 'string' ? body.id : '')
      .eq('farmer_id', user.id)
      .eq('status', 'active')
      .maybeSingle();
    const appearance = row as Appearance | null;
    if (!appearance) return NextResponse.json({ error: 'Post not found.' }, { status: 404 });
    const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 300) : '';

    if (body.action === 'remove') {
      const orders = await openMarketOrders(appearance.id);
      if (orders.length > 0 && body.cancelOrders !== true) {
        return NextResponse.json({ needsConfirm: true, orders: orders.length }, { status: 409 });
      }
      const cancelled = await cancelMarketOrders(appearance, null, reason, siteUrl);
      const { error } = await supabaseAdmin
        .from('farm_appearances')
        .update({ status: 'removed', removed_by: 'farm', removed_reason: reason || null, updated_at: new Date().toISOString() })
        .eq('id', appearance.id);
      if (error) throw error;
      return NextResponse.json({
        ...(await overview(user.id, today)),
        notice: cancelled.cancelled ? `Taken down. ${cancelled.cancelled} order${cancelled.cancelled === 1 ? ' was' : 's were'} cancelled and refunded.` : 'Taken down.',
      });
    }

    if (body.action === 'skip' || body.action === 'unskip') {
      const date = String(body.date || '');
      if (!appearance.repeats_weekly || !isAppearanceDate(appearance, date) || date < today) {
        return NextResponse.json({ error: 'That isn’t an upcoming date of this weekly post.' }, { status: 400 });
      }
      if (body.action === 'unskip') {
        await supabaseAdmin.from('farm_appearance_skips').delete().eq('appearance_id', appearance.id).eq('skip_date', date);
        return NextResponse.json({ ...(await overview(user.id, today)), notice: `You're back on for ${formatBoxDate(date)}.` });
      }
      const orders = await openMarketOrders(appearance.id, date);
      if (orders.length > 0 && body.cancelOrders !== true) {
        return NextResponse.json({ needsConfirm: true, orders: orders.length }, { status: 409 });
      }
      const { error } = await supabaseAdmin
        .from('farm_appearance_skips')
        .upsert({ appearance_id: appearance.id, skip_date: date, reason });
      if (error) throw error;
      const cancelled = await cancelMarketOrders(appearance, date, reason, siteUrl);
      return NextResponse.json({
        ...(await overview(user.id, today)),
        notice: `Marked as not there on ${formatBoxDate(date)}.${cancelled.cancelled ? ` ${cancelled.cancelled} order${cancelled.cancelled === 1 ? ' was' : 's were'} cancelled and refunded.` : ''}`,
      });
    }

    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  } catch (err: any) {
    console.error('appearances error:', err);
    await alertAdmin('farm appearances', err);
    return NextResponse.json({ error: err.message || 'Something went wrong. Please try again.' }, { status: 500 });
  }
}

// The farm's posts, each with its next dates and how many orders are booked
// for pickup on each.
async function overview(farmerId: string, today: string) {
  const posts = await farmAppearances(farmerId, today);
  const result = [];
  for (const a of posts) {
    const orders = await openMarketOrders(a.id);
    const dates = appearanceDates(a, today, 6);
    result.push({
      id: a.id,
      kind: a.kind,
      kindLabel: APPEARANCE_KINDS[a.kind as keyof typeof APPEARANCE_KINDS] || 'Event',
      name: a.name,
      address: a.address,
      city: a.city,
      zip: a.zip,
      startsOn: a.starts_on,
      endsOn: a.ends_on,
      repeatsWeekly: a.repeats_weekly,
      startTime: a.start_time,
      endTime: a.end_time,
      note: a.note,
      takesOrders: a.takes_orders,
      schedule: describeSchedule(a),
      times: formatTimes(a),
      openOrders: orders.length,
      dates: dates.map((date) => ({
        date,
        label: formatBoxDate(date),
        skipped: a.skipped.includes(date),
        orders: orders.filter((o) => o.market_date === date).length,
      })),
    });
  }
  return { appearances: result };
}
