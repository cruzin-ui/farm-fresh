import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getRequestUser, isAdminEmail } from '@/lib/apiAuth';
import { orderRef } from '@/lib/pickupGroups';
import { arizonaDay } from '@/lib/sellerLedger';
import { OPERATOR_NAME } from '@/lib/legal';
import { alertAdmin } from '@/lib/alerts';

export const dynamic = 'force-dynamic';

const cents = (value: unknown) => Math.round(Number(value || 0) * 100);

// A printable invoice for one farm's part of a checkout: { orderId } of any
// item in it. The farm that sold it and the buyer who bought it can open it
// (and admins). The buyer's email is shown to the farm only once the order
// has closed, as everywhere else in the dashboard.
export async function POST(request: Request) {
  try {
    const user = await getRequestUser(request);
    if (!user) return NextResponse.json({ error: 'Please sign in to see this invoice.' }, { status: 401 });
    const body = await request.json().catch(() => ({}));
    const orderId = typeof body.orderId === 'string' && /^[0-9a-f-]{36}$/i.test(body.orderId) ? body.orderId : '';
    if (!orderId) return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 });

    const { data: order } = await supabaseAdmin.from('orders').select('*').eq('id', orderId).maybeSingle();
    if (!order) return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 });
    const { data: listing } = await supabaseAdmin.from('produce_listings').select('farmer_id').eq('id', order.listing_id).maybeSingle();
    const farmerId = listing?.farmer_id as string | undefined;
    const isSeller = Boolean(farmerId && farmerId === user.id);
    const isBuyer = Boolean(order.buyer_id && order.buyer_id === user.id);
    if (!isSeller && !isBuyer && !isAdminEmail(user.email)) {
      return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 });
    }

    // Everything the buyer bought from this farm in the same checkout.
    let orders = [order];
    if (order.checkout_id) {
      const { data } = await supabaseAdmin.from('orders').select('*').eq('checkout_id', order.checkout_id).order('created_at');
      orders = data || [order];
    }
    const listingIds = [...new Set(orders.map((o) => o.listing_id))];
    const { data: listings } = await supabaseAdmin
      .from('produce_listings')
      .select('id, title, variety, unit_type, farmer_id, location_name, zip_code')
      .in('id', listingIds);
    const listingById = new Map((listings || []).map((l) => [l.id as string, l]));
    orders = orders.filter((o) => listingById.get(o.listing_id)?.farmer_id === farmerId);

    const { data: farm } = await supabaseAdmin
      .from('seller_profiles')
      .select('farm_name, location, zip_code, slug')
      .eq('id', farmerId)
      .maybeSingle();

    const allClosed = orders.every((o) => o.status === 'completed' || o.status === 'cancelled');
    const pickedUp = orders.filter((o) => o.status === 'completed');
    const anyOpen = orders.some((o) => o.status === 'pending_pickup' || o.status === 'ready_for_pickup');

    const lines = orders.map((o) => {
      const l = listingById.get(o.listing_id);
      const quantity = Number(o.original_quantity ?? o.reserved_quantity ?? o.quantity ?? 0);
      const amount = cents(o.original_subtotal_amount ?? o.subtotal_amount);
      return {
        item: [l?.title || 'Item', l?.variety].filter(Boolean).join(' · '),
        quantity,
        unit: l?.unit_type || '',
        cases: o.wholesale_cases ? `${o.wholesale_cases} case${o.wholesale_cases === 1 ? '' : 's'} of ${o.wholesale_case_size}` : null,
        unitPriceCents: quantity > 0 ? Math.round(amount / quantity) : amount,
        amountCents: amount,
        status: o.status === 'completed' ? 'Picked up' : o.status === 'cancelled' ? 'Cancelled' : 'Awaiting pickup',
      };
    });

    const sum = (pick: (o: any) => number) => orders.reduce((total, o) => total + pick(o), 0);
    const subtotal = sum((o) => cents(o.original_subtotal_amount ?? o.subtotal_amount));
    const tax = sum((o) => cents(o.original_tax_amount ?? o.tax_amount));
    const charged = sum((o) => cents(o.original_total_amount ?? o.total_price));
    const refunded = sum((o) => cents(o.refunded_amount));
    const pickedUpDay = pickedUp.length ? arizonaDay(pickedUp.map((o) => o.completed_at).sort().pop()) : null;

    return NextResponse.json({
      invoice: {
        number: `${orderRef(order)}-${String(farmerId).replace(/-/g, '').slice(0, 3).toUpperCase()}`,
        ref: orderRef(order),
        operator: OPERATOR_NAME,
        farm: {
          name: farm?.farm_name || 'Local farm',
          place: [farm?.location, farm?.zip_code].filter(Boolean).join(' '),
          address: farm?.slug ? `farmfreshdirect.online/${farm.slug}` : null,
        },
        buyer: {
          name: order.buyer_name || null,
          email: isBuyer || allClosed || isAdminEmail(user.email) ? order.buyer_email || null : null,
        },
        orderedDay: arizonaDay(order.created_at),
        pickedUpDay,
        status: anyOpen ? 'Paid, awaiting pickup' : pickedUp.length ? 'Paid and picked up' : 'Cancelled',
        pickup: order.market_label || null,
        taxExempt: orders.some((o) => o.tax_exempt_certificate_id),
        wholesale: orders.some((o) => o.wholesale_cases),
        lines,
        subtotalCents: subtotal,
        // The buyer's service fee to Farm Fresh Direct: what was charged
        // beyond the produce and its tax.
        serviceFeeCents: Math.max(0, charged - subtotal - tax),
        taxCents: tax,
        chargedCents: charged,
        refundedCents: refunded,
        viewer: isSeller ? 'seller' : isBuyer ? 'buyer' : 'admin',
      },
    });
  } catch (err: any) {
    console.error('invoice error:', err);
    await alertAdmin('invoice', err);
    return NextResponse.json({ error: 'Could not load the invoice. Please try again.' }, { status: 500 });
  }
}
