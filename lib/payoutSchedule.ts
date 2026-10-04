import { stripeAdmin } from '@/lib/stripeAdmin';

// SERVER-ONLY. Farmers are paid out to their bank once a week rather than on
// Stripe's default daily schedule. Stripe charges the platform a fee for every
// payout, so a farmer with sales on several days would otherwise cost several
// fees a week.
export const PAYOUT_DAY = 'friday';

// Puts a farmer's connected account on the weekly schedule. Safe to call
// repeatedly. Never throws: a farmer left on the default schedule still gets
// paid, it just costs more in fees, so this must not block onboarding.
export async function setWeeklyPayouts(accountId: string) {
  try {
    await stripeAdmin.balanceSettings.update(
      { payments: { payouts: { schedule: { interval: 'weekly', weekly_payout_days: [PAYOUT_DAY] } } } },
      { stripeAccount: accountId }
    );
    return true;
  } catch (err: any) {
    console.error(`Could not set weekly payouts for ${accountId}:`, err?.message || err);
    return false;
  }
}
