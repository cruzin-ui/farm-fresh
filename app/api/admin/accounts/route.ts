import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getRequestAdmin } from '@/lib/apiAuth';
import { listBlocks } from '@/lib/accountBlocks';
import { logAdminAction } from '@/lib/adminLog';
import { sendEmail, escapeHtml } from '@/lib/email';
import { alertAdmin } from '@/lib/alerts';

export const dynamic = 'force-dynamic';

const looksLikeEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;

// Admin-only: suspending sellers and blocking buyers.
//   list             — everyone currently suspended or blocked
//   suspend_seller   — hide a seller's listings and stop them posting
//   block_buyer      — stop a buyer (by email, and their account if they
//                      have one) from checking out
//   lift             — remove a suspension or block
export async function POST(request: Request) {
  try {
    const admin = await getRequestAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: 'Not authorized.' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const action = typeof body.action === 'string' ? body.action : 'list';
    const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : '';

    if (action === 'suspend_seller') {
      const sellerId = typeof body.sellerId === 'string' ? body.sellerId : '';
      const { data: profile } = await supabaseAdmin
        .from('seller_profiles')
        .select('id, farm_name')
        .eq('id', sellerId)
        .maybeSingle();
      if (!profile) return NextResponse.json({ error: 'Seller not found.' }, { status: 404 });

      const { data: sellerUser } = await supabaseAdmin.auth.admin.getUserById(profile.id);
      const sellerEmail = sellerUser?.user?.email || null;

      const { error } = await supabaseAdmin
        .from('account_blocks')
        .insert([{ scope: 'seller', user_id: profile.id, email: sellerEmail, reason, created_by: admin.email }]);
      // Already suspended is fine.
      if (error && error.code !== '23505') return NextResponse.json({ error: error.message }, { status: 500 });

      const farmName = profile.farm_name || 'Unnamed farm';
      await logAdminAction(admin.email || 'admin', 'Suspended a seller', farmName, reason);

      if (sellerEmail) {
        await sendEmail({
          to: sellerEmail,
          subject: 'Your Farm Fresh Direct seller account has been suspended',
          html: `
            <div style="font-family: sans-serif; max-width: 480px;">
              <h2 style="color: #b91c1c;">Your seller account is suspended</h2>
              <p>
                Your listings are hidden from buyers for now and you can't post new ones. Orders you already have
                are not affected: please still prepare them and hand them over as usual.
              </p>
              ${reason ? `<p><strong>Why:</strong> ${escapeHtml(reason)}</p>` : ''}
              <p>
                If you think this is a mistake, or you'd like to talk it through,
                <a href="${new URL(request.url).origin}/contact">contact us</a>.
              </p>
            </div>
          `,
        });
      }

      return NextResponse.json({
        success: true,
        message: `${farmName} is suspended. Their listings are hidden and they can't post new ones. Open orders were left as they are.`,
      });
    }

    if (action === 'block_buyer') {
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      if (!looksLikeEmail(email)) {
        return NextResponse.json({ error: 'Enter the email address to block.' }, { status: 400 });
      }

      // If that address has ordered with an account, block the account too,
      // so changing the email on it doesn't get around the block.
      const { data: theirOrders } = await supabaseAdmin
        .from('orders')
        .select('buyer_id')
        .ilike('buyer_email', email.replace(/[\\%_]/g, (char: string) => `\\${char}`))
        .not('buyer_id', 'is', null)
        .limit(1);
      const userId = theirOrders?.[0]?.buyer_id || null;

      const existing = (await listBlocks()).find(
        (block) => block.scope === 'buyer' && ((userId && block.user_id === userId) || (block.email || '').toLowerCase() === email)
      );
      if (!existing) {
        const { error } = await supabaseAdmin
          .from('account_blocks')
          .insert([{ scope: 'buyer', user_id: userId, email, reason, created_by: admin.email }]);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        await logAdminAction(admin.email || 'admin', 'Blocked a buyer', email, reason);
      }

      return NextResponse.json({
        success: true,
        message: `${email} is blocked from placing orders. Orders they already have were left as they are.`,
      });
    }

    if (action === 'lift') {
      const id = typeof body.id === 'string' ? body.id : '';
      const { data: block } = await supabaseAdmin.from('account_blocks').select('*').eq('id', id).maybeSingle();
      if (!block) return NextResponse.json({ error: 'That suspension or block was not found.' }, { status: 404 });

      const { error } = await supabaseAdmin.from('account_blocks').delete().eq('id', id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      await logAdminAction(
        admin.email || 'admin',
        block.scope === 'seller' ? 'Lifted a seller suspension' : 'Unblocked a buyer',
        block.email || block.user_id
      );
      return NextResponse.json({
        success: true,
        message: block.scope === 'seller' ? 'Suspension lifted. Their listings are visible again.' : 'Buyer unblocked.',
      });
    }

    // list
    const blocks = await listBlocks();
    const sellerIds = blocks.filter((b) => b.scope === 'seller' && b.user_id).map((b) => b.user_id as string);
    const { data: farms } = sellerIds.length
      ? await supabaseAdmin.from('seller_profiles').select('id, farm_name').in('id', sellerIds)
      : { data: [] as { id: string; farm_name: string | null }[] };
    const farmNameById = new Map((farms || []).map((f) => [f.id, f.farm_name]));

    return NextResponse.json({
      blocks: blocks.map((b) => ({
        ...b,
        farm_name: b.scope === 'seller' && b.user_id ? farmNameById.get(b.user_id) || 'Unnamed farm' : null,
      })),
    });
  } catch (err: any) {
    console.error('admin accounts error:', err);
    await alertAdmin('admin accounts error', err);
    return NextResponse.json({ error: err.message || 'Action failed.' }, { status: 500 });
  }
}
