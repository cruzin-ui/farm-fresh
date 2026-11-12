import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { stripeAdmin } from '@/lib/stripeAdmin';
import { getRequestUser } from '@/lib/apiAuth';
import { alertAdmin } from '@/lib/alerts';

export const dynamic = 'force-dynamic';

// A one-time sign-in link to the seller's own Stripe dashboard (Express),
// where they see their bank deposits, change their bank account and download
// the 1099 tax forms Stripe sends. The link works once and expires within
// minutes, so it is made when the button is pressed.
export async function POST(request: Request) {
  try {
    const user = await getRequestUser(request);
    if (!user) return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 });

    const { data: profile } = await supabaseAdmin
      .from('seller_profiles')
      .select('stripe_account_id, stripe_onboarding_complete')
      .eq('id', user.id)
      .maybeSingle();
    if (!profile?.stripe_account_id || !profile.stripe_onboarding_complete) {
      return NextResponse.json({ error: 'Finish connecting your payouts first.' }, { status: 409 });
    }

    const link = await stripeAdmin.accounts.createLoginLink(profile.stripe_account_id);
    return NextResponse.json({ url: link.url });
  } catch (err: any) {
    console.error('stripe dashboard link error:', err);
    await alertAdmin('Stripe dashboard link', err);
    return NextResponse.json({ error: 'Could not open Stripe just now. Please try again.' }, { status: 500 });
  }
}
