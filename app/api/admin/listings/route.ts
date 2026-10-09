import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getRequestAdmin } from '@/lib/apiAuth';
import { refundOrderQuantity } from '@/lib/orderActions';
import { sendEmail, escapeHtml } from '@/lib/email';
import { alertAdmin } from '@/lib/alerts';
import { PRODUCE_ONLY_NOTICE } from '@/lib/categories';

export const dynamic = 'force-dynamic';

const isOpen = (order: any) => order.status === 'pending_pickup' || order.status === 'ready_for_pickup';

// Admin-only: lists the most recent listings, and removes one when called
// with { id, reason }.
//
// Removing a listing takes it off sale for good — it is marked removed, which
// hides it from shoppers and stops the seller putting it back — and every
// order for it that hasn't been picked up is cancelled and refunded in full.
// The row itself is kept, because past orders look up their crop and farm
// through it. The seller is emailed the reason.
export async function POST(request: Request) {
  try {
    const admin = await getRequestAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: 'Not authorized.' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));

    if (body.id) {
      const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : '';

      const { data: listing } = await supabaseAdmin
        .from('produce_listings')
        .select('id, title, unit_type, farmer_id, available_quantity, status')
        .eq('id', body.id)
        .maybeSingle();

      if (!listing) {
        return NextResponse.json({ error: 'Listing not found.' }, { status: 404 });
      }

      console.log(`Admin override: ${admin.email} removed listing ${listing.id}`);

      // Off sale first, so nobody can buy it while its orders are refunded.
      const { error: updateError } = await supabaseAdmin
        .from('produce_listings')
        .update({ status: 'removed', available_quantity: 0 })
        .eq('id', listing.id);

      if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

      const { data: orders } = await supabaseAdmin.from('orders').select('*').eq('listing_id', listing.id);
      const openOrders = (orders || []).filter(isOpen);

      let refunded = 0;
      const failed: string[] = [];
      for (const order of openOrders) {
        try {
          await refundOrderQuantity({
            order,
            listing,
            newQuantity: 0,
            note: 'This item was removed from Farm Fresh Direct because it is not allowed on the site, so your order for it was cancelled and refunded in full.',
          });
          refunded += 1;
        } catch (err: any) {
          console.error('Could not refund order for a removed listing:', order.id, err);
          failed.push(`#${String(order.id).slice(0, 8)}: ${err?.message || 'unknown error'}`);
        }
      }

      if (listing.farmer_id) {
        const { data: sellerUser } = await supabaseAdmin.auth.admin.getUserById(listing.farmer_id);
        if (sellerUser?.user?.email) {
          await sendEmail({
            to: sellerUser.user.email,
            subject: `Your listing "${listing.title}" was removed`,
            html: `
              <div style="font-family: sans-serif; max-width: 480px;">
                <h2 style="color: #b45309;">Your listing was removed</h2>
                <p>
                  We removed your listing <strong>${escapeHtml(listing.title || 'your listing')}</strong> from
                  Farm Fresh Direct.
                </p>
                ${reason ? `<p><strong>Reason:</strong> ${escapeHtml(reason)}</p>` : ''}
                <p>${escapeHtml(PRODUCE_ONLY_NOTICE)}</p>
                ${
                  openOrders.length > 0
                    ? `<p>${openOrders.length} open order${openOrders.length === 1 ? ' for it was' : 's for it were'} cancelled and refunded to the buyer${openOrders.length === 1 ? '' : 's'}, so please don't hand over those items.</p>`
                    : ''
                }
                <p>
                  If you think this was a mistake, <a href="${new URL(request.url).origin}/contact">contact us</a>.
                </p>
              </div>
            `,
          });
        }
      }

      if (failed.length > 0) {
        return NextResponse.json({
          success: true,
          message: `Listing removed, but ${failed.length} order${failed.length === 1 ? '' : 's'} could not be refunded automatically (${failed.join('; ')}). Refund ${failed.length === 1 ? 'it' : 'them'} from the orders list.`,
        });
      }

      return NextResponse.json({
        success: true,
        message:
          refunded > 0
            ? `Listing removed. ${refunded} open order${refunded === 1 ? ' was' : 's were'} cancelled and refunded, and the seller has been emailed.`
            : 'Listing removed, and the seller has been emailed.',
      });
    }

    const { data: listings, error } = await supabaseAdmin
      .from('produce_listings')
      .select('id, created_at, title, variety, category, price_per_unit, unit_type, available_quantity, farmer_id, location_name, status')
      .order('created_at', { ascending: false })
      .limit(300);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const listingIds = (listings || []).map((l) => l.id);
    const farmerIds = [...new Set((listings || []).map((l) => l.farmer_id).filter(Boolean))];

    const { data: profiles } = farmerIds.length
      ? await supabaseAdmin.from('seller_profiles').select('id, farm_name').in('id', farmerIds)
      : { data: [] as any[] };
    const farmNames = new Map((profiles || []).map((p: any) => [p.id, p.farm_name]));

    const { data: openOrders } = listingIds.length
      ? await supabaseAdmin
          .from('orders')
          .select('listing_id')
          .in('listing_id', listingIds)
          .in('status', ['pending_pickup', 'ready_for_pickup'])
      : { data: [] as any[] };
    const openOrderCount = new Map<string, number>();
    for (const order of openOrders || []) {
      openOrderCount.set(order.listing_id, (openOrderCount.get(order.listing_id) || 0) + 1);
    }

    return NextResponse.json({
      listings: (listings || []).map((l) => ({
        id: l.id,
        created_at: l.created_at,
        title: l.title || 'Untitled',
        variety: l.variety || null,
        category: l.category || '',
        price_per_unit: Number(l.price_per_unit ?? 0),
        unit_type: l.unit_type || 'units',
        available_quantity: Number(l.available_quantity ?? 0),
        location_name: l.location_name || '',
        farmer_id: l.farmer_id,
        farm_name: farmNames.get(l.farmer_id) || 'Unknown farm',
        removed: l.status === 'removed',
        open_orders: openOrderCount.get(l.id) || 0,
      })),
    });
  } catch (err: any) {
    console.error('admin listings error:', err);
    await alertAdmin('admin listings error', err);
    return NextResponse.json({ error: err.message || 'Failed to load listings.' }, { status: 500 });
  }
}
