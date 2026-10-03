import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getRequestUser } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

const MAX_TAGS = 3;

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
      if (!Number.isFinite(quantity) || quantity < 0) {
        return NextResponse.json({ error: 'Enter a valid quantity.' }, { status: 400 });
      }
      update.available_quantity = quantity;
    }

    if (typeof fields.description === 'string') update.description = fields.description;
    if (typeof fields.pickup_instructions === 'string') update.pickup_instructions = fields.pickup_instructions;
    if (typeof fields.location_name === 'string' && fields.location_name.trim()) {
      update.location_name = fields.location_name.trim();
    }
    if (typeof fields.zip_code === 'string') update.zip_code = fields.zip_code.trim();
    if (typeof fields.harvest_ready_date === 'string' && fields.harvest_ready_date) {
      update.harvest_ready_date = fields.harvest_ready_date;
    }
    if (fields.harvest_end_date !== undefined) update.harvest_end_date = fields.harvest_end_date || null;
    if (typeof fields.image_url === 'string' && fields.image_url) update.image_url = fields.image_url;
    if (Array.isArray(fields.tags)) {
      update.tags = fields.tags.filter((t: unknown) => typeof t === 'string').slice(0, MAX_TAGS);
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ success: true });
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
    return NextResponse.json({ error: err.message || 'Failed to update listing.' }, { status: 500 });
  }
}
