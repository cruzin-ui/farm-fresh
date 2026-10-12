import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getRequestUser } from '@/lib/apiAuth';
import { alertAdmin } from '@/lib/alerts';

export const dynamic = 'force-dynamic';

// Moves orders someone placed as a guest onto their account, so that a person
// who buys first and signs up later finds their earlier orders under My
// Orders. It is called whenever a signed-in buyer opens that page.
//
// Orders are matched by email address, so this only runs for an account whose
// address has been confirmed (by the link we email at sign-up, or by Google).
// Without that, anyone could sign up with someone else's address and be handed
// their orders and pickup codes.
export async function POST(request: Request) {
  try {
    const user = await getRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 });
    }

    const email = (user.email || '').trim();
    if (!email || !user.email_confirmed_at) {
      return NextResponse.json({ claimed: 0 });
    }

    // Matched exactly, ignoring case: % and _ would otherwise act as wildcards.
    const pattern = email.replace(/[\\%_]/g, (char: string) => `\\${char}`);
    const { data: guestOrders, error: findError } = await supabaseAdmin
      .from('orders')
      .select('id')
      .is('buyer_id', null)
      .ilike('buyer_email', pattern)
      .limit(500);
    if (findError) throw findError;

    const orderIds = (guestOrders || []).map((o) => o.id);
    if (orderIds.length === 0) return NextResponse.json({ claimed: 0 });

    // The pickup codes go first: a buyer reads theirs by account, so an order
    // must never be on the account before its code is.
    const { error: codeError } = await supabaseAdmin
      .from('order_pickup_codes')
      .update({ buyer_id: user.id })
      .in('order_id', orderIds);
    if (codeError) throw codeError;

    const { error: orderError } = await supabaseAdmin
      .from('orders')
      .update({ buyer_id: user.id })
      .in('id', orderIds)
      .is('buyer_id', null);
    if (orderError) throw orderError;

    console.log(`Moved ${orderIds.length} guest order(s) onto account ${user.id}`);
    return NextResponse.json({ claimed: orderIds.length });
  } catch (err: any) {
    console.error('order claim error:', err);
    await alertAdmin('order claim error', err);
    // My Purchases still loads without this, so the page isn't held up by it.
    return NextResponse.json({ claimed: 0 });
  }
}
