import { NextResponse } from 'next/server';
import { parseCartItems, priceCart, MAX_CART_LINES } from '@/lib/checkoutCart';
import { TaxError, TAX_ENABLED } from '@/lib/tax';
import { alertAdmin } from '@/lib/alerts';

export const dynamic = 'force-dynamic';

// Tells the checkout page what is in the buyer's cart and what it will cost,
// including sales tax, so it can list the items and size the payment form
// before the buyer pays. The payment itself is created by /api/checkout, which
// works the totals out again on its own — nothing sent from the browser is
// trusted for the charge.
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const items = parseCartItems(body.items);

    if (!items) {
      return NextResponse.json(
        { error: `Your cart couldn't be read. It can hold up to ${MAX_CART_LINES} different listings.` },
        { status: 400 }
      );
    }

    const cart = await priceCart(items);

    return NextResponse.json({
      lines: cart.lines,
      subtotalCents: cart.subtotalCents,
      feeCents: cart.feeCents,
      taxCents: cart.taxCents,
      totalCents: cart.totalCents,
      ok: cart.ok,
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
