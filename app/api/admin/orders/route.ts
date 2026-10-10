import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getRequestAdmin } from '@/lib/apiAuth';
import { noShowAutoApproveAt } from '@/lib/noShow';
import { alertAdmin } from '@/lib/alerts';
import { orderRef } from '@/lib/pickupGroups';
import { listBlocks } from '@/lib/accountBlocks';
import { FAST_COMPLETION_MINUTES, hasOpenDispute } from '@/lib/orderActions';

export const dynamic = 'force-dynamic';

// Admin-only: every recent order across all farmers, with the buyer, farmer,
// money and pickup-code details needed to support a transaction.
export async function POST(request: Request) {
  try {
    const admin = await getRequestAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: 'Not authorized.' }, { status: 403 });
    }

    // With a search, every order is looked through, not only recent ones:
    // by order number (the six characters buyers and farmers are shown) or
    // by part of the buyer's email address.
    const body = await request.json().catch(() => ({}));
    const search = typeof body.search === 'string' ? body.search.trim().replace(/^#/, '') : '';

    let query = supabaseAdmin.from('orders').select('*').order('created_at', { ascending: false }).limit(200);
    if (/^[0-9a-f]{6}$/i.test(search)) {
      // An order number is the start of the checkout's id (or the order's own,
      // for orders from before carts), so it is found as a range of ids.
      const low = `${search.toLowerCase()}00-0000-0000-0000-000000000000`;
      const high = `${search.toLowerCase()}ff-ffff-ffff-ffff-ffffffffffff`;
      query = query.or(
        `and(checkout_id.gte.${low},checkout_id.lte.${high}),and(checkout_id.is.null,id.gte.${low},id.lte.${high})`
      );
    } else if (search) {
      const term = search.replace(/[\\%_,()]/g, '');
      if (!term) return NextResponse.json({ orders: [] });
      query = query.ilike('buyer_email', `%${term}%`);
    }

    const { data: orders, error: ordersError } = await query;

    if (ordersError) {
      return NextResponse.json({ error: ordersError.message }, { status: 500 });
    }

    const listingIds = [...new Set((orders || []).map((o) => o.listing_id).filter(Boolean))];
    const orderIds = (orders || []).map((o) => o.id);

    const { data: listings } = listingIds.length
      ? await supabaseAdmin
          .from('produce_listings')
          .select('id, title, unit_type, farmer_id')
          .in('id', listingIds)
      : { data: [] as any[] };

    const farmerIds = [...new Set((listings || []).map((l) => l.farmer_id).filter(Boolean))];

    const { data: farmers } = farmerIds.length
      ? await supabaseAdmin.from('seller_profiles').select('id, farm_name').in('id', farmerIds)
      : { data: [] as any[] };

    const { data: codes } = orderIds.length
      ? await supabaseAdmin
          .from('order_pickup_codes')
          .select('order_id, code, failed_attempts')
          .in('order_id', orderIds)
      : { data: [] as any[] };

    const listingById = new Map((listings || []).map((l) => [l.id, l]));
    const farmNameById = new Map((farmers || []).map((f) => [f.id, f.farm_name]));
    const codeByOrderId = new Map((codes || []).map((c) => [c.order_id, c]));

    // Buyers an admin has blocked, by account or by email address.
    const buyerBlocks = (await listBlocks().catch(() => [])).filter((b) => b.scope === 'buyer');
    const blockFor = (o: any) =>
      buyerBlocks.find(
        (b) =>
          (o.buyer_id && b.user_id === o.buyer_id) ||
          (o.buyer_email && (b.email || '').toLowerCase() === String(o.buyer_email).toLowerCase())
      );

    const result = (orders || []).map((o) => {
      const listing = listingById.get(o.listing_id);
      const code = codeByOrderId.get(o.id);

      return {
        id: o.id,
        // The number buyers and farmers see and quote.
        order_ref: orderRef(o),
        buyer_block_id: blockFor(o)?.id || null,
        created_at: o.created_at,
        status: o.status,
        buyer_email: o.buyer_email,
        // Bought without an account; reached through an emailed link.
        is_guest: !o.buyer_id,
        listing_title: listing?.title || 'Unknown listing',
        unit_type: listing?.unit_type || 'units',
        farm_name: (listing && farmNameById.get(listing.farmer_id)) || 'Unknown farm',
        quantity: Number(o.reserved_quantity ?? o.quantity ?? 0),
        total_price: Number(o.total_price ?? 0),
        refunded_amount: Number(o.refunded_amount ?? 0),
        paid_via_stripe: Boolean(o.stripe_payment_intent_id),
        payout_released: Boolean(o.stripe_transfer_id),
        stripe_payment_intent_id: o.stripe_payment_intent_id || null,
        pickup_code: code?.code || o.pickup_code || o.verification_code || null,
        failed_code_attempts: Number(code?.failed_attempts ?? 0),
        completed_at: o.completed_at || null,
        cancel_reason: o.cancel_reason || null,
        // Marked picked up within minutes of being paid for.
        fast_completion: Boolean(
          o.status === 'completed' &&
            o.completed_at &&
            new Date(o.completed_at).getTime() - new Date(o.created_at).getTime() < FAST_COMPLETION_MINUTES * 60 * 1000
        ),
        // A payment dispute with the buyer's bank, and whether it is still open.
        dispute_status: o.dispute_status || null,
        dispute_open: hasOpenDispute(o),
        // The buyer's own account of the order.
        buyer_received_at: o.buyer_received_at || null,
        buyer_problem_at: o.buyer_problem_at || null,
        buyer_problem_note: o.buyer_problem_note || null,
        buyer_problem_resolved_at: o.buyer_problem_resolved_at || null,
        no_show_reported_at: o.no_show_reported_at || null,
        // The buyer responded (or an admin put it on hold): no automatic closing.
        no_show_disputed_at: o.no_show_disputed_at || null,
        no_show_auto_approve_at:
          o.no_show_reported_at && !o.no_show_disputed_at
            ? noShowAutoApproveAt(o.no_show_reported_at).toISOString()
            : null,
      };
    });

    return NextResponse.json({ orders: result });
  } catch (err: any) {
    console.error('admin orders error:', err);
    await alertAdmin('admin orders error', err);
    return NextResponse.json({ error: err.message || 'Failed to load orders.' }, { status: 500 });
  }
}
