import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getRequestAdmin } from '@/lib/apiAuth';
import { logAdminAction } from '@/lib/adminLog';
import { siteUrlFrom } from '@/lib/csa';
import { todayInArizona } from '@/lib/csaSchedule';
import { APPEARANCE_KINDS, describeSchedule, type Appearance } from '@/lib/appearances';
import { cancelMarketOrders, openMarketOrders } from '@/lib/appearancesServer';
import { sendEmail, escapeHtml } from '@/lib/email';
import { alertAdmin } from '@/lib/alerts';
import { describeExpected } from '@/lib/growing';

export const dynamic = 'force-dynamic';

// Farms' "Where to find us" posts and "What we're growing" crops, for the
// admin page. As with listings, an admin can take either down; orders booked
// for pickup at a post are refunded.
//   { action: 'list' }
//   { action: 'remove', id, reason }          — a market or event post
//   { action: 'remove_crop', id, reason }     — a growing crop
export async function POST(request: Request) {
  try {
    const admin = await getRequestAdmin(request);
    if (!admin) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 });
    const body = await request.json().catch(() => ({}));
    const today = todayInArizona();

    if (body.action === 'remove_crop') {
      const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 300) : '';
      if (!reason) return NextResponse.json({ error: 'Give the farm a reason.' }, { status: 400 });
      const { data: crop } = await supabaseAdmin.from('growing_crops').select('*').eq('id', String(body.id || '')).eq('status', 'growing').maybeSingle();
      if (!crop) return NextResponse.json({ error: 'Crop not found.' }, { status: 404 });
      await supabaseAdmin
        .from('growing_crops')
        .update({ status: 'removed', removed_by: 'admin', updated_at: new Date().toISOString() })
        .eq('id', crop.id);
      await logAdminAction(admin.email || 'admin', 'Removed a growing crop', crop.name, reason);
      const { data: farmer } = await supabaseAdmin.auth.admin.getUserById(crop.farmer_id);
      if (farmer?.user?.email) {
        await sendEmail({
          to: farmer.user.email,
          subject: `"${crop.name}" was removed from what you're growing`,
          html: `<div style="font-family: sans-serif; max-width: 480px;"><p>We've removed <strong>${escapeHtml(crop.name)}</strong> from the "What we're growing" list on your farm page: ${escapeHtml(reason)}</p><p>If you think this is a mistake, reply to this email or contact us.</p></div>`,
        });
      }
    }

    if (body.action === 'remove') {
      const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 300) : '';
      if (!reason) return NextResponse.json({ error: 'Give the farm a reason.' }, { status: 400 });
      const { data: row } = await supabaseAdmin.from('farm_appearances').select('*').eq('id', String(body.id || '')).eq('status', 'active').maybeSingle();
      const appearance = row as Appearance | null;
      if (!appearance) return NextResponse.json({ error: 'Post not found.' }, { status: 404 });
      const cancelled = await cancelMarketOrders(appearance, null, 'it was taken down by Farm Fresh Direct', siteUrlFrom(request));
      await supabaseAdmin
        .from('farm_appearances')
        .update({ status: 'removed', removed_by: 'admin', removed_reason: reason, updated_at: new Date().toISOString() })
        .eq('id', appearance.id);
      await logAdminAction(admin.email || 'admin', 'Removed a market/event post', appearance.name, reason);
      const { data: farmer } = await supabaseAdmin.auth.admin.getUserById(appearance.farmer_id);
      if (farmer?.user?.email) {
        await sendEmail({
          to: farmer.user.email,
          subject: `Your post about ${appearance.name} was removed`,
          html: `<div style="font-family: sans-serif; max-width: 480px;"><p>We've removed your post about <strong>${escapeHtml(appearance.name)}</strong>: ${escapeHtml(reason)}</p>${
            cancelled.cancelled ? `<p>${cancelled.cancelled} order${cancelled.cancelled === 1 ? '' : 's'} booked for pickup there ${cancelled.cancelled === 1 ? 'was' : 'were'} cancelled and refunded.</p>` : ''
          }<p>If you think this is a mistake, reply to this email or contact us.</p></div>`,
        });
      }
    }

    const { data: rows } = await supabaseAdmin
      .from('farm_appearances')
      .select('*')
      .eq('status', 'active')
      .gte('ends_on', today)
      .order('starts_on', { ascending: true })
      .limit(500);
    const posts = (rows || []) as Appearance[];
    const farmerIds = [...new Set(posts.map((p) => p.farmer_id))];
    const { data: farms } = farmerIds.length
      ? await supabaseAdmin.from('seller_profiles').select('id, farm_name').in('id', farmerIds)
      : { data: [] as any[] };
    const farmName = new Map((farms || []).map((f) => [f.id, f.farm_name]));
    const result = [];
    for (const p of posts) {
      result.push({
        id: p.id,
        farm: farmName.get(p.farmer_id) || 'Unknown farm',
        farmId: p.farmer_id,
        kind: APPEARANCE_KINDS[p.kind as keyof typeof APPEARANCE_KINDS] || 'Event',
        name: p.name,
        place: `${p.address}, ${p.city} ${p.zip}`,
        schedule: describeSchedule(p),
        note: p.note,
        takesOrders: p.takes_orders,
        openOrders: (await openMarketOrders(p.id)).length,
      });
    }
    // Crops farms say they're growing.
    const { data: cropRows } = await supabaseAdmin
      .from('growing_crops')
      .select('*')
      .eq('status', 'growing')
      .order('expected_from', { ascending: true })
      .limit(500);
    const cropFarmIds = [...new Set((cropRows || []).map((c) => c.farmer_id).filter((id) => !farmName.has(id)))];
    const { data: moreFarms } = cropFarmIds.length
      ? await supabaseAdmin.from('seller_profiles').select('id, farm_name').in('id', cropFarmIds)
      : { data: [] as any[] };
    for (const f of moreFarms || []) farmName.set(f.id, f.farm_name);
    const crops = (cropRows || []).map((c) => ({
      id: c.id,
      farm: farmName.get(c.farmer_id) || 'Unknown farm',
      farmId: c.farmer_id,
      name: c.name,
      variety: c.variety,
      category: c.category,
      expected: describeExpected(c.expected_from, c.expected_until, today),
      note: c.note,
    }));

    return NextResponse.json({ posts: result, crops });
  } catch (err: any) {
    console.error('admin appearances error:', err);
    await alertAdmin('admin market posts', err);
    return NextResponse.json({ error: 'Could not load market posts.' }, { status: 500 });
  }
}
