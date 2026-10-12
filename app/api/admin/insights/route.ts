import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getRequestAdmin } from '@/lib/apiAuth';
import { alertAdmin } from '@/lib/alerts';
import { SELLER_CHANGE_REASONS, LISTING_ACTIONS } from '@/lib/sellerChangeReasons';

export const dynamic = 'force-dynamic';

const DAY_MS = 24 * 60 * 60 * 1000;
const cents = (value: unknown) => Math.round(Number(value || 0) * 100);

// Admin-only: the handful of numbers that say whether the marketplace is
// working. Do buyers come back? How big are their orders? Are sellers getting
// enough of them? How many people who reach checkout go on to pay?
//
// "An order" here is a checkout: everything one buyer paid for at once. A
// checkout in which every item was cancelled doesn't count as one.
export async function POST(request: Request) {
  try {
    const admin = await getRequestAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: 'Not authorized.' }, { status: 403 });
    }

    const { data: rows, error } = await supabaseAdmin
      .from('orders')
      .select(
        'id, checkout_id, listing_id, buyer_id, buyer_email, status, created_at, subtotal_amount, original_subtotal_amount, total_price, tax_amount, farmer_payout_amount'
      )
      .order('created_at', { ascending: true })
      .limit(20000);
    if (error) throw error;

    const { data: listings } = await supabaseAdmin.from('produce_listings').select('id, farmer_id, available_quantity, status');
    const farmerByListing = new Map((listings || []).map((l) => [l.id, l.farmer_id as string]));

    // ---- group the item rows into checkouts ----
    type Checkout = { buyer: string; at: number; produceCents: number; farms: Set<string>; live: boolean };
    const checkouts = new Map<string, Checkout>();
    for (const row of rows || []) {
      const key = row.checkout_id || row.id;
      const buyer = row.buyer_id || String(row.buyer_email || '').trim().toLowerCase() || `unknown-${key}`;
      const checkout = checkouts.get(key) || { buyer, at: new Date(row.created_at).getTime(), produceCents: 0, farms: new Set<string>(), live: false };

      if (row.status !== 'cancelled') {
        checkout.live = true;
        checkout.produceCents += cents(row.subtotal_amount ?? row.original_subtotal_amount);
        const farm = farmerByListing.get(row.listing_id);
        if (farm) checkout.farms.add(farm);
      }
      checkouts.set(key, checkout);
    }
    const orders = [...checkouts.values()].filter((c) => c.live).sort((a, b) => a.at - b.at);

    const now = Date.now();
    const last30 = orders.filter((o) => o.at >= now - 30 * DAY_MS);
    const last28 = orders.filter((o) => o.at >= now - 28 * DAY_MS);

    // ---- do buyers come back? ----
    const byBuyer = new Map<string, Checkout[]>();
    for (const order of orders) byBuyer.set(order.buyer, [...(byBuyer.get(order.buyer) || []), order]);
    const buyers = [...byBuyer.values()];
    const gaps = buyers
      .filter((list) => list.length >= 2)
      .map((list) => (list[1].at - list[0].at) / DAY_MS)
      .sort((a, b) => a - b);

    // The same buyer returning to the same farm.
    const pairCounts = new Map<string, number>();
    for (const order of orders) {
      for (const farm of order.farms) {
        const pair = `${order.buyer}|${farm}`;
        pairCounts.set(pair, (pairCounts.get(pair) || 0) + 1);
      }
    }
    const pairs = [...pairCounts.values()];

    // ---- how big are orders? ----
    const sizes = (list: Checkout[]) => {
      const amounts = list.map((o) => o.produceCents).filter((c) => c > 0);
      const total = amounts.reduce((sum, c) => sum + c, 0);
      return {
        orders: amounts.length,
        averageCents: amounts.length ? Math.round(total / amounts.length) : 0,
        under15: amounts.filter((c) => c < 1500).length,
        from15to40: amounts.filter((c) => c >= 1500 && c <= 4000).length,
        over40: amounts.filter((c) => c > 4000).length,
      };
    };

    // ---- are sellers getting orders? ----
    const sellersWithListings = new Set(
      (listings || []).filter((l) => l.status !== 'removed' && Number(l.available_quantity ?? 0) >= 1).map((l) => l.farmer_id as string)
    );
    const sellersWithOrders30 = new Set(last30.flatMap((o) => [...o.farms]));
    const sellerOrders28 = last28.reduce((sum, o) => sum + o.farms.size, 0);
    const sellersWithOrders28 = new Set(last28.flatMap((o) => [...o.farms]));

    // ---- our share of what was sold (picked-up orders only) ----
    let produceCents = 0;
    let buyerFeeCents = 0;
    let sellerFeeCents = 0;
    for (const row of rows || []) {
      if (row.status !== 'completed' || row.farmer_payout_amount == null) continue;
      const subtotal = cents(row.subtotal_amount);
      if (subtotal <= 0) continue;
      produceCents += subtotal;
      buyerFeeCents += Math.max(0, cents(row.total_price) - subtotal - cents(row.tax_amount));
      sellerFeeCents += Math.max(0, subtotal - cents(row.farmer_payout_amount));
    }

    // ---- how many people are there? ----
    // Every account, a page at a time.
    const weekAgo = now - 7 * DAY_MS;
    let accounts = 0;
    let accountsThisWeek = 0;
    for (let page = 1; page <= 50; page++) {
      const { data: batch, error: usersError } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
      if (usersError) break;
      accounts += batch.users.length;
      accountsThisWeek += batch.users.filter((u) => new Date(u.created_at).getTime() >= weekAgo).length;
      if (batch.users.length < 1000) break;
    }

    // A seller is anyone who has named a farm, started payout setup or posted.
    const { data: profiles } = await supabaseAdmin
      .from('seller_profiles')
      .select('id, farm_name, stripe_account_id, stripe_onboarding_complete');
    const sellerIds = new Set<string>((listings || []).map((l) => l.farmer_id as string).filter(Boolean));
    for (const profile of profiles || []) {
      if (String(profile.farm_name || '').trim() || profile.stripe_account_id) sellerIds.add(profile.id);
    }
    const sellersReady = (profiles || []).filter((p) => p.stripe_onboarding_complete).length;

    // Buyers are counted from orders, whether they had an account or not.
    const accountBuyers = new Set((rows || []).filter((r) => r.buyer_id).map((r) => r.buyer_id as string));
    const guestBuyers = new Set(
      (rows || [])
        .filter((r) => !r.buyer_id && r.buyer_email)
        .map((r) => String(r.buyer_email).trim().toLowerCase())
    );

    // ---- why do sellers cancel or reduce orders? ----
    const { data: changes, error: changesError } = await supabaseAdmin
      .from('seller_order_changes')
      .select('kind, reason, listing_action, created_at')
      .order('created_at', { ascending: false })
      .limit(10000);
    const monthAgo = now - 30 * DAY_MS;
    const sellerChanges = changesError
      ? null
      : {
          reasons: Object.entries(SELLER_CHANGE_REASONS)
            .map(([code, label]) => {
              const matching = (changes || []).filter((c) => c.reason === code);
              return {
                label,
                cancelled: matching.filter((c) => c.kind === 'cancelled').length,
                reduced: matching.filter((c) => c.kind === 'reduced').length,
                last30Days: matching.filter((c) => new Date(c.created_at).getTime() >= monthAgo).length,
              };
            })
            .sort((a, b) => b.cancelled + b.reduced - (a.cancelled + a.reduced)),
          listing: Object.entries(LISTING_ACTIONS).map(([code, action]) => ({
            label: action.label,
            count: (changes || []).filter((c) => c.listing_action === code).length,
          })),
          total: (changes || []).length,
        };

    // ---- how far do shoppers get through checkout? ----
    const since = new Date(now - 30 * DAY_MS).toISOString().slice(0, 10);
    const { data: counts, error: countsError } = await supabaseAdmin
      .from('daily_counts')
      .select('name, count')
      .gte('day', since);
    const tally = (name: string) => (counts || []).filter((c) => c.name === name).reduce((sum, c) => sum + Number(c.count || 0), 0);

    return NextResponse.json({
      people: {
        accounts,
        accountsThisWeek,
        sellers: sellerIds.size,
        sellersReady,
        sellersOnSale: sellersWithListings.size,
        buyersWithAccounts: accountBuyers.size,
        guestBuyers: guestBuyers.size,
      },
      buyers: {
        total: buyers.length,
        orderedTwice: buyers.filter((list) => list.length >= 2).length,
        orderedThreeTimes: buyers.filter((list) => list.length >= 3).length,
        medianDaysToSecondOrder: gaps.length ? Math.round(gaps[Math.floor((gaps.length - 1) / 2)]) : null,
        farmPairs: pairs.length,
        farmPairsRepeated: pairs.filter((count) => count >= 2).length,
      },
      orderSize: { last30Days: sizes(last30), allTime: sizes(orders) },
      sellers: {
        withListings: sellersWithListings.size,
        withOrdersLast30Days: sellersWithOrders30.size,
        ordersPerSellerPerWeek: sellersWithOrders28.size ? sellerOrders28 / sellersWithOrders28.size / 4 : 0,
      },
      share: { produceCents, buyerFeeCents, sellerFeeCents },
      sellerChanges,
      checkout: countsError
        ? null
        : {
            opened: tally('checkout_opened'),
            started: tally('payment_started'),
            completed: tally('payment_completed'),
          },
    });
  } catch (err: any) {
    console.error('admin insights error:', err);
    await alertAdmin('admin insights error', err);
    return NextResponse.json({ error: err.message || 'Could not work out the insights.' }, { status: 500 });
  }
}
