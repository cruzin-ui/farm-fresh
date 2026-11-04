import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getRequestUser } from '@/lib/apiAuth';
import { wholesaleBuyer, wholesaleOffersFor } from '@/lib/wholesaleServer';
import { alertAdmin } from '@/lib/alerts';

export const dynamic = 'force-dynamic';

// A listing's wholesale offer, for its page. The price is only given to an
// approved wholesale account (and to the farm itself, for editing); anyone
// else is only told that the listing is sold by the case, so they can apply.
//   { listingId } → { available, approved, offer?, taxExempt?, applied? }
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const listingId = typeof body.listingId === 'string' ? body.listingId : '';
    if (!/^[0-9a-f-]{36}$/i.test(listingId)) {
      return NextResponse.json({ error: 'Missing listing.' }, { status: 400 });
    }

    const offer = (await wholesaleOffersFor([listingId])).get(listingId) || null;
    if (!offer) return NextResponse.json({ available: false, approved: false });

    const user = await getRequestUser(request);
    if (user) {
      const { data: listing } = await supabaseAdmin.from('produce_listings').select('farmer_id').eq('id', listingId).maybeSingle();
      if (listing?.farmer_id === user.id) {
        return NextResponse.json({ available: true, approved: false, own: true, offer });
      }
    }

    const buyer = await wholesaleBuyer(user?.id);
    if (!buyer.approved) {
      const { data: account } = user
        ? await supabaseAdmin.from('wholesale_accounts').select('status').eq('user_id', user.id).maybeSingle()
        : { data: null };
      return NextResponse.json({ available: true, approved: false, applied: account?.status || null });
    }

    return NextResponse.json({ available: true, approved: true, offer, taxExempt: Boolean(buyer.exemptCertificateId) });
  } catch (err: any) {
    console.error('wholesale listing error:', err);
    await alertAdmin('wholesale listing error', err);
    return NextResponse.json({ error: 'Could not load wholesale prices.' }, { status: 500 });
  }
}
