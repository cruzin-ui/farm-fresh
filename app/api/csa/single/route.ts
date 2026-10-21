import { NextResponse } from 'next/server';
import { stripeAdmin } from '@/lib/stripeAdmin';
import { getRequestUser } from '@/lib/apiAuth';
import { isBuyerBlocked } from '@/lib/accountBlocks';
import { verifyCaptcha, allowCheckoutAttempt, requestIp } from '@/lib/checkoutGuard';
import { SELLER_FEE_RATE } from '@/lib/pricing';
import { TaxError } from '@/lib/tax';
import { alertAdmin } from '@/lib/alerts';
import { nextSingleBox, singleBoxPrice, type CsaPlan } from '@/lib/csa';
import { SHARES_METADATA_KEY } from '@/lib/orderShares';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { formatBoxDate } from '@/lib/csaSchedule';

export const dynamic = 'force-dynamic';

// Buying just one Farm Box, without signing up: an ordinary one-off payment,
// like a checkout, for the next box the farm is packing. Guests can do it with
// an email address, as at checkout.
//   { action: 'quote', planId }   — the box date and the total, tax included
//   { action: 'pay', planId, guestEmail?, captchaToken }
//       creates the payment; the browser confirms it with Stripe and then
//       calls /api/checkout/complete, which records the order as usual.
export async function POST(request: Request) {
  try {
    const user = await getRequestUser(request);
    const body = await request.json().catch(() => ({}));

    const { data: planRow } = await supabaseAdmin
      .from('csa_plans')
      .select('*')
      .eq('id', typeof body.planId === 'string' ? body.planId : '')
      .maybeSingle();
    const plan = planRow as CsaPlan | null;
    if (!plan) return NextResponse.json({ error: 'This Farm Box could not be found.' }, { status: 404 });
    if (user && plan.farmer_id === user.id) {
      return NextResponse.json({ error: "This is your own Farm Box, so you can't buy it." }, { status: 409 });
    }

    const next = await nextSingleBox(plan);
    if ('problem' in next) return NextResponse.json({ error: next.problem }, { status: 409 });

    const price = await singleBoxPrice(plan, next.boxDate);

    if (body.action === 'quote') {
      return NextResponse.json({
        boxDate: next.boxDate,
        boxLabel: formatBoxDate(next.boxDate, { long: true }),
        priceCents: price.priceCents,
        feeCents: price.feeCents,
        taxCents: price.taxCents,
        totalCents: price.totalCents,
        leftOut: price.leftOut,
      });
    }

    if (body.action !== 'pay') return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });

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

    const ip = requestIp(request);
    if (!(await verifyCaptcha(typeof body.captchaToken === 'string' ? body.captchaToken : '', ip, new URL(request.url).hostname))) {
      return NextResponse.json(
        { error: "We couldn't confirm you're not a robot. Please wait for the check above the Pay button to finish, then try again." },
        { status: 400 }
      );
    }
    if (!(await allowCheckoutAttempt(ip, buyerEmail))) {
      return NextResponse.json(
        { error: 'Too many payment attempts from this connection. Please wait 15 minutes and try again.' },
        { status: 429 }
      );
    }

    const checkoutId = crypto.randomUUID();
    const paymentIntent = await stripeAdmin.paymentIntents.create({
      amount: price.totalCents,
      currency: 'usd',
      allowed_payment_method_types: ['card'],
      ...(price.calculationId ? { hooks: { inputs: { tax: { calculation: price.calculationId } } } } : {}),
      transfer_group: `checkout-${checkoutId}`,
      description: `Farm Fresh Direct — ${plan.name} (one box), ${formatBoxDate(next.boxDate)}`,
      metadata: {
        checkout_id: checkoutId,
        buyer_id: user?.id || '',
        buyer_email: buyerEmail,
        seller_fee_rate: String(SELLER_FEE_RATE),
        item_count: '1',
        item_0: [plan.listing_id, 1, price.priceCents, price.feeCents, price.taxCents, ''].join(':'),
        csa_plan_id: plan.id,
        csa_box_date: next.boxDate,
        csa_single: '1',
        ...(price.shares ? { [SHARES_METADATA_KEY]: price.shares } : {}),
      },
    });

    return NextResponse.json({ clientSecret: paymentIntent.client_secret, totalCents: price.totalCents });
  } catch (err: any) {
    if (err instanceof TaxError) return NextResponse.json({ error: err.message }, { status: 409 });
    console.error('single farm box error:', err);
    await alertAdmin('single Farm Box', err);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
