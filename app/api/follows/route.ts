import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getRequestUser } from '@/lib/apiAuth';
import { followFarm, unfollowFarm, isFollowing, listFollowedFarms } from '@/lib/follows';
import { alertAdmin } from '@/lib/alerts';

export const dynamic = 'force-dynamic';

// A signed-in shopper's followed farms.
//   { action: 'list' }                                   — the farms they follow, with what each has for sale
//   { action: 'status' | 'follow' | 'unfollow', farmerId } — one farm
// Following needs an account, because the list lives with the account.
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const action = body.action;
    const farmerId = typeof body.farmerId === 'string' ? body.farmerId : '';

    if (!['list', 'status', 'follow', 'unfollow'].includes(action) || (action !== 'list' && !farmerId)) {
      return NextResponse.json({ error: 'Missing farm or action.' }, { status: 400 });
    }

    const user = await getRequestUser(request);

    if (action === 'status') {
      return NextResponse.json({ following: user ? await isFollowing(farmerId, user.id) : false });
    }

    if (!user) {
      return NextResponse.json({ error: 'Sign in to favorite farms.' }, { status: 401 });
    }

    if (action === 'list') {
      return NextResponse.json({ farms: await listFollowedFarms(user.id) });
    }

    if (action === 'unfollow') {
      await unfollowFarm(farmerId, user.id);
      return NextResponse.json({ following: false });
    }

    const { data: farm } = await supabaseAdmin.from('seller_profiles').select('id').eq('id', farmerId).maybeSingle();
    if (!farm) {
      return NextResponse.json({ error: 'Farm not found.' }, { status: 404 });
    }

    await followFarm(farmerId, user.id);
    return NextResponse.json({ following: true });
  } catch (err: any) {
    console.error('follow error:', err);
    await alertAdmin('follow error', err);
    return NextResponse.json({ error: 'Could not update that. Please try again.' }, { status: 500 });
  }
}
