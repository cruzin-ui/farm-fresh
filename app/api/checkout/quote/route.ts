import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { calculateOrderTotals } from '@/lib/pricing';
import { calculateOrderTax, TaxError, TAX_ENABLED } from '@/lib/tax';
import { alertAdmin } from '@/lib/alerts';

export const dynamic = 'force-dynamic';

// Tells the checkout page what an order will cost, including sales tax, so it
// can show the tax line and size the payment form before the buyer pays. The
// payment itself is created by /api/checkout, which works the totals out again
// on its own — nothing sent from the browser is trusted for the charge.
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { listingId } = body;
    const quantity = Number(body.quantity);

    if (!listingId || !Number.isInteger(quantity) || quantity < 1) {
      return NextResponse.json({ error: 'Missing listing or invalid quantity.' }, { status: 400 });
    }

    const { data: listing } = await supabaseAdmin
      .from('produce_listings')
      .select('price_per_unit, category, zip_code')
      .eq('id', listingId)
      .maybeSingle();

    if (!listing) {
      return NextResponse.json({ error: 'Listing not found.' }, { status: 404 });
    }

    const { subtotalCents, feeCents, totalCents } = calculateOrderTotals(
      Number(listing.price_per_unit ?? 0),
      quantity
    );

    const { taxCents } = await calculateOrderTax({
      category: listing.category,
      pickupZip: listing.zip_code,
      subtotalCents,
      feeCents,
    });

    return NextResponse.json({
      subtotalCents,
      feeCents,
      taxCents,
      totalCents: totalCents + taxCents,
      taxEnabled: TAX_ENABLED,
    });
  } catch (err: any) {
    if (err instanceof TaxError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    console.error('checkout quote error:', err);
    await alertAdmin('checkout quote error', err);
    return NextResponse.json({ error: 'Could not price this order.' }, { status: 500 });
  }
}
