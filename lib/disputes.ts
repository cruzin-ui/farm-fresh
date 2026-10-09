import type Stripe from 'stripe';
import { stripeAdmin } from '@/lib/stripeAdmin';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { escapeHtml } from '@/lib/email';
import { alertAdmin, notifyAdmins } from '@/lib/alerts';
import { formatDeadline } from '@/lib/pickupRules';

// SERVER-ONLY. Handles a buyer's bank disputing a payment (a "chargeback").
//
// The payment is on the platform's Stripe account, so the platform is the one
// that loses a dispute: the money and Stripe's dispute fee. When a dispute is
// opened this:
//   - marks every order on that payment, which stops any further payout on it;
//   - drafts the evidence in Stripe (what was bought, and when the buyer's
//     pickup code was entered) WITHOUT submitting it, so an admin can review
//     and send it from the Stripe Dashboard;
//   - emails the admins what happened and what to do.
// When the dispute is decided, the orders are updated and the admins told.

const paymentIdOf = (dispute: Stripe.Dispute) =>
  typeof dispute.payment_intent === 'string' ? dispute.payment_intent : dispute.payment_intent?.id || null;

const stripeDisputeUrl = (dispute: Stripe.Dispute) =>
  `https://dashboard.stripe.com/${dispute.livemode ? '' : 'test/'}disputes/${dispute.id}`;

const dateTime = (value: string | number) =>
  new Date(value).toLocaleString('en-US', { timeZone: 'America/Phoenix', dateStyle: 'medium', timeStyle: 'short' });

async function ordersForPayment(paymentId: string) {
  const { data: orders } = await supabaseAdmin
    .from('orders')
    .select('*')
    .eq('stripe_payment_intent_id', paymentId)
    .order('created_at', { ascending: true });

  const listingIds = [...new Set((orders || []).map((o) => o.listing_id).filter(Boolean))];
  const { data: listings } = listingIds.length
    ? await supabaseAdmin.from('produce_listings').select('id, title, unit_type, farmer_id').in('id', listingIds)
    : { data: [] as any[] };
  const listingById = new Map((listings || []).map((l) => [l.id, l]));

  const farmerIds = [...new Set((listings || []).map((l) => l.farmer_id).filter(Boolean))];
  const { data: farms } = farmerIds.length
    ? await supabaseAdmin.from('seller_profiles').select('id, farm_name').in('id', farmerIds)
    : { data: [] as any[] };
  const farmNameById = new Map((farms || []).map((f: any) => [f.id, f.farm_name]));

  return (orders || []).map((order) => {
    const listing = listingById.get(order.listing_id);
    return {
      order,
      what: `${Number(order.reserved_quantity ?? order.quantity ?? 0)} ${listing?.unit_type || 'units'} of ${listing?.title || 'produce'}`,
      farmName: (listing?.farmer_id && farmNameById.get(listing.farmer_id)) || 'Unknown farm',
    };
  });
}

export async function handleDisputeEvent(event: Stripe.Event, siteUrl: string) {
  const dispute = event.data.object as Stripe.Dispute;
  const paymentId = paymentIdOf(dispute);
  if (!paymentId) return;

  const items = await ordersForPayment(paymentId);
  // Not one of our checkouts.
  if (items.length === 0) return;

  const { error } = await supabaseAdmin
    .from('orders')
    .update({
      stripe_dispute_id: dispute.id,
      dispute_status: dispute.status,
      ...(event.type === 'charge.dispute.created' ? { disputed_at: new Date().toISOString() } : {}),
    })
    .eq('stripe_payment_intent_id', paymentId);
  if (error) throw error;

  const amount = `$${(dispute.amount / 100).toFixed(2)}`;
  const buyerEmail = items[0].order.buyer_email || '';

  const itemRows = items
    .map(({ order, what, farmName }) => {
      const state =
        order.status === 'completed'
          ? `picked up${order.completed_at ? ` ${dateTime(order.completed_at)}` : ''}; seller already paid $${Number(order.farmer_payout_amount ?? 0).toFixed(2)}`
          : order.status === 'cancelled'
            ? `cancelled; $${Number(order.refunded_amount ?? 0).toFixed(2)} already refunded`
            : 'not picked up yet; payout now blocked';
      return `<li><strong>${escapeHtml(what)}</strong> from ${escapeHtml(farmName)} (#${String(order.id).slice(0, 8)}) — ${state}</li>`;
    })
    .join('');

  if (event.type === 'charge.dispute.created') {
    // Draft the evidence. It is saved in Stripe but deliberately not
    // submitted: submitting is final, and an admin should read it first.
    try {
      const lines = items.map(({ order, what, farmName }) => {
        const outcome =
          order.status === 'completed'
            ? `Collected in person${order.completed_at ? ` on ${dateTime(order.completed_at)} (Arizona time)` : ''}: the seller entered the buyer's one-time pickup code, which is issued only to the buyer and shown only on the buyer's order page and confirmation email.`
            : order.status === 'cancelled'
              ? `Cancelled; $${Number(order.refunded_amount ?? 0).toFixed(2)} was refunded to the buyer.`
              : 'Not yet collected.';
        return `- ${what} from ${farmName}, ordered ${dateTime(order.created_at)}. ${outcome}`;
      });

      await stripeAdmin.disputes.update(dispute.id, {
        submit: false,
        evidence: {
          customer_email_address: buyerEmail || undefined,
          product_description:
            'Fresh local produce bought on Farm Fresh Direct, an online marketplace, for collection in person from the grower. Nothing is shipped.',
          uncategorized_text: [
            `The buyer (${buyerEmail || 'email on file'}) paid online and was emailed an order confirmation with a pickup code for each farm.`,
            'An order can only be marked collected by entering that code, which the buyer hands over (or shows as a QR code) at pickup.',
            '',
            'Items on this payment:',
            ...lines,
          ]
            .join('\n')
            .slice(0, 19000),
        },
      });
    } catch (err) {
      console.error('Could not draft dispute evidence:', dispute.id, err);
      await alertAdmin('drafting evidence for a payment dispute', err, { dispute: dispute.id });
    }

    const dueBy = dispute.evidence_details?.due_by ? formatDeadline(new Date(dispute.evidence_details.due_by * 1000)) : null;

    await notifyAdmins(
      `Payment disputed: ${amount}`,
      `
        <h2 style="color: #b91c1c;">A buyer's bank has disputed a payment</h2>
        <p>
          <strong>${amount}</strong> paid by ${escapeHtml(buyerEmail || 'an unknown buyer')} is being disputed
          (reason given: ${escapeHtml(dispute.reason || 'not stated')}). Stripe has taken that amount, plus its
          dispute fee, out of your balance until the bank decides.
        </p>
        <ul>${itemRows}</ul>
        <p><strong>What to do${dueBy ? ` by ${dueBy}` : ''}:</strong></p>
        <ol>
          <li>
            <a href="${stripeDisputeUrl(dispute)}">Open the dispute in Stripe</a>. We have drafted the evidence
            there: what was bought and when the pickup code was entered. Read it, add anything else you have,
            and submit it. It is not sent until you do.
          </li>
          <li>
            If you accept the buyer is right, accept the dispute in Stripe instead.
          </li>
        </ol>
        <p>
          Any item on this payment that hasn't been picked up can no longer be paid out. Money already paid to a
          seller is not taken back automatically: if you decide a seller should bear the loss, reverse their
          transfer in Stripe.
        </p>
        <p><a href="${siteUrl}/admin">Open the admin page</a></p>
      `
    );
    return;
  }

  if (event.type === 'charge.dispute.closed') {
    const won = dispute.status === 'won' || dispute.status === 'warning_closed';
    await notifyAdmins(
      `Payment dispute ${won ? 'won' : dispute.status === 'lost' ? 'lost' : 'closed'}: ${amount}`,
      `
        <h2 style="color: ${won ? '#059669' : '#b91c1c'};">A payment dispute has been decided</h2>
        <p>
          The dispute over <strong>${amount}</strong> from ${escapeHtml(buyerEmail || 'an unknown buyer')} was
          closed as <strong>${escapeHtml(dispute.status)}</strong>.
          ${
            won
              ? 'The money has been returned to your Stripe balance, and any open items on the payment can be paid out again.'
              : 'The buyer keeps the money. Anything already paid to a seller for it has not been taken back; reverse the transfer in Stripe if the seller should bear the loss.'
          }
        </p>
        <ul>${itemRows}</ul>
        <p><a href="${stripeDisputeUrl(dispute)}">View it in Stripe</a></p>
      `
    );
  }
}
