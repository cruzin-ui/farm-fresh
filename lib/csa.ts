import type Stripe from 'stripe';
import { stripeAdmin } from '@/lib/stripeAdmin';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { SELLER_FEE_RATE } from '@/lib/pricing';
import { calculateCartTax, TaxError } from '@/lib/tax';
import { recordOrderForPaymentIntent } from '@/lib/orders';
import { refundOrderQuantity } from '@/lib/orderActions';
import { isBuyerBlocked, isSellerSuspended } from '@/lib/accountBlocks';
import { sendEmail, escapeHtml } from '@/lib/email';
import { alertAdmin } from '@/lib/alerts';
import { zipFromAddress } from '@/lib/checkoutCart';
import { boxCostCents } from '@/lib/csaTerms';
import {
  CSA_BOX_CATEGORY,
  CHARGE_DAYS_BEFORE,
  addDays,
  boxDates,
  chargeDateFor,
  formatBoxDate,
  memberGetsBox,
  todayInArizona,
} from '@/lib/csaSchedule';

// SERVER-ONLY. CSA Farm Boxes: saved cards, and charging each box.
//
// A member's card is saved with Stripe when they join (a SetupIntent, made
// for charging later without them present). Before each pickup the daily job
// (app/api/cron/csa) charges it with an ordinary PaymentIntent made "off
// session", carrying the same details as a checkout. The box then goes through
// recordOrderForPaymentIntent and becomes an order like any other: the money
// is held by the platform and the farm is paid when the buyer's code is
// entered at pickup.

export type CsaPlan = {
  id: string;
  farmer_id: string;
  listing_id: string;
  name: string;
  description: string;
  price_cents: number;
  frequency: string;
  pickup_weekday: number;
  pickup_window: string;
  season_start: string;
  season_end: string;
  max_members: number | null;
  status: 'open' | 'closed' | 'ended';
};

export type CsaMember = {
  id: string;
  plan_id: string;
  buyer_id: string | null;
  buyer_email: string;
  status: 'active' | 'paused' | 'cancelled';
  price_cents: number;
  stripe_customer_id: string;
  stripe_payment_method_id: string;
  card_label: string;
  created_at: string;
};

export type CsaBox = {
  id: string;
  member_id: string;
  plan_id: string;
  box_date: string;
  status: 'reminded' | 'skipped' | 'charging' | 'paid' | 'failed' | 'farm_skipped';
  attempts: number;
  last_error: string | null;
  payment_intent_id: string | null;
  order_id: string | null;
  updated_at: string;
};

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export function siteUrlFrom(request: Request) {
  return process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
}

// "ja•••@gmail.com": enough for a farm to recognise a member they know,
// without handing out the address.
export function maskEmail(email: string | null | undefined) {
  const [name, domain] = String(email || '').split('@');
  if (!name || !domain) return 'Member';
  return `${name.slice(0, 2)}${'•'.repeat(3)}@${domain}`;
}

// ---------- saved cards ----------

// The Stripe customer that holds this buyer's saved cards, created the first
// time they need one.
export async function getOrCreateStripeCustomer(user: { id: string; email?: string | null }) {
  const { data: existing } = await supabaseAdmin
    .from('buyer_stripe_customers')
    .select('stripe_customer_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (existing?.stripe_customer_id) return existing.stripe_customer_id as string;

  const customer = await stripeAdmin.customers.create(
    { email: user.email || undefined, metadata: { user_id: user.id } },
    { idempotencyKey: `customer-${user.id}` }
  );
  const { error } = await supabaseAdmin
    .from('buyer_stripe_customers')
    .upsert({ user_id: user.id, stripe_customer_id: customer.id }, { onConflict: 'user_id', ignoreDuplicates: true });
  if (error) throw error;

  const { data: saved } = await supabaseAdmin
    .from('buyer_stripe_customers')
    .select('stripe_customer_id')
    .eq('user_id', user.id)
    .single();
  return saved!.stripe_customer_id as string;
}

// Starts saving a card: the browser completes it with Stripe, so the card
// number never comes near our servers. `metadata` says what it is for.
export async function startSavingCard(customerId: string, metadata: Record<string, string>) {
  const setupIntent = await stripeAdmin.setupIntents.create({
    customer: customerId,
    usage: 'off_session',
    allowed_payment_method_types: ['card'],
    metadata,
  });
  return setupIntent.client_secret!;
}

// Checks a card-saving attempt finished and belongs to this buyer, and
// returns the saved card.
export async function finishSavingCard(setupIntentId: string, customerId: string) {
  if (typeof setupIntentId !== 'string' || !setupIntentId.startsWith('seti_')) return null;
  const setupIntent = await stripeAdmin.setupIntents.retrieve(setupIntentId, { expand: ['payment_method'] });
  if (setupIntent.status !== 'succeeded' || setupIntent.customer !== customerId) return null;
  const paymentMethod = setupIntent.payment_method as Stripe.PaymentMethod | null;
  if (!paymentMethod?.id) return null;
  return { setupIntent, paymentMethodId: paymentMethod.id, cardLabel: cardLabel(paymentMethod) };
}

// "Visa ending 4242", or "Apple Pay (Visa ending 4242)".
export function cardLabel(paymentMethod: Stripe.PaymentMethod) {
  const card = paymentMethod.card;
  if (!card) return 'Saved card';
  const brand = card.brand ? card.brand.charAt(0).toUpperCase() + card.brand.slice(1) : 'Card';
  const base = `${brand === 'Amex' ? 'American Express' : brand} ending ${card.last4}`;
  const wallet = card.wallet?.type === 'apple_pay' ? 'Apple Pay' : card.wallet?.type === 'google_pay' ? 'Google Pay' : '';
  return wallet ? `${wallet} (${base})` : base;
}

// ---------- the farm ----------

export async function farmFor(farmerId: string) {
  const { data } = await supabaseAdmin
    .from('seller_profiles')
    .select('id, farm_name, slug, stripe_account_id, stripe_onboarding_complete, location, zip_code')
    .eq('id', farmerId)
    .maybeSingle();
  return data;
}

// Why a farm can't be paid for boxes right now, or null when it can.
export async function farmCantSell(farmerId: string) {
  const farm = await farmFor(farmerId);
  if (!farm?.stripe_account_id || !farm.stripe_onboarding_complete) return "the farm hasn't finished setting up payouts";
  if (await isSellerSuspended(farmerId)) return "the farm isn't taking orders right now";
  return null;
}

// Where a plan's boxes are picked up, for working out the tax.
async function pickupZipFor(plan: CsaPlan) {
  const { data: address } = await supabaseAdmin
    .from('listing_pickup_addresses')
    .select('address')
    .eq('listing_id', plan.listing_id)
    .maybeSingle();
  const { data: listing } = await supabaseAdmin
    .from('produce_listings')
    .select('zip_code')
    .eq('id', plan.listing_id)
    .maybeSingle();
  return zipFromAddress(address?.address as string) || String(listing?.zip_code || '');
}

// ---------- charging a box ----------

async function emailMember(member: CsaMember, subject: string, html: string) {
  if (!member.buyer_email) return;
  await sendEmail({
    to: member.buyer_email,
    subject,
    html: `<div style="font-family: sans-serif; max-width: 520px;">${html}</div>`,
  });
}

function manageLink(siteUrl: string) {
  return `${siteUrl}/account/csa`;
}

// Marks a member's box for a date as paid, with its payment and order. Used
// both after charging and by the Stripe webhook, whichever is first.
export async function markBoxPaid(paymentIntent: Stripe.PaymentIntent, orderId: string | null) {
  const memberId = paymentIntent.metadata?.csa_member_id;
  const boxDate = paymentIntent.metadata?.csa_box_date;
  if (!memberId || !boxDate) return;
  await supabaseAdmin
    .from('csa_boxes')
    .update({
      status: 'paid',
      payment_intent_id: paymentIntent.id,
      ...(orderId ? { order_id: orderId } : {}),
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('member_id', memberId)
    .eq('box_date', boxDate);
}

// Takes the box for this member and date for charging, so two runs of the job
// can never charge it twice. Returns the box as it was, or null if it is
// already dealt with or being charged right now.
async function claimBox(member: CsaMember, boxDate: string): Promise<{ attempts: number } | null> {
  const now = new Date().toISOString();
  const { data: existing } = await supabaseAdmin
    .from('csa_boxes')
    .select('*')
    .eq('member_id', member.id)
    .eq('box_date', boxDate)
    .maybeSingle();

  if (!existing) {
    const { error } = await supabaseAdmin
      .from('csa_boxes')
      .insert({ member_id: member.id, plan_id: member.plan_id, box_date: boxDate, status: 'charging', updated_at: now });
    return error ? null : { attempts: 0 };
  }

  // A charge left "under way" for half an hour was cut short; it is checked
  // for a payment that went through before anything is charged again.
  const stale = existing.status === 'charging' && Date.parse(existing.updated_at) < Date.now() - 30 * 60 * 1000;
  if (!['reminded', 'failed'].includes(existing.status) && !stale) return null;

  const { data: claimed } = await supabaseAdmin
    .from('csa_boxes')
    .update({ status: 'charging', updated_at: now })
    .eq('id', existing.id)
    .eq('status', existing.status)
    .eq('updated_at', existing.updated_at)
    .select('id');
  return claimed && claimed.length > 0 ? { attempts: Number(existing.attempts) || 0 } : null;
}

// A payment already taken for this member's box on this date, if there is one.
async function findPaidBox(member: CsaMember, boxDate: string) {
  const recent = await stripeAdmin.paymentIntents.list({ customer: member.stripe_customer_id, limit: 20 });
  return (
    recent.data.find(
      (pi) =>
        pi.status === 'succeeded' && pi.metadata?.csa_member_id === member.id && pi.metadata?.csa_box_date === boxDate
    ) || null
  );
}

async function setBox(memberId: string, boxDate: string, fields: Record<string, unknown>) {
  await supabaseAdmin
    .from('csa_boxes')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('member_id', memberId)
    .eq('box_date', boxDate);
}

export type ChargeOutcome = 'paid' | 'failed' | 'farm_skipped' | 'not_charged';

// Charges one member for one box and records it as an order. Safe to call
// more than once: a box already paid, skipped or being charged is left alone.
export async function chargeBox(params: {
  plan: CsaPlan;
  member: CsaMember;
  boxDate: string;
  siteUrl: string;
  today?: string;
}): Promise<ChargeOutcome> {
  const { plan, member, boxDate, siteUrl } = params;
  const today = params.today || todayInArizona();
  const farm = await farmFor(plan.farmer_id);
  const farmName = farm?.farm_name || 'the farm';

  const claim = await claimBox(member, boxDate);
  if (!claim) return 'not_charged';

  // Nothing is charged for a farm that can't be paid, or a buyer we no longer
  // take orders from.
  const farmProblem = await farmCantSell(plan.farmer_id);
  if (farmProblem) {
    await setBox(member.id, boxDate, { status: 'farm_skipped', last_error: farmProblem });
    await emailMember(
      member,
      `No ${plan.name} box on ${formatBoxDate(boxDate)}`,
      `<p>There's no box from <strong>${escapeHtml(farmName)}</strong> on ${formatBoxDate(boxDate, { long: true })}, because ${escapeHtml(farmProblem)}. You have not been charged for it.</p>
       <p>Your membership carries on as normal.</p>`
    );
    await alertAdmin('CSA box not charged', new Error(farmProblem), { plan: plan.name, farm: farmName, date: boxDate });
    return 'farm_skipped';
  }
  if (await isBuyerBlocked({ userId: member.buyer_id, email: member.buyer_email })) {
    await setBox(member.id, boxDate, { status: 'failed', last_error: 'This buyer is blocked.' });
    return 'failed';
  }

  // A charge that went through but wasn't recorded (the job stopped part
  // way, say) is found and recorded rather than charged again.
  const earlier = await findPaidBox(member, boxDate);
  if (earlier) {
    await setBox(member.id, boxDate, { status: 'paid', payment_intent_id: earlier.id });
    try {
      const { orderId } = await recordOrderForPaymentIntent(earlier, siteUrl);
      await markBoxPaid(earlier, orderId);
    } catch (recordError) {
      await alertAdmin('CSA box charged but its order was not recorded', recordError, { payment: earlier.id });
    }
    return 'paid';
  }

  const cost = boxCostCents(member.price_cents);
  const finalTry = today >= addDays(chargeDateFor(boxDate), 1);
  let lastError = '';

  try {
    const tax = await calculateCartTax([
      {
        category: CSA_BOX_CATEGORY,
        pickupZip: await pickupZipFor(plan),
        subtotalCents: cost.priceCents,
        feeCents: cost.feeCents,
      },
    ]);
    const totalCents = cost.totalCents + tax.taxCents;
    const checkoutId = crypto.randomUUID();

    const paymentIntent = await stripeAdmin.paymentIntents.create(
      {
        amount: totalCents,
        currency: 'usd',
        customer: member.stripe_customer_id,
        payment_method: member.stripe_payment_method_id,
        allowed_payment_method_types: ['card'],
        off_session: true,
        confirm: true,
        ...(tax.calculationId ? { hooks: { inputs: { tax: { calculation: tax.calculationId } } } } : {}),
        transfer_group: `checkout-${checkoutId}`,
        description: `Farm Fresh Direct — ${plan.name} box, ${formatBoxDate(boxDate)}`,
        metadata: {
          checkout_id: checkoutId,
          buyer_id: member.buyer_id || '',
          buyer_email: member.buyer_email,
          seller_fee_rate: String(SELLER_FEE_RATE),
          item_count: '1',
          item_0: [plan.listing_id, 1, cost.priceCents, cost.feeCents, tax.taxCents, ''].join(':'),
          csa_member_id: member.id,
          csa_plan_id: plan.id,
          csa_box_date: boxDate,
        },
      },
      // A retry of the same attempt (say, after a timeout) gets the same
      // payment back instead of charging twice.
      { idempotencyKey: `csa-${member.id}-${boxDate}-${claim.attempts}` }
    );

    if (paymentIntent.status === 'succeeded') {
      await setBox(member.id, boxDate, { status: 'paid', payment_intent_id: paymentIntent.id, attempts: claim.attempts + 1 });
      try {
        const { orderId } = await recordOrderForPaymentIntent(paymentIntent, siteUrl);
        await markBoxPaid(paymentIntent, orderId);
      } catch (recordError) {
        // The payment went through; the webhook records the order as well.
        await alertAdmin('CSA box charged but its order was not recorded', recordError, { payment: paymentIntent.id });
      }
      return 'paid';
    }
    lastError = 'The card needs the cardholder to confirm this payment.';
  } catch (err: any) {
    if (err instanceof TaxError) {
      lastError = err.message;
      await alertAdmin('CSA box tax calculation', err, { plan: plan.name, date: boxDate });
    } else if (err?.type === 'StripeCardError' || err?.code === 'authentication_required') {
      lastError =
        err.code === 'authentication_required'
          ? 'Your bank asked for this payment to be confirmed by you.'
          : err.message || 'Your card was declined.';
    } else {
      // A fault on our side or Stripe's, not the card: tried again next run.
      await setBox(member.id, boxDate, {
        status: 'failed',
        last_error: 'Temporary problem; will retry.',
        attempts: claim.attempts + 1,
      });
      await alertAdmin('CSA box charge', err, { plan: plan.name, member: member.id, date: boxDate });
      return 'failed';
    }
  }

  await setBox(member.id, boxDate, { status: 'failed', last_error: lastError, attempts: claim.attempts + 1 });
  await emailMember(
    member,
    finalTry
      ? `Your ${plan.name} box on ${formatBoxDate(boxDate)} couldn't be paid for`
      : `Action needed: we couldn't charge your card for your ${plan.name} box`,
    `<h2 style="color: #b45309;">We couldn't charge your card</h2>
     <p>Your box from <strong>${escapeHtml(farmName)}</strong> for ${formatBoxDate(boxDate, { long: true })} couldn't be paid for with ${escapeHtml(member.card_label || 'your saved card')}.</p>
     <p style="color: #6b7280;">${escapeHtml(lastError)}</p>
     ${
       finalTry
         ? `<p>We've tried twice, so this week's box has been missed and you have not been charged. Please update your card before your next box.</p>`
         : `<p>We'll try again tomorrow. To make sure you get this box, update your card today; we'll charge the new one straight away.</p>`
     }
     <p><a href="${manageLink(siteUrl)}">Update your card</a></p>`
  );
  return 'failed';
}

// ---------- reminders ----------

export async function sendBoxReminder(params: {
  plan: CsaPlan;
  member: CsaMember;
  boxDate: string;
  note: string;
  siteUrl: string;
}) {
  const { plan, member, boxDate, note, siteUrl } = params;

  // Only once per box: whoever creates the row sends the email.
  const { error } = await supabaseAdmin.from('csa_boxes').insert({
    member_id: member.id,
    plan_id: plan.id,
    box_date: boxDate,
    status: 'reminded',
    reminder_sent_at: new Date().toISOString(),
  });
  if (error) return false;

  const farm = await farmFor(plan.farmer_id);
  const cost = boxCostCents(member.price_cents);
  await emailMember(
    member,
    `Your ${plan.name} box on ${formatBoxDate(boxDate)}: charged tomorrow`,
    `<h2 style="color: #059669;">Your next box is coming up</h2>
     <p><strong>${escapeHtml(plan.name)}</strong> from <strong>${escapeHtml(farm?.farm_name || 'your farm')}</strong>, for pickup on <strong>${formatBoxDate(boxDate, { long: true })}</strong>${plan.pickup_window ? `, ${escapeHtml(plan.pickup_window)}` : ''}.</p>
     ${note ? `<p style="padding: 12px; background: #ecfdf5; border-radius: 8px;"><strong>From the farm:</strong> ${escapeHtml(note)}</p>` : ''}
     <p>Tomorrow we'll charge ${escapeHtml(member.card_label || 'your saved card')} <strong>${money(cost.totalCents)}</strong> plus any sales tax, and send your pickup code.</p>
     <p>Away this week? <a href="${manageLink(siteUrl)}">Skip this box</a> before tomorrow and you won't be charged.</p>`
  );
  return true;
}

// ---------- telling members about changes ----------

export async function liveMembersOf(planId: string) {
  const { data } = await supabaseAdmin
    .from('csa_members')
    .select('*')
    .eq('plan_id', planId)
    .neq('status', 'cancelled');
  return (data || []) as CsaMember[];
}

export async function emailMembers(planId: string, subject: string, html: string) {
  for (const member of await liveMembersOf(planId)) {
    await emailMember(member, subject, html);
  }
}

export async function emailFarm(farmerId: string, subject: string, html: string) {
  const { data } = await supabaseAdmin.auth.admin.getUserById(farmerId);
  if (!data?.user?.email) return;
  await sendEmail({
    to: data.user.email,
    subject,
    html: `<div style="font-family: sans-serif; max-width: 520px;">${html}</div>`,
  });
}

// Cancels a membership. Boxes already charged stay as orders; nothing more is
// charged. `by` decides the wording of the emails.
export async function cancelMembership(params: {
  member: CsaMember;
  plan: CsaPlan;
  reason: string;
  by: 'member' | 'farm' | 'account_deleted' | 'admin';
  siteUrl: string;
}) {
  const { member, plan, reason, by, siteUrl } = params;
  const { error } = await supabaseAdmin
    .from('csa_members')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancel_reason: reason.slice(0, 300) })
    .eq('id', member.id);
  if (error) throw error;

  const farm = await farmFor(plan.farmer_id);
  if (by !== 'account_deleted') {
    await emailMember(
      member,
      `Your ${plan.name} membership has ended`,
      `<p>Your membership of <strong>${escapeHtml(plan.name)}</strong> from <strong>${escapeHtml(farm?.farm_name || 'the farm')}</strong> has been cancelled${by === 'farm' ? ' by the farm' : ''}${reason && by !== 'member' ? `: ${escapeHtml(reason)}` : ''}. Your card won't be charged for any more boxes.</p>
       <p>Any box already paid for is still yours to collect; you'll find it under <a href="${siteUrl}/orders">My Purchases</a>.</p>`
    );
  }
  if (by !== 'farm') {
    await emailFarm(
      plan.farmer_id,
      `A member left ${plan.name}`,
      `<p>${escapeHtml(maskEmail(member.buyer_email))} has left <strong>${escapeHtml(plan.name)}</strong>. Boxes they've already paid for still appear in your orders as usual.</p>`
    );
  }
}

// ---------- buying just one box ----------

// When a box for this date must be ready: the end of its pickup day. Box
// orders are saved with this as their ready-by time.
export function boxReadyBy(boxDate: string) {
  return new Date(`${boxDate}T23:59:00-07:00`);
}

// One-off boxes bought for each of these dates (not counting members' boxes),
// still going ahead.
export async function singleBoxCounts(plan: Pick<CsaPlan, 'id' | 'listing_id'>, dates: string[]) {
  const counts = new Map<string, number>(dates.map((d) => [d, 0]));
  if (dates.length === 0) return counts;
  const { data: orders } = await supabaseAdmin
    .from('orders')
    .select('id, ready_by')
    .eq('listing_id', plan.listing_id)
    .neq('status', 'cancelled')
    .in('ready_by', dates.map((d) => boxReadyBy(d).toISOString()));
  const { data: memberBoxes } = await supabaseAdmin
    .from('csa_boxes')
    .select('order_id')
    .eq('plan_id', plan.id)
    .in('box_date', dates)
    .not('order_id', 'is', null);
  const memberOrderIds = new Set((memberBoxes || []).map((b) => b.order_id));
  for (const order of orders || []) {
    if (memberOrderIds.has(order.id)) continue;
    const date = todayInArizona(new Date(order.ready_by));
    if (counts.has(date)) counts.set(date, (counts.get(date) || 0) + 1);
  }
  return counts;
}

// The box someone buying just one would get: the next pickup the farm hasn't
// charged for yet, isn't skipping, and still has room in. Or why there isn't one.
export async function nextSingleBox(plan: CsaPlan): Promise<{ boxDate: string } | { problem: string }> {
  if (plan.status !== 'open') return { problem: 'This Farm Box isn’t taking orders right now.' };
  if (await farmCantSell(plan.farmer_id)) return { problem: 'This farm isn’t taking orders just yet.' };

  const today = todayInArizona();
  const dates = boxDates(plan, addDays(today, CHARGE_DAYS_BEFORE), 8);
  const { data: weeks } = dates.length
    ? await supabaseAdmin.from('csa_box_weeks').select('box_date, skipped').eq('plan_id', plan.id).in('box_date', dates)
    : { data: [] as any[] };
  const skipped = new Set((weeks || []).filter((w) => w.skipped).map((w) => w.box_date));

  const members = plan.max_members == null ? [] : await liveMembersOf(plan.id);
  const singles = plan.max_members == null ? new Map<string, number>() : await singleBoxCounts(plan, dates);

  for (const boxDate of dates) {
    if (skipped.has(boxDate)) continue;
    if (plan.max_members != null) {
      const { data: skips } = await supabaseAdmin
        .from('csa_boxes')
        .select('member_id')
        .eq('plan_id', plan.id)
        .eq('box_date', boxDate)
        .in('status', ['skipped', 'farm_skipped']);
      const skippers = new Set((skips || []).map((s) => s.member_id));
      const memberBoxes = members.filter(
        (m) => m.status === 'active' && memberGetsBox(m.created_at, boxDate) && !skippers.has(m.id)
      ).length;
      if (memberBoxes + (singles.get(boxDate) || 0) >= plan.max_members) continue;
    }
    return { boxDate };
  }
  return { problem: dates.length ? 'There are no boxes left to buy right now.' : 'There are no pickups left this season.' };
}

// What one box costs bought on its own, tax included.
export async function singleBoxPrice(plan: CsaPlan) {
  const cost = boxCostCents(plan.price_cents);
  const tax = await calculateCartTax([
    { category: CSA_BOX_CATEGORY, pickupZip: await pickupZipFor(plan), subtotalCents: cost.priceCents, feeCents: cost.feeCents },
  ]);
  return { ...cost, taxCents: tax.taxCents, totalCents: cost.totalCents + tax.taxCents, calculationId: tax.calculationId };
}

// When a farm calls a week off: one-off boxes already bought for it are
// cancelled and refunded in full, and their buyers emailed. Members' boxes for
// that week haven't been charged yet, so there is nothing to refund for them.
export async function refundSingleBoxes(plan: CsaPlan, boxDate: string, reason: string) {
  const { data: orders } = await supabaseAdmin
    .from('orders')
    .select('*')
    .eq('listing_id', plan.listing_id)
    .in('status', ['pending_pickup', 'ready_for_pickup'])
    .eq('ready_by', boxReadyBy(boxDate).toISOString());
  const { data: listing } = await supabaseAdmin
    .from('produce_listings')
    .select('title, unit_type, available_quantity')
    .eq('id', plan.listing_id)
    .single();
  let refunded = 0;
  for (const order of orders || []) {
    try {
      await refundOrderQuantity({
        order,
        listing: listing || {},
        newQuantity: 0,
        reason: 'seller',
        note: `The farm has called off its Farm Box for ${formatBoxDate(boxDate, { long: true })}: ${reason}`,
      });
      refunded += 1;
    } catch (err) {
      await alertAdmin('refunding a one-off Farm Box for a week the farm called off', err, { order: order.id });
    }
  }
  return refunded;
}
