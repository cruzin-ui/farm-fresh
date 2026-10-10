import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getRequestUser } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

const OPEN_STATUSES = ['pending_pickup', 'ready_for_pickup'];

// The order ids among `orderIds` that have a message from `sender` nobody on
// the other side has opened yet, and how many such messages there are.
async function unreadFrom(sender: 'buyer' | 'seller', orderIds: string[]) {
  if (orderIds.length === 0) return { count: 0, orderIds: [] as string[] };

  const { data, error } = await supabaseAdmin
    .from('order_messages')
    .select('order_id')
    .in('order_id', orderIds)
    .eq('sender', sender)
    .is('read_at', null);

  if (error) console.error('Could not count unread messages:', error);
  return {
    count: (data || []).length,
    orderIds: [...new Set((data || []).map((message) => message.order_id as string))],
  };
}

// What the account button in the header needs to know about the signed-in
// user, for the small numbered badge on their picture:
//   - as a buyer: messages from farmers on their open orders they haven't opened;
//   - as a seller: orders waiting for them to mark ready, and messages from
//     buyers they haven't opened.
// `unreadOrderIds` lists the orders those messages are on, so the page showing
// an order can mark its message button. Someone with nothing waiting gets zeros.
export async function POST(request: Request) {
  const empty = {
    isSeller: false,
    farmPhotoUrl: null as string | null,
    ordersToReview: 0,
    unreadFromBuyers: 0,
    unreadFromSellers: 0,
    unreadOrderIds: [] as string[],
  };

  try {
    const user = await getRequestUser(request);
    if (!user) return NextResponse.json(empty);

    // As a buyer.
    const { data: myOrders } = await supabaseAdmin
      .from('orders')
      .select('id')
      .eq('buyer_id', user.id)
      .in('status', OPEN_STATUSES);
    const fromSellers = await unreadFrom(
      'seller',
      (myOrders || []).map((o) => o.id)
    );

    // As a seller.
    const { data: profile } = await supabaseAdmin
      .from('seller_profiles')
      .select('avatar_url')
      .eq('id', user.id)
      .maybeSingle();

    const { data: listings } = await supabaseAdmin.from('produce_listings').select('id').eq('farmer_id', user.id);
    const listingIds = (listings || []).map((l) => l.id);

    const { data: sellerOrders } = listingIds.length
      ? await supabaseAdmin.from('orders').select('id, status').in('listing_id', listingIds).in('status', OPEN_STATUSES)
      : { data: [] as any[] };
    const fromBuyers = await unreadFrom(
      'buyer',
      (sellerOrders || []).map((o) => o.id)
    );

    return NextResponse.json({
      isSeller: Boolean(profile) || listingIds.length > 0,
      farmPhotoUrl: profile?.avatar_url || null,
      ordersToReview: (sellerOrders || []).filter((o) => o.status === 'pending_pickup').length,
      unreadFromBuyers: fromBuyers.count,
      unreadFromSellers: fromSellers.count,
      unreadOrderIds: [...fromBuyers.orderIds, ...fromSellers.orderIds],
    });
  } catch (err) {
    // The header must never break over this; show no badge instead.
    console.error('account summary error:', err);
    return NextResponse.json(empty);
  }
}
