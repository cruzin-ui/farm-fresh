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
      .select('stripe_account_id, farm_name')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    // Reuse the existing account if one was already created for this seller.
    if (profile?.stripe_account_id) {
      return NextResponse.json({ accountId: profile.stripe_account_id });
    }

    // The farm profile must exist first — it has required fields (like the
    // farm name) that we can't fill in here, and checking before calling
    // Stripe avoids creating a connected account we then fail to save.
    if (!profile) {
      return NextResponse.json(
        { error: 'Please fill out and save your Farm Profile before setting up payouts.' },
        { status: 400 }
      );
    }

    // Accounts v2: a "recipient" account that can receive transfers from our
    // destination charges. The platform pays Stripe fees and covers losses,
    // and the farmer gets the Express Dashboard.
    const account = await stripeAdmin.v2.core.accounts.create({
      contact_email: user.email,
      display_name: profile.farm_name || user.email,
      dashboard: 'express',
      identity: { country: 'us' },
      configuration: {
        recipient: {
          capabilities: {
            stripe_balance: {
              stripe_transfers: { requested: true },
            },
          },
        },
      },
      defaults: {
        responsibilities: {
          fees_collector: 'application',
          losses_collector: 'application',
        },
      },
    });

    // Weekly payouts instead of Stripe's daily default. Tried again when
    // onboarding completes, in case the account isn't ready for it yet.
    await setWeeklyPayouts(account.id);

    const { error: updateError } = await supabaseAdmin
      .from('seller_profiles')
      .update({ stripe_account_id: account.id })
      .eq('id', user.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ accountId: account.id });
  } catch (err: any) {
    console.error('create-account error:', err);
    await alertAdmin('create-account error', err);
    return NextResponse.json({ error: err.message || 'Failed to create account.' }, { status: 500 });
  }
}
