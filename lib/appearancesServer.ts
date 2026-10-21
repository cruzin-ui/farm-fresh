import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { sendEmail, escapeHtml } from '@/lib/email';
import { alertAdmin } from '@/lib/alerts';
import { geocodeZip } from '@/lib/geo';
import { isSellerSuspended } from '@/lib/accountBlocks';
import { refundOrderQuantity } from '@/lib/orderActions';
import { checkSellerCancellations } from '@/lib/fraudWatch';
import { addDays, formatBoxDate, isDay, todayInArizona } from '@/lib/csaSchedule';
import {
  APPEARANCE_KINDS,
  MAX_WEEKLY_DAYS,
  appearanceDates,
  describeSchedule,
  formatTimes,
  isTime,
  mapsLink,
  marketKey,
  orderableDates,
  pickupLabel,
  placeLine,
  type Appearance,
} from '@/lib/appearances';

// SERVER-ONLY. "Where to find us" posts: saving them, what buyers see, the
// emails to followers who asked for them, and ordering ahead for pickup at
// one. The rules and wording are in lib/appearances.

export type AppearanceValues = Omit<Appearance, 'id' | 'farmer_id' | 'status'>;

// Reads a post sent by the browser.
export function readAppearanceInput(raw: unknown, today: string): { values: AppearanceValues } | { error: string } {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const text = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
  const kind = text(input.kind, 20);
  const name = text(input.name, 100);
  const address = text(input.address, 200);
  const city = text(input.city, 100);
  const zip = text(input.zip, 10).replace(/\D/g, '').slice(0, 5);
  const startsOn = text(input.startsOn, 10);
  const repeatsWeekly = input.repeatsWeekly === true;
  const endsOn = repeatsWeekly ? text(input.endsOn, 10) : startsOn;
  const startTime = text(input.startTime, 5);
  const endTime = text(input.endTime, 5);
  const note = text(input.note, 300);

  if (!(kind in APPEARANCE_KINDS)) return { error: 'Choose what kind of event it is.' };
  if (name.length < 3) return { error: 'Give the market or event its name, e.g. "Downtown Phoenix Farmers Market".' };
  if (address.length < 5) return { error: 'Enter where it is: the venue’s street address.' };
  if (!city) return { error: 'Enter the city.' };
  if (zip.length !== 5) return { error: 'Enter the 5-digit zip code.' };
  if (!isDay(startsOn)) return { error: 'Choose the date.' };
  if (startsOn < today) return { error: 'The date can’t be in the past.' };
  if (startsOn > addDays(today, MAX_WEEKLY_DAYS)) return { error: 'Choose a date within the next year.' };
  if (repeatsWeekly) {
    if (!isDay(endsOn) || endsOn < startsOn) return { error: 'Choose the last week you’ll be there.' };
    if (endsOn > addDays(startsOn, MAX_WEEKLY_DAYS)) return { error: 'A weekly post can run for up to a year. Post it again after that.' };
  }
  if (!isTime(startTime) || !isTime(endTime)) return { error: 'Choose the start and end times.' };
  if (endTime <= startTime) return { error: 'The end time has to be after the start time.' };

  return {
    values: {
      kind,
      name,
      address,
      city,
      zip,
      starts_on: startsOn,
      repeats_weekly: repeatsWeekly,
      ends_on: endsOn,
      start_time: startTime,
      end_time: endTime,
      note,
      takes_orders: input.takesOrders !== false,
    },
  };
}

export async function placeCoordinates(zip: string) {
  const coords = await geocodeZip(zip);
  return { latitude: coords?.latitude ?? null, longitude: coords?.longitude ?? null };
}

// A farm's posts still to come, each with its skipped dates.
export async function farmAppearances(farmerId: string, today: string = todayInArizona()) {
  const { data } = await supabaseAdmin
    .from('farm_appearances')
    .select('*')
    .eq('farmer_id', farmerId)
    .eq('status', 'active')
    .gte('ends_on', today)
    .order('starts_on', { ascending: true });
  const appearances = (data || []) as Appearance[];
  const skips = await skipsFor(appearances.map((a) => a.id));
  return appearances.map((a) => ({ ...a, skipped: skips.get(a.id) || [] }));
}

async function skipsFor(ids: string[]) {
  const map = new Map<string, string[]>();
  if (ids.length === 0) return map;
  const { data } = await supabaseAdmin.from('farm_appearance_skips').select('appearance_id, skip_date').in('appearance_id', ids);
  for (const row of data || []) map.set(row.appearance_id, [...(map.get(row.appearance_id) || []), row.skip_date]);
  return map;
}

// Whether a farm's posts (and its market pickups) are shown at all: as with
// listings, only once it can be paid and while it isn't suspended.
async function farmIsVisible(farmerId: string) {
  const { data } = await supabaseAdmin.from('seller_profiles').select('stripe_onboarding_complete').eq('id', farmerId).maybeSingle();
  return Boolean(data?.stripe_onboarding_complete) && !(await isSellerSuspended(farmerId));
}

// The next dates a farm will be out, for its farm page and listings.
export async function publicAppearances(farmerId: string, limit = 8) {
  if (!(await farmIsVisible(farmerId))) return [];
  const today = todayInArizona();
  const events = [];
  for (const a of await farmAppearances(farmerId, today)) {
    for (const date of appearanceDates(a, today, 4, a.skipped)) {
      events.push({
        id: a.id,
        date,
        kind: a.kind,
        kindLabel: APPEARANCE_KINDS[a.kind as keyof typeof APPEARANCE_KINDS] || 'Event',
        name: a.name,
        address: a.address,
        city: a.city,
        dateLabel: formatBoxDate(date, { long: true }),
        times: formatTimes(a),
        schedule: describeSchedule(a),
        note: a.note,
        takesOrders: a.takes_orders,
        mapUrl: mapsLink(a),
      });
    }
  }
  return events.sort((x, y) => x.date.localeCompare(y.date) || x.times.localeCompare(y.times)).slice(0, limit);
}

export type MarketOption = { key: string; label: string; appearanceId: string; date: string; zip: string; address: string };

// Where each farm's buyers can order ahead for pickup, by farm.
export async function marketOptionsFor(farmerIds: string[]) {
  const options = new Map<string, MarketOption[]>();
  if (farmerIds.length === 0) return options;
  const today = todayInArizona();
  const { data } = await supabaseAdmin
    .from('farm_appearances')
    .select('*')
    .in('farmer_id', farmerIds)
    .eq('status', 'active')
    .eq('takes_orders', true)
    .gte('ends_on', today);
  const appearances = (data || []) as Appearance[];
  const skips = await skipsFor(appearances.map((a) => a.id));
  for (const a of appearances) {
    for (const date of orderableDates(a, skips.get(a.id) || [])) {
      const list = options.get(a.farmer_id) || [];
      list.push({ key: marketKey(a.id, date), label: pickupLabel(a, date), appearanceId: a.id, date, zip: a.zip, address: placeLine(a) });
      options.set(a.farmer_id, list);
    }
  }
  for (const [farmerId, list] of options) options.set(farmerId, list.sort((x, y) => x.date.localeCompare(y.date)).slice(0, 12));
  return options;
}

// ---------- emails to followers who asked for them ----------

async function followerEmails(farmerId: string) {
  const { data } = await supabaseAdmin.from('farm_follows').select('user_id').eq('farmer_id', farmerId).eq('market_emails', true);
  const emails: string[] = [];
  for (const row of data || []) {
    const { data: user } = await supabaseAdmin.auth.admin.getUserById(row.user_id);
    if (user?.user?.email) emails.push(user.user.email);
  }
  return emails;
}

function eventHtml(a: Appearance, farmName: string, dates: string[], siteUrl: string, farmPath: string) {
  return `
    <p><strong>${escapeHtml(a.name)}</strong><br />${escapeHtml(a.address)}</p>
    <p>${escapeHtml(a.repeats_weekly ? describeSchedule(a) : `${formatBoxDate(dates[0] || a.starts_on, { long: true })}, ${formatTimes(a)}`)}</p>
    ${a.note ? `<p style="padding: 12px; background: #ecfdf5; border-radius: 8px;">${escapeHtml(a.note)}</p>` : ''}
    ${a.takes_orders ? `<p>You can order ahead on the site and pick up your order there.</p>` : ''}
    <p><a href="${siteUrl}${farmPath}" style="display: inline-block; background: #047857; color: #ffffff; text-decoration: none; font-weight: bold; padding: 10px 18px; border-radius: 8px;">See ${escapeHtml(farmName)}</a></p>
    <p style="font-size: 12px; color: #6b7280;">You get these because you asked to hear where ${escapeHtml(farmName)} will be. Turn them off on the farm’s page or under <a href="${siteUrl}/following">Favorite Farms</a>.</p>`;
}

async function farmInfo(farmerId: string) {
  const { data } = await supabaseAdmin.from('seller_profiles').select('farm_name, slug').eq('id', farmerId).maybeSingle();
  return { name: (data?.farm_name as string) || 'A farm you follow', path: data?.slug ? `/${data.slug}` : `/sellers/${farmerId}` };
}

// A new post: followers who asked are emailed, at most once a day per farm.
export async function announceAppearance(a: Appearance, siteUrl: string) {
  try {
    if (!(await farmIsVisible(a.farmer_id))) return false;
    const today = todayInArizona();
    const { error } = await supabaseAdmin
      .from('farm_appearance_emails')
      .insert({ farmer_id: a.farmer_id, appearance_id: a.id, kind: 'new', email_date: today });
    if (error) return false;
    const farm = await farmInfo(a.farmer_id);
    const dates = appearanceDates(a, today, 1);
    for (const to of await followerEmails(a.farmer_id)) {
      await sendEmail({
        to,
        subject: `${farm.name} will be at ${a.name}`,
        html: `<div style="font-family: sans-serif; max-width: 520px;"><h2 style="color: #059669;">Find ${escapeHtml(farm.name)} at ${escapeHtml(a.name)}</h2>${eventHtml(a, farm.name, dates, siteUrl, farm.path)}</div>`,
      });
    }
    return true;
  } catch (err) {
    await alertAdmin('announcing a market appearance', err, { appearance: a.id });
    return false;
  }
}

// The day before each date: followers who asked get a reminder. Each goes once.
export async function sendAppearanceReminders(today: string, siteUrl: string) {
  const tomorrow = addDays(today, 1);
  const { data } = await supabaseAdmin
    .from('farm_appearances')
    .select('*')
    .eq('status', 'active')
    .lte('starts_on', tomorrow)
    .gte('ends_on', tomorrow);
  const appearances = (data || []) as Appearance[];
  const skips = await skipsFor(appearances.map((a) => a.id));
  let sent = 0;
  for (const a of appearances) {
    if (appearanceDates(a, tomorrow, 1, skips.get(a.id) || [])[0] !== tomorrow) continue;
    if (!(await farmIsVisible(a.farmer_id))) continue;
    const { error } = await supabaseAdmin
      .from('farm_appearance_emails')
      .insert({ farmer_id: a.farmer_id, appearance_id: a.id, kind: 'reminder', email_date: tomorrow });
    if (error) continue;
    const farm = await farmInfo(a.farmer_id);
    for (const to of await followerEmails(a.farmer_id)) {
      await sendEmail({
        to,
        subject: `Tomorrow: ${farm.name} at ${a.name}`,
        html: `<div style="font-family: sans-serif; max-width: 520px;"><h2 style="color: #059669;">${escapeHtml(farm.name)} is at ${escapeHtml(a.name)} tomorrow</h2>${eventHtml(a, farm.name, [tomorrow], siteUrl, farm.path)}</div>`,
      });
      sent += 1;
    }
  }
  return sent;
}

// ---------- orders for pickup there ----------

// Open orders to be picked up at an appearance, on one date or any.
export async function openMarketOrders(appearanceId: string, date?: string) {
  let query = supabaseAdmin
    .from('orders')
    .select('*')
    .eq('market_appearance_id', appearanceId)
    .in('status', ['pending_pickup', 'ready_for_pickup']);
  if (date) query = query.eq('market_date', date);
  const { data } = await query;
  return data || [];
}

// The farm won't be there after all: every open order for pickup there (on
// that date, or any) is cancelled and refunded in full, the buyers told why,
// and it counts as a cancellation by the farm.
export async function cancelMarketOrders(a: Appearance, date: string | null, reason: string, siteUrl: string) {
  const orders = await openMarketOrders(a.id, date || undefined);
  if (orders.length === 0) return { cancelled: 0, refunded: 0 };
  const { data: listings } = await supabaseAdmin
    .from('produce_listings')
    .select('id, title, unit_type, available_quantity')
    .in('id', [...new Set(orders.map((o) => o.listing_id))]);
  const listingById = new Map((listings || []).map((l) => [l.id, l]));
  let cancelled = 0;
  let refunded = 0;
  for (const order of orders) {
    try {
      const result = await refundOrderQuantity({
        order,
        listing: listingById.get(order.listing_id) || {},
        newQuantity: 0,
        restock: true,
        reason: 'seller',
        note: `The farm won't be at ${a.name} on ${formatBoxDate(order.market_date, { long: true })} after all${reason ? `: ${reason}` : '.'}`,
      });
      cancelled += 1;
      refunded += result.refundAmount;
    } catch (err) {
      await alertAdmin('cancelling a market pickup order', err, { order: order.id });
    }
  }
  await checkSellerCancellations(a.farmer_id, siteUrl);
  return { cancelled, refunded: Number(refunded.toFixed(2)) };
}

