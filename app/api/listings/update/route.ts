import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getRequestUser } from '@/lib/apiAuth';
import { checkListingAllowed, saveListingPickupAddress, MAX_LISTING_TAGS } from '@/lib/listingRules';
import { isAllowedCategory, PRODUCE_ONLY_NOTICE } from '@/lib/categories';
import { geocodeZip } from '@/lib/geo';
import { alertAdmin } from '@/lib/alerts';

export const dynamic = 'force-dynamic';

// What a listing *is*. Orders look these up from the listing rather than
// keeping their own copy, so once a listing has any orders they are frozen —
// otherwise editing "Potatoes, lbs" into "Tomatoes, dozen" would rewrite what
// past buyers appear to have bought.
const IDENTITY_FIELDS = ['title', 'variety', 'category', 'unit_type'] as const;

// Lets a farmer edit their own listing. Price changes only affect new orders:
// existing orders keep what the buyer was charged.
export async function POST(request: Request) {
  try {
    const user = await getRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 });
    }

    const body = await request.json();
    const { listingId, fields } = body;

    if (!listingId || !fields || typeof fields !== 'object') {
      return NextResponse.json({ error: 'Missing listing or changes.' }, { status: 400 });
    }

    const { data: listing, error: fetchError } = await supabaseAdmin
      .from('produce_listings')
      .select('*')
      .eq('id', listingId)
      .maybeSingle();

    if (fetchError || !listing || listing.farmer_id !== user.id) {
      return NextResponse.json({ error: 'Listing not found.' }, { status: 404 });
    }

    if (listing.status === 'removed') {
      return NextResponse.json(
        { error: 'This listing was removed by Farm Fresh Direct and can no longer be changed. Contact us if you think that was a mistake.' },
        { status: 403 }
      );
    }

    const { count: orderCount, error: countError } = await supabaseAdmin
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('listing_id', listingId);

    if (countError) {
      return NextResponse.json({ error: countError.message }, { status: 500 });
    }

    const hasOrders = (orderCount ?? 0) > 0;
    const update: Record<string, unknown> = {};

    const title = typeof fields.title === 'string' ? fields.title.trim() : listing.title;
    const variety = typeof fields.variety === 'string' ? fields.variety.trim() || null : listing.variety ?? null;
    const category = typeof fields.category === 'string' ? fields.category : listing.category;
    const unitType = typeof fields.unit_type === 'string' ? fields.unit_type : listing.unit_type;

    // Also stops a listing in a category that has since been removed (such
    // as seeds) from being edited back onto sale.
    if (!isAllowedCategory(category)) {
      return NextResponse.json(
        { error: `This category can no longer be sold here. ${PRODUCE_ONLY_NOTICE}` },
        { status: 400 }
      );
    }

    if (!title) {
      return NextResponse.json({ error: 'Crop name is required.' }, { status: 400 });
    }

    const identity: Record<(typeof IDENTITY_FIELDS)[number], unknown> = {
      title,
      variety,
      category,
      unit_type: unitType,
    };

    for (const field of IDENTITY_FIELDS) {
      if (identity[field] === (listing[field] ?? null)) continue;

      if (hasOrders) {
        return NextResponse.json(
          {
            error:
              'This listing already has orders, so its crop name, variety, category and unit can no longer be changed. Create a new post to sell something different.',
          },
          { status: 409 }
        );
      }
      update[field] = identity[field];
    }

    if (fields.price_per_unit !== undefined) {
      const price = Number(fields.price_per_unit);
      if (!Number.isFinite(price) || price < 0) {
        return NextResponse.json({ error: 'Enter a valid price.' }, { status: 400 });
      }
      update.price_per_unit = price;
    }

    if (fields.available_quantity !== undefined) {
      const quantity = Number(fields.available_quantity);
      // Buyers order whole units, so a fractional quantity would leave a
      // remainder nobody can buy.
      if (!Number.isInteger(quantity) || quantity < 0) {
        return NextResponse.json({ error: 'Enter the quantity as a whole number.' }, { status: 400 });
      }
      update.available_quantity = quantity;
    }

    if (typeof fields.description === 'string') update.description = fields.description;
    if (typeof fields.pickup_instructions === 'string') update.pickup_instructions = fields.pickup_instructions;
    if (typeof fields.location_name === 'string' && fields.location_name.trim()) {
      update.location_name = fields.location_name.trim();
    }
    if (typeof fields.zip_code === 'string') {
      update.zip_code = fields.zip_code.trim();

      // Keep the listing's location in step with its zip code (and fill it in
      // for listings posted before locations were stored).
      if (update.zip_code !== listing.zip_code || listing.latitude == null) {
        const coordinates = await geocodeZip(update.zip_code as string);
        update.latitude = coordinates?.latitude ?? null;
        update.longitude = coordinates?.longitude ?? null;
      }
    }
    if (typeof fields.harvest_ready_date === 'string' && fields.harvest_ready_date) {
      update.harvest_ready_date = fields.harvest_ready_date;
    }
    if (fields.harvest_end_date !== undefined) update.harvest_end_date = fields.harvest_end_date || null;
    if (typeof fields.image_url === 'string' && fields.image_url) update.image_url = fields.image_url;
    if (Array.isArray(fields.tags)) {
      update.tags = fields.tags.filter((t: unknown) => typeof t === 'string').slice(0, MAX_LISTING_TAGS);
    }

    // Stored separately from the listing row; applies to orders placed from now on.
    const pickupAddress = typeof fields.pickup_address === 'string' ? fields.pickup_address.trim() : '';
    if (pickupAddress) {
      await saveListingPickupAddress(listingId, user.id, pickupAddress);
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ success: true });
    }

    // If the listing will be on sale after this edit, it must not duplicate
    // another of the farmer's listings. Putting a sold-out or taken-down
    // listing back on sale also counts toward the cap.
    const wasOnSale = Number(listing.available_quantity ?? 0) >= 1;
    const willBeOnSale = Number(update.available_quantity ?? listing.available_quantity ?? 0) >= 1;

    if (willBeOnSale) {
      const notAllowed = await checkListingAllowed({
        farmerId: user.id,
        title,
        variety,
        excludeListingId: listingId,
        enforceCap: !wasOnSale,
      });

      if (notAllowed) {
        return NextResponse.json({ error: notAllowed }, { status: 409 });
      }
    }

    const { error: updateError } = await supabaseAdmin
      .from('produce_listings')
      .update(update)
      .eq('id', listingId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('listing update error:', err);
    await alertAdmin('listing update error', err);
    return NextResponse.json({ error: err.message || 'Failed to update listing.' }, { status: 500 });
  }
}
