import { NextResponse } from 'next/server';
import { verifyCaptcha, allowLookupAttempt, requestIp } from '@/lib/checkoutGuard';
import { sendGuestOrderLinks, looksLikeEmail } from '@/lib/orderLinks';
import { alertAdmin } from '@/lib/alerts';

export const dynamic = 'force-dynamic';

// "Email me my order links": for someone who checked out as a guest and has
// lost their confirmation email. They give the address they ordered with and
// the links are sent there.
//
// The answer is the same whether or not that address has any orders, so this
// can't be used to find out who is a customer, and nothing about an order is
// ever returned to the browser.
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const captchaToken = typeof body.captchaToken === 'string' ? body.captchaToken : '';

    if (!looksLikeEmail(email)) {
      return NextResponse.json({ error: 'Enter the email address you ordered with.' }, { status: 400 });
    }

    const ip = requestIp(request);
    if (!(await verifyCaptcha(captchaToken, ip, new URL(request.url).hostname))) {
      return NextResponse.json(
        { error: "We couldn't confirm you're not a robot. Please wait for the check to finish, then try again." },
        { status: 400 }
      );
    }
    if (!(await allowLookupAttempt(ip, email))) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait an hour and try again, or contact us if you need help.' },
        { status: 429 }
      );
    }

    await sendGuestOrderLinks(email, new URL(request.url).origin);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('order lookup error:', err);
    await alertAdmin('order lookup error', err);
    return NextResponse.json({ error: 'Something went wrong. Please try again, or contact us.' }, { status: 500 });
  }
}
