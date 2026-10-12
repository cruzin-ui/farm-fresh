import { NextResponse } from 'next/server';
import { stripeAdmin } from '@/lib/stripeAdmin';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getRequestUser } from '@/lib/apiAuth';
import { setWeeklyPayouts } from '@/lib/payoutSchedule';
import { alertAdmin, notifyAdmins } from '@/lib/alerts';
import { escapeHtml } from '@/lib/email';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const user = await getRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('seller_profiles')
      .select('stripe_account_id, stripe_onboarding_complete, farm_name')
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

    // The first time a seller is found to have finished, tell the admins: a
    // new farm can now be bought from.
    if (complete && !profile.stripe_onboarding_complete) {
      const origin = new URL(request.url).origin;
      const { count: listingCount } = await supabaseAdmin
        .from('produce_listings')
        .select('id', { count: 'exact', head: true })
        .eq('farmer_id', user.id);
      const farmName = profile.farm_name || 'A seller without a farm name yet';

      await notifyAdmins(
        `New seller ready: ${farmName}`,
        `
          <h2 style="color: #059669;">A seller has finished setting up payouts</h2>
          <p>
            <strong>${escapeHtml(farmName)}</strong> (${escapeHtml(user.email || 'no email on file')}) has
            completed Stripe's verification and can now be paid. Their listings are visible to buyers from now on.
          </p>
          <p>
            They have ${listingCount ?? 0} listing${listingCount === 1 ? '' : 's'} posted${
              listingCount ? '' : ' so far, so a friendly nudge to post their first harvest may help'
            }.
          </p>
          <p>
            <a href="${origin}/sellers/${user.id}">View their farm page</a> ·
            <a href="${origin}/admin">Open the admin page</a>
          </p>
        `
      );
    }

    return NextResponse.json({ complete, transfersStatus });
  } catch (err: any) {
    console.error('account-status error:', err);
    await alertAdmin('account-status error', err);
    return NextResponse.json({ error: err.message || 'Failed to check account status.' }, { status: 500 });
  }
}
