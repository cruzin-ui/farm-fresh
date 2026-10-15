import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getRequestUser } from '@/lib/apiAuth';
import { isBuyerBlocked } from '@/lib/accountBlocks';
import { verifyCaptcha, allowCheckoutAttempt, requestIp } from '@/lib/checkoutGuard';
import {
  getOrCreateStripeCustomer,
  startSavingCard,
  finishSavingCard,
  farmCantSell,
  farmFor,
  emailFarm,
  maskEmail,
  siteUrlFrom,
  type CsaPlan,
} from '@/lib/csa';
import { csaAgreementText, boxCostCents } from '@/lib/csaTerms';
import { CSA_TERMS_VERSION, firstBoxForNewMember, formatBoxDate, describeFrequency, CHARGE_DAYS_BEFORE } from '@/lib/csaSchedule';
import { sendEmail, escapeHtml } from '@/lib/email';
import { alertAdmin } from '@/lib/alerts';

export const dynamic = 'force-dynamic';

// Joining a CSA Farm Box. Members must be signed in.
//   { action: 'start', planId, captchaToken }
//       checks they can join and starts saving their card with Stripe;
//       returns the secret the browser needs to finish that.
//   { action: 'finish', planId, setupIntentId, agreed: true }
//       once Stripe has saved the card: records the membership, with the
//       agreement they ticked, word for word.
export async function POST(request: Request) {
  try {
    const user = await getRequestUser(request);
    if (!user) return NextResponse.json({ error: 'Please sign in to join a Farm Box.' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const planId = typeof body.planId === 'string' ? body.planId : '';
    const { data: planRow } = await supabaseAdmin.from('csa_plans').select('*').eq('id', planId).maybeSingle();
    const plan = planRow as CsaPlan | null;
    if (!plan) return NextResponse.json({ error: 'This Farm Box could not be found.' }, { status: 404 });

    // Everything that would stop someone joining.
    const problem = await joinProblem(plan, user);
    if (problem) return NextResponse.json({ error: problem }, { status: 409 });
    const firstBox = firstBoxForNewMember(plan)!;

    if (body.action === 'start') {
      const ip = requestIp(request);
      const captchaToken = typeof body.captchaToken === 'string' ? body.captchaToken : '';
      if (!(await verifyCaptcha(captchaToken, ip, new URL(request.url).hostname))) {
        return NextResponse.json(
          { error: "We couldn't confirm you're not a robot. Please wait for the check above the button to finish, then try again." },
          { status: 400 }
        );
      }
      if (!(await allowCheckoutAttempt(ip, user.email || ''))) {
        return NextResponse.json(
          { error: 'Too many attempts from this connection. Please wait 15 minutes and try again.' },
          { status: 429 }
        );
      }

      const customerId = await getOrCreateStripeCustomer(user);
      const clientSecret = await startSavingCard(customerId, {
        purpose: 'csa_join',
        plan_id: plan.id,
        buyer_id: user.id,
        // The price they are agreeing to, so a change made while they are
        // typing their card can't change what they signed up for.
        price_cents: String(plan.price_cents),
      });
      return NextResponse.json({ clientSecret });
    }

    if (body.action === 'finish') {
      if (body.agreed !== true) {
        return NextResponse.json({ error: 'Please tick the box to agree to the payment terms.' }, { status: 400 });
      }
      const customerId = await getOrCreateStripeCustomer(user);
      const saved = await finishSavingCard(body.setupIntentId, customerId);
      if (!saved || saved.setupIntent.metadata?.plan_id !== plan.id || saved.setupIntent.metadata?.buyer_id !== user.id) {
        return NextResponse.json({ error: "Your card wasn't saved. Please try again." }, { status: 400 });
      }

      const priceCents = Number(saved.setupIntent.metadata?.price_cents) || plan.price_cents;
      const farm = await farmFor(plan.farmer_id);
      const farmName = farm?.farm_name || 'Local Farm';
      const agreedText = csaAgreementText({ farmName, planName: plan.name, priceCents, plan, firstBoxDate: firstBox });

      const { data: member, error } = await supabaseAdmin
        .from('csa_members')
        .insert({
          plan_id: plan.id,
          buyer_id: user.id,
          buyer_email: user.email || '',
          status: 'active',
          price_cents: priceCents,
          stripe_customer_id: customerId,
          stripe_payment_method_id: saved.paymentMethodId,
          card_label: saved.cardLabel,
          terms_version: CSA_TERMS_VERSION,
          agreed_text: agreedText,
          agreed_at: new Date().toISOString(),
          agreed_ip: requestIp(request),
        })
        .select('id')
        .single();
      if (error) {
        // Pressed twice: they are already a member.
        if (error.code === '23505') return NextResponse.json({ success: true });
        throw error;
      }

      const siteUrl = siteUrlFrom(request);
      const cost = boxCostCents(priceCents);
      if (user.email) {
        await sendEmail({
          to: user.email,
          subject: `Welcome to ${plan.name} from ${farmName}`,
          html: `
            <div style="font-family: sans-serif; max-width: 520px;">
              <h2 style="color: #059669;">You've joined ${escapeHtml(plan.name)}!</h2>
              <p><strong>${escapeHtml(describeFrequency(plan))}</strong>${plan.pickup_window ? `, ${escapeHtml(plan.pickup_window)}` : ''}, from <strong>${formatBoxDate(firstBox, { long: true })}</strong>.</p>
              <p>Each box is charged to ${escapeHtml(saved.cardLabel)} ${CHARGE_DAYS_BEFORE} days before pickup: <strong>$${(cost.totalCents / 100).toFixed(2)}</strong> plus any sales tax. We'll email you the day before every charge, and send your pickup code once it's paid.</p>
              <p>You can skip a week, pause or cancel at any time before a box is charged, under <a href="${siteUrl}/account/csa">My Farm Boxes</a>.</p>
              <p style="font-size: 12px; color: #6b7280;">What you agreed to: ${escapeHtml(agreedText)}</p>
            </div>`,
        });
      }
      await emailFarm(
        plan.farmer_id,
        `New member: ${plan.name}`,
        `<h2 style="color: #059669;">Someone joined ${escapeHtml(plan.name)}</h2>
         <p>${escapeHtml(maskEmail(user.email))} joined. Their first box is on <strong>${formatBoxDate(firstBox, { long: true })}</strong>. Each box shows up in your orders once it's paid, ${CHARGE_DAYS_BEFORE} days before pickup.</p>`
      );

      return NextResponse.json({ success: true, memberId: member.id });
    }

    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  } catch (err: any) {
    console.error('csa join error:', err);
    await alertAdmin('CSA join', err);
    return NextResponse.json({ error: 'Something went wrong joining this Farm Box. Please try again.' }, { status: 500 });
  }
}

async function joinProblem(plan: CsaPlan, user: { id: string; email?: string | null }) {
  if (plan.status !== 'open') return 'This Farm Box isn’t taking new members right now.';
  if (plan.farmer_id === user.id) return "This is your own Farm Box, so you can't join it.";
  if (!firstBoxForNewMember(plan)) return 'There are no pickups left this season.';
  if (await isBuyerBlocked({ userId: user.id, email: user.email })) {
    return "We can't take orders from this account at the moment. Please contact us if you think this is a mistake.";
  }
  if (await farmCantSell(plan.farmer_id)) return 'This farm isn’t taking new members just yet.';

  const { data: existing } = await supabaseAdmin
    .from('csa_members')
    .select('id')
    .eq('plan_id', plan.id)
    .eq('buyer_id', user.id)
    .neq('status', 'cancelled')
    .maybeSingle();
  if (existing) return "You're already a member of this Farm Box. Manage it under My Farm Boxes.";

  if (plan.max_members != null) {
    const { count } = await supabaseAdmin
      .from('csa_members')
      .select('id', { count: 'exact', head: true })
      .eq('plan_id', plan.id)
      .neq('status', 'cancelled');
    if ((count || 0) >= plan.max_members) return 'This Farm Box is full.';
  }
  return null;
}
