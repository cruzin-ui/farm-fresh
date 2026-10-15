import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { chargeBox, sendBoxReminder, siteUrlFrom, type CsaMember, type CsaPlan } from '@/lib/csa';
import {
  boxDates,
  chargeDateFor,
  reminderDateFor,
  memberGetsBox,
  todayInArizona,
  addDays,
  REMINDER_DAYS_BEFORE,
} from '@/lib/csaSchedule';
import { alertAdmin } from '@/lib/alerts';

export const dynamic = 'force-dynamic';
// Charging every member can take a while.
export const maxDuration = 300;

// Run every morning by Vercel Cron (see vercel.json). For each CSA farm share
// and each member getting a box:
//
// - REMINDER_DAYS_BEFORE a pickup: emails the member what is coming, what it
//   will cost, and how to skip.
// - On the charge day (CHARGE_DAYS_BEFORE) and the day after: charges the
//   box to their saved card, which records it as an order. A declined card is
//   tried once more the next day; the member is emailed each time.
//
// Boxes the member skipped, weeks the farm called off, paused and cancelled
// memberships, and ended plans are left alone. Running it twice in a day does
// no harm: each box is reminded and charged once.
//
// Vercel sends "Authorization: Bearer <CRON_SECRET>" with scheduled calls.
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 401 });
  }

  const today = todayInArizona();
  const siteUrl = siteUrlFrom(request);
  const tally = { reminded: 0, paid: 0, failed: 0, farmSkipped: 0 };

  try {
    const { data: planRows } = await supabaseAdmin
      .from('csa_plans')
      .select('*')
      .neq('status', 'ended')
      .gte('season_end', today);

    for (const plan of (planRows || []) as CsaPlan[]) {
      // Pickups from tomorrow to the reminder date: the only ones with
      // something to do today.
      const dates = boxDates(plan, addDays(today, 1), 10).filter((d) => d <= addDays(today, REMINDER_DAYS_BEFORE));
      if (dates.length === 0) continue;

      const { data: memberRows } = await supabaseAdmin
        .from('csa_members')
        .select('*')
        .eq('plan_id', plan.id)
        .eq('status', 'active');
      const members = (memberRows || []) as CsaMember[];
      if (members.length === 0) continue;

      for (const boxDate of dates) {
        const { data: week } = await supabaseAdmin
          .from('csa_box_weeks')
          .select('note, skipped')
          .eq('plan_id', plan.id)
          .eq('box_date', boxDate)
          .maybeSingle();
        if (week?.skipped) continue;

        const chargeDay = chargeDateFor(boxDate);
        const isReminderDay = today === reminderDateFor(boxDate);
        const isChargeWindow = today >= chargeDay && today < boxDate;

        for (const member of members) {
          if (!memberGetsBox(member.created_at, boxDate)) continue;
          try {
            if (isReminderDay) {
              if (await sendBoxReminder({ plan, member, boxDate, note: week?.note || '', siteUrl })) tally.reminded += 1;
            } else if (isChargeWindow) {
              const outcome = await chargeBox({ plan, member, boxDate, siteUrl, today });
              if (outcome === 'paid') tally.paid += 1;
              else if (outcome === 'failed') tally.failed += 1;
              else if (outcome === 'farm_skipped') tally.farmSkipped += 1;
            }
          } catch (err) {
            // One member's problem mustn't stop everyone else's box.
            console.error('CSA job failed for a member:', member.id, boxDate, err);
            await alertAdmin('CSA daily job', err, { plan: plan.name, member: member.id, date: boxDate });
          }
        }
      }
    }

    // Seasons that have finished are closed off.
    await supabaseAdmin
      .from('csa_plans')
      .update({ status: 'ended', updated_at: new Date().toISOString() })
      .neq('status', 'ended')
      .lt('season_end', today);

    return NextResponse.json({ ok: true, today, ...tally });
  } catch (err: any) {
    console.error('CSA job error:', err);
    await alertAdmin('CSA daily job', err);
    return NextResponse.json({ error: 'CSA job failed.' }, { status: 500 });
  }
}
