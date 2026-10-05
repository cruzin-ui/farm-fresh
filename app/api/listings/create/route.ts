import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getRequestUser } from '@/lib/apiAuth';
import { checkListingAllowed, saveListingPickupAddress, MAX_LISTING_TAGS } from '@/lib/listingRules';
import { SELLER_TERMS_VERSION } from '@/lib/sellerTerms';
import { geocodeZip } from '@/lib/geo';
import { alertAdmin } from '@/lib/alerts';

export const dynamic = 'force-dynamic';

// Publishes a new listing for the signed-in farmer. Creation goes through the
// server (rather than the browser writing to the database directly) so the
// duplicate and listing-cap rules can't be bypassed.
export async function POST(request: Request) {
  try {
    const user = await getRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 });
    }

    const body = await request.json();
    const fields = body.fields;

    if (!fields || typeof fields !== 'object') {
      return NextResponse.json({ error: 'Missing listing details.' }, { status: 400 });
    }

    const title = typeof fields.title === 'string' ? fields.title.trim() : '';
    const variety = typeof fields.variety === 'string' ? fields.variety.trim() || null : null;
    const price = Number(fields.price_per_unit);
    const quantity = Number(fields.available_quantity);
    const locationName = typeof fields.location_name === 'string' ? fields.location_name.trim() : '';
    const pickupAddress = typeof fields.pickup_address === 'string' ? fields.pickup_address.trim() : '';

    if (!title) {
      return NextResponse.json({ error: 'Crop name is required.' }, { status: 400 });
    }
    if (!Number.isFinite(price) || price < 0) {
      return NextResponse.json({ error: 'Enter a valid price.' }, { status: 400 });
    }
    // Buyers order whole units, so a fractional quantity would leave a
    // remainder nobody can buy.
    if (!Number.isInteger(quantity) || quantity < 1) {
      return NextResponse.json({ error: 'Enter the quantity as a whole number of at least 1.' }, { status: 400 });
    }
    if (!fields.harvest_ready_date) {
      return NextResponse.json({ error: 'A ready date is required.' }, { status: 400 });
    }
    if (!locationName) {
      return NextResponse.json({ error: 'A city or area is required.' }, { status: 400 });
    }
    if (!pickupAddress) {
      return NextResponse.json({ error: 'A pickup address is required.' }, { status: 400 });
    }

    const notAllowed = await checkListingAllowed({
      farmerId: user.id,
      title,
      variety,
      enforceCap: true,
    });

    if (notAllowed) {
      return NextResponse.json({ error: notAllowed }, { status: 409 });
    }

    // Sellers agree to the Seller Terms once, before their first listing. The
    // acceptance is recorded with a timestamp and the version they agreed to.
    const { data: acceptance } = await supabaseAdmin
      .from('seller_terms_acceptances')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!acceptance) {
      if (body.acceptTerms !== true) {
        return NextResponse.json(
          { error: 'Please read and agree to the Seller Terms before posting your first listing.' },
          { status: 400 }
        );
      }

      const { error: acceptError } = await supabaseAdmin
        .from('seller_terms_acceptances')
        .upsert({ user_id: user.id, accepted_at: new Date().toISOString(), terms_version: SELLER_TERMS_VERSION });

      if (acceptError) {
        return NextResponse.json({ error: acceptError.message }, { status: 500 });
      }
    }

    // The centre of the listing's zip code, so buyers can search by distance.
    // A failed lookup just leaves the listing without a location.
    const zipCode = typeof fields.zip_code === 'string' ? fields.zip_code.trim() : '';
    const coordinates = await geocodeZip(zipCode);

    const { data: listing, error: insertError } = await supabaseAdmin
      .from('produce_listings')
      .insert([
        {
          farmer_id: user.id,
          title,
          variety,
          category: typeof fields.category === 'string' ? fields.category : 'Vegetables',
          description: typeof fields.description === 'string' ? fields.description : '',
          unit_type: typeof fields.unit_type === 'string' ? fields.unit_type : 'lbs',
          price_per_unit: price,
          available_quantity: quantity,
          harvest_ready_date: fields.harvest_ready_date,
          harvest_end_date: fields.harvest_end_date || null,
          location_name: locationName,
          zip_code: zipCode,
          latitude: coordinates?.latitude ?? null,
          longitude: coordinates?.longitude ?? null,
          pickup_instructions: typeof fields.pickup_instructions === 'string' ? fields.pickup_instructions : '',
          tags: Array.isArray(fields.tags)
            ? fields.tags.filter((t: unknown) => typeof t === 'string').slice(0, MAX_LISTING_TAGS)
            : [],
          image_url: typeof fields.image_url === 'string' && fields.image_url ? fields.image_url : null,
          status: 'active',
        },
      ])
      .select('id')
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    try {
      await saveListingPickupAddress(listing.id, user.id, pickupAddress);
    } catch (addressError) {
      await supabaseAdmin.from('produce_listings').delete().eq('id', listing.id);
      throw addressError;
    }

    return NextResponse.json({ success: true, listingId: listing.id });
  } catch (err: any) {
    console.error('listing create error:', err);
    await alertAdmin('listing create error', err);
    return NextResponse.json({ error: err.message || 'Failed to publish listing.' }, { status: 500 });
  }
}
