import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { stripeAdmin } from '@/lib/stripeAdmin';
import { getRequestUser } from '@/lib/apiAuth';
import { sellerLedger, arizonaDay } from '@/lib/sellerLedger';
import { alertAdmin } from '@/lib/alerts';

export const dynamic = 'force-dynamic';

// The seller's bank deposits from Stripe, so they can match each one in their
// bank account to the orders it paid for.
//   {}            — the most recent deposits
//   { payoutId }  — what went into one of them, order by order
export async function POST(request: Request) {
  try {
    const user = await getRequestUser(request);
    if (!user) return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 });
    const body = await request.json().catch(() => ({}));

    const { data: profile } = await supabaseAdmin
      .from('seller_profiles')
      .select('stripe_account_id, stripe_onboarding_complete')
      .eq('id', user.id)
      .maybeSingle();
    const account = profile?.stripe_account_id as string | undefined;
    if (!account || !profile?.stripe_onboarding_complete) return NextResponse.json({ deposits: [], connected: false });

    const day = (seconds: number) => arizonaDay(new Date(seconds * 1000).toISOString());

    if (typeof body.payoutId === 'string' && /^po_[A-Za-z0-9]+$/.test(body.payoutId)) {
      // Stripe only returns a payout's lines from the account it belongs to,
      // so another farm's deposit can't be read here.
      const ledger = await sellerLedger(user.id);
      const byTransfer = new Map(ledger.filter((l) => l.transferId).map((l) => [l.transferId as string, l]));

      const items = [];
      for await (const txn of stripeAdmin.balanceTransactions.list(
        { payout: body.payoutId, limit: 100, expand: ['data.source'] },
        { stripeAccount: account }
      )) {
        if (txn.type === 'payout') continue;
        const source = txn.source as any;
        // A payment from us arrives as a charge carrying the transfer it came from.
        const transferId: string | null =
          typeof source?.source_transfer === 'string'
            ? source.source_transfer
            : source?.source_transfer?.id || (typeof source?.id === 'string' && source.id.startsWith('tr_') ? source.id : null);
        const line = transferId ? byTransfer.get(transferId) : undefined;
        items.push({
          id: txn.id,
          day: day(txn.created),
          amountCents: txn.net,
          ref: line?.ref || null,
          orderId: line?.invoice ? line.orderId : null,
          description: line
            ? `${line.item}${line.restockingCents ? ' (restocking fee)' : ''}`
            : txn.net < 0
              ? 'Taken back for a refund or adjustment'
              : txn.description || 'Payment from Farm Fresh Direct',
        });
        if (items.length >= 500) break;
      }
      return NextResponse.json({ items });
    }

    const payouts = await stripeAdmin.payouts.list({ limit: 30 }, { stripeAccount: account });
    return NextResponse.json({
      connected: true,
      deposits: payouts.data.map((p: Stripe.Payout) => ({
        id: p.id,
        amountCents: p.amount,
        // The day it reaches (or reached) the bank.
        arrivalDay: day(p.arrival_date),
        status: p.status,
      })),
    });
  } catch (err: any) {
    console.error('seller deposits error:', err);
    await alertAdmin('seller deposits', err);
    return NextResponse.json({ error: 'Could not load your deposits from Stripe just now. Please try again.' }, { status: 500 });
  }
}
