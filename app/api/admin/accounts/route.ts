import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getRequestAdmin } from '@/lib/apiAuth';
import { listBlocks } from '@/lib/accountBlocks';
import { logAdminAction } from '@/lib/adminLog';
import { sendEmail, escapeHtml } from '@/lib/email';
import { alertAdmin } from '@/lib/alerts';
import { tidyFarmAddress, farmAddressProblem } from '@/lib/farmAddress';

export const dynamic = 'force-dynamic';

const looksLikeEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;

// Admin-only: suspending sellers and blocking buyers.
//   list             — everyone currently suspended or blocked
//   suspend_seller   — hide a seller's listings and stop them posting
//   block_buyer      — stop a buyer (by email, and their account if they
//                      have one) from checking out
//   lift             — remove a suspension or block
//   set_farm_address — change a farm's web address, or clear it (the seller
//                      can only set theirs once; fixing a mistake is for us)
//   reset_limits     — start a seller's cancellation count again (their
//                      cancellations are kept; the limits count only ones
//                      after this), optionally lifting their suspension too
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

    if (action === 'set_farm_address') {
      const sellerId = typeof body.sellerId === 'string' ? body.sellerId : '';
      const { data: profile } = await supabaseAdmin
        .from('seller_profiles')
        .select('id, farm_name, slug')
        .eq('id', sellerId)
        .maybeSingle();
      if (!profile) return NextResponse.json({ error: 'Seller not found.' }, { status: 404 });

      const farmName = profile.farm_name || 'Unnamed farm';
      const typed = typeof body.address === 'string' ? body.address : '';
      const address = tidyFarmAddress(typed);

      // Left empty: take the address away, so the seller can choose again.
      if (!typed.trim()) {
        const { error } = await supabaseAdmin.from('seller_profiles').update({ slug: null }).eq('id', profile.id);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        await logAdminAction(admin.email || 'admin', "Cleared a farm's web address", farmName, `Was /${profile.slug || '(none)'}`);
        return NextResponse.json({
          success: true,
          message: `${farmName} no longer has a web address of its own. They can choose a new one from Farm Profile.`,
        });
      }

      const problem = farmAddressProblem(address);
      if (problem) return NextResponse.json({ error: problem }, { status: 400 });

      const { error } = await supabaseAdmin.from('seller_profiles').update({ slug: address }).eq('id', profile.id);
      if (error) {
        if (error.code === '23505') {
          return NextResponse.json({ error: 'Another farm already has that address.' }, { status: 409 });
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      await logAdminAction(
        admin.email || 'admin',
        "Changed a farm's web address",
        farmName,
        `/${profile.slug || '(none)'} to /${address}`
      );
      return NextResponse.json({
        success: true,
        message: `${farmName} is now at /${address}.${profile.slug ? ` The old address, /${profile.slug}, no longer works.` : ''}`,
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

    if (action === 'reset_limits') {
      const sellerId = typeof body.sellerId === 'string' ? body.sellerId : '';
      if (!reason) return NextResponse.json({ error: 'Give a reason for the reset (it goes on the record).' }, { status: 400 });
      const { data: profile } = await supabaseAdmin.from('seller_profiles').select('id, farm_name').eq('id', sellerId).maybeSingle();
      if (!profile) return NextResponse.json({ error: 'Seller not found.' }, { status: 404 });

      // Their cancellations so far, all time, for the record.
      const { data: listings } = await supabaseAdmin.from('produce_listings').select('id').eq('farmer_id', sellerId);
      const listingIds = (listings || []).map((l) => l.id);
      const { data: cancelled } = listingIds.length
        ? await supabaseAdmin
            .from('orders')
            .select('id, checkout_id')
            .in('listing_id', listingIds)
            .eq('status', 'cancelled')
            .in('cancel_reason', ['seller', 'seller_late', 'never_ready', 'listing_removed'])
            .limit(5000)
        : { data: [] as { id: string; checkout_id: string | null }[] };
      const { count: missedParts } = await supabaseAdmin
        .from('csa_farm_weeks')
        .select('plan_id', { count: 'exact', head: true })
        .eq('farmer_id', sellerId)
        .eq('status', 'missing');
      const total = new Set((cancelled || []).map((o) => o.checkout_id || o.id)).size + (missedParts || 0);

      // Lifting a suspension too, if asked.
      let lifted = false;
      if (body.liftSuspension === true) {
        const { data: removed } = await supabaseAdmin
          .from('account_blocks')
          .delete()
          .eq('scope', 'seller')
          .eq('user_id', sellerId)
          .select('id');
        lifted = Boolean(removed && removed.length > 0);
      }

      const { error } = await supabaseAdmin.from('seller_limit_resets').insert({
        seller_id: sellerId,
        admin_email: admin.email || 'admin',
        reason,
        cancellations_at_reset: total,
        lifted_suspension: lifted,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      const farmName = profile.farm_name || 'Unnamed farm';
      await logAdminAction(admin.email || 'admin', lifted ? 'Reset cancellation limit and lifted suspension' : 'Reset cancellation limit', farmName, reason);

      const { data: sellerUser } = await supabaseAdmin.auth.admin.getUserById(sellerId);
      if (sellerUser?.user?.email) {
        await sendEmail({
          to: sellerUser.user.email,
          subject: 'Your cancellation count has been reset',
          html: `
            <div style="font-family: sans-serif; max-width: 480px;">
              <h2 style="color: #059669;">You're back to a clean slate</h2>
              <p>We've reset the count of cancellations that counts toward your limits, so only cancellations from now on will count.${
                lifted ? ' Your account is no longer paused: your listings are visible to buyers again and you can post new ones.' : ''
              }</p>
              <p>Thank you for letting us know what happened. If you can't fill an order in future, cancelling it as early as you can is always best for your buyers.</p>
            </div>`,
        });
      }
      return NextResponse.json({
        success: true,
        message: `${farmName}'s cancellation count was reset (${total} cancellation${total === 1 ? '' : 's'} on record).${lifted ? ' Their suspension was lifted too.' : ''}`,
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
