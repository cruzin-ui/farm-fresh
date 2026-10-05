import { NextResponse } from 'next/server';
import { stripeAdmin } from '@/lib/stripeAdmin';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getRequestUser } from '@/lib/apiAuth';
import { setWeeklyPayouts } from '@/lib/payoutSchedule';
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

    // Accounts v2 only returns the configuration when explicitly included.
    const account = await stripeAdmin.v2.core.accounts.retrieve(profile.stripe_account_id, {
      include: ['configuration.recipient'],
    });

    // The seller can be paid once Stripe has activated the transfers
    // capability, which happens after their onboarding details are verified.
    const transfersStatus =
      account.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status ?? null;
    const complete = transfersStatus === 'active';

    // Make sure a farmer who has finished setup is on the weekly payout
    // schedule (also covers accounts created before the schedule was set).
    if (complete) {
      await setWeeklyPayouts(profile.stripe_account_id);
    }

    await supabaseAdmin
      .from('seller_profiles')
      .update({ stripe_onboarding_complete: complete })
      .eq('id', user.id);

    return NextResponse.json({ complete, transfersStatus });
  } catch (err: any) {
    console.error('account-status error:', err);
    await alertAdmin('account-status error', err);
    return NextResponse.json({ error: err.message || 'Failed to check account status.' }, { status: 500 });
  }
}
