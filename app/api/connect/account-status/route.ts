import { NextResponse } from 'next/server';
import { stripeAdmin } from '@/lib/stripeAdmin';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getRequestUser } from '@/lib/apiAuth';

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

    const account = await stripeAdmin.accounts.retrieve(profile.stripe_account_id);
    const complete = Boolean(account.details_submitted && account.payouts_enabled);

    await supabaseAdmin
      .from('seller_profiles')
      .update({ stripe_onboarding_complete: complete })
      .eq('id', user.id);

    return NextResponse.json({ complete, detailsSubmitted: account.details_submitted, payoutsEnabled: account.payouts_enabled });
  } catch (err: any) {
    console.error('account-status error:', err);
    return NextResponse.json({ error: err.message || 'Failed to check account status.' }, { status: 500 });
  }
}
