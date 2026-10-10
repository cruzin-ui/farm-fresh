import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getRequestAdmin } from '@/lib/apiAuth';
import { FAST_COMPLETION_MINUTES, hasOpenDispute } from '@/lib/orderActions';
import { alertAdmin } from '@/lib/alerts';
import { listBlocks } from '@/lib/accountBlocks';

export const dynamic = 'force-dynamic';

// Admin-only: each seller's track record, to show up patterns no single order
// reveals — a seller whose buyers keep "not showing up", who cancels a lot,
// whose orders are completed minutes after purchase, or whose buyers report
// problems. `flags` lists the patterns worth a closer look.
export async function POST(request: Request) {
  try {
    const admin = await getRequestAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: 'Not authorized.' }, { status: 403 });
    }

    const { data: orders, error } = await supabaseAdmin
      .from('orders')
      .select(
        'id, listing_id, status, created_at, completed_at, cancel_reason, no_show_reported_at, no_show_fee_amount, cancelled_by_buyer_at, buyer_problem_at, dispute_status, stripe_dispute_id, subtotal_amount'
      )
      .order('created_at', { ascending: false })
      .limit(5000);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const { data: listings } = await supabaseAdmin.from('produce_listings').select('id, farmer_id, status');
    const farmerByListing = new Map((listings || []).map((l) => [l.id, l.farmer_id]));

    const { data: profiles } = await supabaseAdmin
      .from('seller_profiles')
      .select('id, farm_name, stripe_onboarding_complete');

    type Row = {
      farmer_id: string;
      farm_name: string;
      payouts_set_up: boolean;
      // Set when an admin has suspended this seller.
      suspension_id: string | null;
      suspension_reason: string | null;
      listings: number;
      listings_removed: number;
      orders: number;
      open: number;
      completed: number;
      seller_cancelled: number;
      not_ready_in_time: number;
      no_shows: number;
      no_show_reports_open: number;
      buyer_cancelled: number;
      buyer_problems: number;
      disputes: number;
      fast_completions: number;
      flags: string[];
    };

    const suspensions = new Map(
      (await listBlocks().catch(() => [])).filter((b) => b.scope === 'seller' && b.user_id).map((b) => [b.user_id as string, b])
    );

    const rows = new Map<string, Row>();
    for (const profile of profiles || []) {
      rows.set(profile.id, {
        farmer_id: profile.id,
        farm_name: profile.farm_name || 'Unnamed farm',
        payouts_set_up: Boolean(profile.stripe_onboarding_complete),
        suspension_id: suspensions.get(profile.id)?.id || null,
        suspension_reason: suspensions.get(profile.id)?.reason || null,
        listings: 0,
        listings_removed: 0,
        orders: 0,
        open: 0,
        completed: 0,
        seller_cancelled: 0,
        not_ready_in_time: 0,
        no_shows: 0,
        no_show_reports_open: 0,
        buyer_cancelled: 0,
        buyer_problems: 0,
        disputes: 0,
        fast_completions: 0,
        flags: [],
      });
    }

    for (const listing of listings || []) {
      const row = rows.get(listing.farmer_id);
      if (!row) continue;
      row.listings += 1;
      if (listing.status === 'removed') row.listings_removed += 1;
    }

    for (const o of orders || []) {
      const row = rows.get(farmerByListing.get(o.listing_id) || '');
      if (!row) continue;

      const open = o.status === 'pending_pickup' || o.status === 'ready_for_pickup';
      row.orders += 1;
      if (open) row.open += 1;
      if (open && o.no_show_reported_at) row.no_show_reports_open += 1;

      if (o.status === 'completed') {
        row.completed += 1;
        if (
          o.completed_at &&
          new Date(o.completed_at).getTime() - new Date(o.created_at).getTime() < FAST_COMPLETION_MINUTES * 60 * 1000
        ) {
          row.fast_completions += 1;
        }
      }

      if (o.status === 'cancelled') {
        if (o.cancelled_by_buyer_at && o.cancel_reason !== 'seller_late') row.buyer_cancelled += 1;
        else if (o.cancel_reason === 'seller') row.seller_cancelled += 1;
        else if (o.cancel_reason === 'never_ready' || o.cancel_reason === 'seller_late') row.not_ready_in_time += 1;
        // Orders closed as no-shows before reasons were recorded are
        // recognised by their restocking fee.
        else if (o.cancel_reason === 'no_show' || (!o.cancel_reason && Number(o.no_show_fee_amount ?? 0) > 0)) {
          row.no_shows += 1;
        }
      }

      if (o.buyer_problem_at) row.buyer_problems += 1;
      if (o.stripe_dispute_id || hasOpenDispute(o)) row.disputes += 1;
    }

    for (const row of rows.values()) {
      const handedOverOrNot = row.completed + row.no_shows;
      if (row.no_shows >= 3 && row.no_shows / handedOverOrNot >= 0.3) {
        row.flags.push(`${row.no_shows} no-shows out of ${handedOverOrNot} pickups`);
      }
      if (row.seller_cancelled + row.not_ready_in_time >= 3 && (row.seller_cancelled + row.not_ready_in_time) / row.orders >= 0.3) {
        row.flags.push(`cancelled or failed to ready ${row.seller_cancelled + row.not_ready_in_time} of ${row.orders} orders`);
      }
      if (row.fast_completions >= 2) {
        row.flags.push(`${row.fast_completions} orders completed within ${FAST_COMPLETION_MINUTES} minutes of purchase`);
      }
      if (row.buyer_problems >= 2) row.flags.push(`${row.buyer_problems} problems reported by buyers`);
      if (row.disputes >= 1) row.flags.push(`${row.disputes} payment dispute${row.disputes === 1 ? '' : 's'}`);
      if (row.listings_removed >= 1) {
        row.flags.push(`${row.listings_removed} listing${row.listings_removed === 1 ? '' : 's'} removed by an admin`);
      }
    }

    // Flagged sellers first, then the busiest.
    const sellers = [...rows.values()].sort(
      (a, b) => b.flags.length - a.flags.length || b.orders - a.orders || a.farm_name.localeCompare(b.farm_name)
    );

    return NextResponse.json({ sellers });
  } catch (err: any) {
    console.error('admin sellers error:', err);
    await alertAdmin('admin sellers error', err);
    return NextResponse.json({ error: err.message || 'Failed to load sellers.' }, { status: 500 });
  }
}
