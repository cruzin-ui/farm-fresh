import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getRequestUser } from '@/lib/apiAuth';
import { alertAdmin } from '@/lib/alerts';

export const dynamic = 'force-dynamic';

// Removes a farmer's listing from sale. A listing with no orders is deleted
// outright. A listing that has ever been ordered is only taken down (its
// available quantity set to 0, which hides it from Browse): its orders look up
// the crop, the farmer and the payout destination through it, so deleting it
// would strand them — and any money still held for them.
export async function POST(request: Request) {
  try {
    const user = await getRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 });
    }

    const body = await request.json();
    const { listingId } = body;

    if (!listingId) {
      return NextResponse.json({ error: 'Missing listing.' }, { status: 400 });
    }

    const { data: listing, error: fetchError } = await supabaseAdmin
      .from('produce_listings')
      .select('id, farmer_id')
      .eq('id', listingId)
      .maybeSingle();

    if (fetchError || !listing || listing.farmer_id !== user.id) {
      return NextResponse.json({ error: 'Listing not found.' }, { status: 404 });
    }

    const { count: orderCount, error: countError } = await supabaseAdmin
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('listing_id', listingId);

    if (countError) {
      return NextResponse.json({ error: countError.message }, { status: 500 });
    }

    if ((orderCount ?? 0) > 0) {
      const { error: updateError } = await supabaseAdmin
        .from('produce_listings')
        .update({ available_quantity: 0 })
        .eq('id', listingId);

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, takenDown: true });
    }

    const { error: deleteError } = await supabaseAdmin
      .from('produce_listings')
      .delete()
      .eq('id', listingId);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, deleted: true });
  } catch (err: any) {
    console.error('listing remove error:', err);
    await alertAdmin('listing remove error', err);
    return NextResponse.json({ error: err.message || 'Failed to remove listing.' }, { status: 500 });
  }
}
