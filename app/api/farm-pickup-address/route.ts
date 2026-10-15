import { NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/apiAuth';
import { getFarmPickup, saveFarmPickup } from '@/lib/farmPickupAddress';
import { alertAdmin } from '@/lib/alerts';

export const dynamic = 'force-dynamic';

// A seller's own pickup address, from their Farm Profile.
//   { action: 'get' }                          — the address on file, if any
//   { action: 'save', address, zip, city }     — set or change it; every one
//                                                of their listings moves to it
// The address is private, so it is only ever read and written here, for the
// signed-in seller it belongs to.
export async function POST(request: Request) {
  try {
    const user = await getRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));

    if (body.action === 'save') {
      const address = typeof body.address === 'string' ? body.address.trim().slice(0, 300) : '';
      const zip = typeof body.zip === 'string' ? body.zip.replace(/\D/g, '').slice(0, 5) : '';
      const city = typeof body.city === 'string' ? body.city.trim().slice(0, 100) : '';

      if (!address) return NextResponse.json({ error: 'Enter your pickup address.' }, { status: 400 });
      if (zip.length !== 5) return NextResponse.json({ error: 'Enter the 5-digit zip code for your pickup address.' }, { status: 400 });
      if (!city) return NextResponse.json({ error: 'Enter the city for your pickup address.' }, { status: 400 });

      const { listingsMoved } = await saveFarmPickup(user.id, { address, zip, city });
      return NextResponse.json({ success: true, pickup: { address, zip, city }, listingsMoved });
    }

    return NextResponse.json({ pickup: await getFarmPickup(user.id) });
  } catch (err: any) {
    console.error('farm pickup address error:', err);
    await alertAdmin('farm pickup address error', err);
    return NextResponse.json({ error: 'Could not save your pickup address. Please try again.' }, { status: 500 });
  }
}
