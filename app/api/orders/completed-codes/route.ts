import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getRequestUser } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

// Returns the pickup codes of the signed-in farmer's COMPLETED orders, as a
// record of what was entered at pickup. Codes for open orders are never
// returned: the farmer only learning the code from the buyer at pickup is
// what stops them releasing their own payout early.
export async function POST(request: Request) {
  try {
    const user = await getRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 });
    }

    const { data: listings } = await supabaseAdmin
      .from('produce_listings')
      .select('id')
      .eq('farmer_id', user.id);

    const listingIds = (listings || []).map((l) => l.id);
    if (listingIds.length === 0) {
      return NextResponse.json({ codes: {} });
    }

    const { data: orders, error: ordersError } = await supabaseAdmin
      .from('orders')
      .select('id, pickup_code')
      .in('listing_id', listingIds)
      .eq('status', 'completed');

    if (ordersError) {
      return NextResponse.json({ error: ordersError.message }, { status: 500 });
    }

    const orderIds = (orders || []).map((o) => o.id);
    if (orderIds.length === 0) {
      return NextResponse.json({ codes: {} });
    }

    const { data: codeRows } = await supabaseAdmin
      .from('order_pickup_codes')
      .select('order_id, code')
      .in('order_id', orderIds);

    const codeByOrderId = new Map((codeRows || []).map((c) => [c.order_id, c.code]));

    const codes: Record<string, string> = {};
    for (const order of orders || []) {
      // Orders from before codes were stored separately keep theirs on the row.
      const code = codeByOrderId.get(order.id) || order.pickup_code;
      if (code) codes[order.id] = code;
    }

    return NextResponse.json({ codes });
  } catch (err: any) {
    console.error('completed codes error:', err);
    return NextResponse.json({ error: err.message || 'Failed to load pickup codes.' }, { status: 500 });
  }
}
