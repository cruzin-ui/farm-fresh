import { NextResponse } from 'next/server';
import { stripeAdmin } from '@/lib/stripeAdmin';
import { getRequestUser } from '@/lib/apiAuth';
import { MIN_CHARGE_CENTS, SELLER_FEE_RATE } from '@/lib/pricing';
import { parseCartItems, priceCart } from '@/lib/checkoutCart';
import { TaxError } from '@/lib/tax';
import { alertAdmin } from '@/lib/alerts';
import { verifyCaptcha, allowCheckoutAttempt, requestIp } from '@/lib/checkoutGuard';
import { isBuyerBlocked } from '@/lib/accountBlocks';

export const dynamic = 'force-dynamic';

// Step 1 of checkout: creates ONE Stripe PaymentIntent on the platform account
// for everything in the buyer's cart, which may come from several farms. The
// whole payment is held by the platform; each farmer's share (their produce
// subtotal, less the seller fee) is only transferred to their connected
// account when their item is marked completed — see /api/orders/complete. The
// buyer fee and seller fee stay with the platform. The orders themselves (one
// per item) are recorded by /api/checkout/complete once payment succeeds.
export async function POST(request: Request) {
  try {
    const user = await getRequestUser(request);

    const body = await request.json();

    // Buyers either sign in or check out as a guest with just an email
    // address, which is where their confirmation and pickup codes are sent.
    const guestEmail = typeof body.guestEmail === 'string' ? body.guestEmail.trim().toLowerCase() : '';

    if (!user && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail)) {
      return NextResponse.json(
        { error: 'Enter a valid email address so we can send your confirmation and pickup code.' },
        { status: 400 }
      );
    }

    const buyerEmail = user ? user.email || '' : guestEmail;

    if (await isBuyerBlocked({ userId: user?.id, email: buyerEmail })) {
      return NextResponse.json(
        { error: "We can't take orders from this account at the moment. Please contact us if you think this is a mistake." },
        { status: 403 }
      );
    }

    const items = parseCartItems(body.items);
    if (!items) {
      return NextResponse.json({ error: 'Your cart is empty or could not be read.' }, { status: 400 });
    }

    // Guards against scripts trying stolen card numbers: prove a person is
    // here, and cap how many payments one visitor can start.
    const ip = requestIp(request);
    const captchaToken = typeof body.captchaToken === 'string' ? body.captchaToken : '';
    if (!(await verifyCaptcha(captchaToken, ip, new URL(request.url).hostname))) {
      return NextResponse.json(
        { error: "We couldn't confirm you're not a robot. Please wait for the check above the Pay button to finish, then try again." },
        { status: 400 }
      );
    }
    if (!(await allowCheckoutAttempt(ip, buyerEmail))) {
      return NextResponse.json(
        { error: 'Too many payment attempts from this connection. Please wait 15 minutes and try again, or contact us if you need help.' },
        { status: 429 }
      );
    }

    // Totals are always computed server-side from the listing prices — never
    // trusted from the client.
    const cart = await priceCart(items, user?.id);

    const blocked = cart.lines.find((line) => line.problem);
    if (blocked) {
      return NextResponse.json({ error: `${blocked.title}: ${blocked.problem}` }, { status: 409 });
    }

    if (cart.totalCents < MIN_CHARGE_CENTS) {
      return NextResponse.json({ error: 'Order total is below the minimum charge of $0.50.' }, { status: 400 });
    }

    const checkoutId = crypto.randomUUID();

    // What was bought, saved on the payment so the orders can be recorded from
    // it later even if the buyer's browser never comes back. One entry per
    // item: listing, quantity, produce subtotal, fee share and tax, in cents —
    // then, only for carts picked up in several zip codes, the tax calculation
    // the item belongs to.
    const itemMetadata: Record<string, string> = {};
    cart.lines.forEach((line, i) => {
      itemMetadata[`item_${i}`] = [
        line.listingId,
        line.quantity,
        line.subtotalCents,
        line.feeCents,
        line.taxCents,
        cart.manualTaxCalculationByListing.get(line.listingId) || '',
      ].join(':');
    });

    const description =
      cart.lines.length === 1
        ? `Farm Fresh Direct — ${cart.lines[0].quantity} x ${cart.lines[0].title}`
        : `Farm Fresh Direct — ${cart.lines.length} items`;

    const paymentIntent = await stripeAdmin.paymentIntents.create({
      amount: cart.totalCents,
      // Linking the tax calculation lets Stripe record the tax when the
      // payment succeeds and reverse it automatically on refunds.
      ...(cart.calculationId ? { hooks: { inputs: { tax: { calculation: cart.calculationId } } } } : {}),
      currency: 'usd',
      allowed_payment_method_types: ['card'],
      transfer_group: `checkout-${checkoutId}`,
      description,
      metadata: {
        checkout_id: checkoutId,
        // Empty for guest checkouts, which are identified by email alone.
        buyer_id: user?.id || '',
        buyer_email: buyerEmail,
        // The platform's cut of each farmer's share, fixed at the time of purchase.
        seller_fee_rate: String(SELLER_FEE_RATE),
        item_count: String(cart.lines.length),
        ...itemMetadata,
      },
    });

    return NextResponse.json({ clientSecret: paymentIntent.client_secret });
  } catch (err: any) {
    if (err instanceof TaxError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    console.error('Checkout PaymentIntent error:', err);
    await alertAdmin('Checkout PaymentIntent error', err);
    return NextResponse.json(
      { error: err.message || 'Payment processing failed.' },
      { status: 500 }
    );
  }
}
