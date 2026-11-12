import { NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/apiAuth';
import { sellerLedger } from '@/lib/sellerLedger';
import { alertAdmin } from '@/lib/alerts';

export const dynamic = 'force-dynamic';

// The signed-in seller's record book: every closed order, and their parts of
// other farms' shared Farm Boxes (see lib/sellerLedger).
export async function POST(request: Request) {
  try {
    const user = await getRequestUser(request);
    if (!user) return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 });
    return NextResponse.json({ lines: await sellerLedger(user.id) });
  } catch (err: any) {
    console.error('seller records error:', err);
    await alertAdmin('seller records', err);
    return NextResponse.json({ error: 'Could not load your records. Please try again.' }, { status: 500 });
  }
}
