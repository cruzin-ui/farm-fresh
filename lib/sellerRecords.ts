import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { FAST_COMPLETION_MINUTES, hasOpenDispute } from '@/lib/orderActions';
import { listBlocks } from '@/lib/accountBlocks';
import { SELLER_CHANGE_REASONS } from '@/lib/sellerChangeReasons';

// SERVER-ONLY. Each seller's track record, to show up patterns no single order
// reveals: a seller whose buyers keep "not showing up", who cancels a lot,
// whose orders are completed minutes after purchase, or whose buyers report
// problems. `flags` lists the patterns worth a closer look. Used by the
// Sellers section of the admin page and the admin panel on a farm's page.

export type SellerRecord = {
  farmer_id: string;
  farm_name: string;
  payouts_set_up: boolean;
  // Set when an admin has suspended this seller.
  suspension_id: string | null;
  suspension_reason: string | null;
  // The farm's own web address (/<slug>), if it has chosen one.
  farm_address: string | null;
  // The reasons this seller has given for cancelling or reducing orders.
  change_reasons: { label: string; count: number }[];
  listings: number;
  listings_removed: number;
  orders: number;
  open: number;
  completed: number;
  seller_cancelled: number;
  // Orders the seller cut the quantity of without cancelling them.
  seller_reduced: number;
  not_ready_in_time: number;
  no_shows: number;
  no_show_reports_open: number;
  buyer_cancelled: number;
  buyer_problems: number;
  disputes: number;
  fast_completions: number;
  // Times an admin reset this seller's cancellation limits, newest first. The
  // cancellations above are all of them; the limits count only those since
  // the latest reset.
  limit_resets: { at: string; by: string; reason: string; cancellations: number; lifted_suspension: boolean }[];
  flags: string[];
};

// Flagged sellers first, then the busiest.
export async function loadSellerRecords(): Promise<SellerRecord[]> {
  const { data: orders, error } = await supabaseAdmin
    .from('orders')
    .select(
      'id, listing_id, status, created_at, completed_at, cancel_reason, no_show_reported_at, no_show_fee_amount, cancelled_by_buyer_at, buyer_problem_at, original_quantity, reserved_quantity, quantity, dispute_status, stripe_dispute_id, subtotal_amount'
    )
    .order('created_at', { ascending: false })
    .limit(5000);

  if (error) throw error;

  const { data: listings } = await supabaseAdmin.from('produce_listings').select('id, farmer_id, status');
  const farmerByListing = new Map((listings || []).map((l) => [l.id, l.farmer_id]));

  const { data: profiles } = await supabaseAdmin
    .from('seller_profiles')
    .select('*');


  const suspensions = new Map(
    (await listBlocks().catch(() => [])).filter((b) => b.scope === 'seller' && b.user_id).map((b) => [b.user_id as string, b])
  );

  const rows = new Map<string, SellerRecord>();
  for (const profile of profiles || []) {
    rows.set(profile.id, {
      farmer_id: profile.id,
      farm_name: profile.farm_name || 'Unnamed farm',
      payouts_set_up: Boolean(profile.stripe_onboarding_complete),
      suspension_id: suspensions.get(profile.id)?.id || null,
      suspension_reason: suspensions.get(profile.id)?.reason || null,
      farm_address: profile.slug || null,
      change_reasons: [],
      listings: 0,
      listings_removed: 0,
      orders: 0,
      open: 0,
      completed: 0,
      seller_cancelled: 0,
      seller_reduced: 0,
      not_ready_in_time: 0,
      no_shows: 0,
      no_show_reports_open: 0,
      buyer_cancelled: 0,
      buyer_problems: 0,
      disputes: 0,
      fast_completions: 0,
      limit_resets: [],
      flags: [],
    });
  }

  const { data: resets } = await supabaseAdmin
    .from('seller_limit_resets')
    .select('seller_id, admin_email, reason, cancellations_at_reset, lifted_suspension, created_at')
    .order('created_at', { ascending: false })
    .limit(2000);
  for (const reset of resets || []) {
    rows.get(reset.seller_id)?.limit_resets.push({
      at: reset.created_at,
      by: reset.admin_email,
      reason: reset.reason,
      cancellations: Number(reset.cancellations_at_reset) || 0,
      lifted_suspension: Boolean(reset.lifted_suspension),
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
      // A buyer cancelling the rest of an order the seller changed is the
      // seller's doing, like a late order, and isn't counted against the buyer.
      if (o.cancelled_by_buyer_at && !['seller_late', 'seller_changed'].includes(o.cancel_reason || '')) {
        row.buyer_cancelled += 1;
      } else if (o.cancel_reason === 'seller' || o.cancel_reason === 'seller_changed') row.seller_cancelled += 1;
      else if (o.cancel_reason === 'never_ready' || o.cancel_reason === 'seller_late') row.not_ready_in_time += 1;
      // Orders closed as no-shows before reasons were recorded are
      // recognised by their restocking fee.
      else if (o.cancel_reason === 'no_show' || (!o.cancel_reason && Number(o.no_show_fee_amount ?? 0) > 0)) {
        row.no_shows += 1;
      }
    }

    // Still standing, but for less than the buyer ordered. (One reduced and
    // then cancelled shows up under the cancellations instead.)
    if (
      o.status !== 'cancelled' &&
      o.original_quantity != null &&
      Number(o.reserved_quantity ?? o.quantity ?? 0) < Number(o.original_quantity)
    ) {
      row.seller_reduced += 1;
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
    if (row.limit_resets.length >= 2) row.flags.push(`cancellation limit reset ${row.limit_resets.length} times`);
  }

  // What each seller said when they cancelled or reduced an order.
  const { data: changes } = await supabaseAdmin
    .from('seller_order_changes')
    .select('farmer_id, reason')
    .order('created_at', { ascending: false })
    .limit(5000);
  const reasonCounts = new Map<string, Map<string, number>>();
  for (const change of changes || []) {
    const counts = reasonCounts.get(change.farmer_id) || new Map<string, number>();
    counts.set(change.reason, (counts.get(change.reason) || 0) + 1);
    reasonCounts.set(change.farmer_id, counts);
  }
  for (const row of rows.values()) {
    row.change_reasons = [...(reasonCounts.get(row.farmer_id) || new Map<string, number>()).entries()]
      .map(([code, count]) => ({ label: SELLER_CHANGE_REASONS[code] || code, count }))
      .sort((a, b) => b.count - a.count);
  }

  // Flagged sellers first, then the busiest.
  const sellers = [...rows.values()].sort(
    (a, b) => b.flags.length - a.flags.length || b.orders - a.orders || a.farm_name.localeCompare(b.farm_name)
  );

  return sellers;
}
