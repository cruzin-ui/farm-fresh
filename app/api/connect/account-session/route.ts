import { NextResponse } from 'next/server';
import { stripeAdmin } from '@/lib/stripeAdmin';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getRequestUser } from '@/lib/apiAuth';
import { alertAdmin } from '@/lib/alerts';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const user = await getRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('seller_profiles')
      .select('stripe_account_id')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError || !profile?.stripe_account_id) {
      return NextResponse.json({ error: 'No connected account found for this seller.' }, { status: 404 });
    }

    const accountSession = await stripeAdmin.accountSessions.create({
      account: profile.stripe_account_id,
      components: {
        account_onboarding: { enabled: true },
      },
    });

    return NextResponse.json({ client_secret: accountSession.client_secret });
  } catch (err: any) {
    console.error('account-session error:', err);
    await alertAdmin('account-session error', err);
    return NextResponse.json({ error: err.message || 'Failed to create account session.' }, { status: 500 });
  }
}
