import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { stripeAdmin } from '@/lib/stripeAdmin';
import { geocodeZip, milesBetween } from '@/lib/geo';
import { calculateFarmerPayoutCents, SELLER_FEE_RATE } from '@/lib/pricing';
import { alertAdmin } from '@/lib/alerts';
import { escapeHtml, sendEmail } from '@/lib/email';
import { completeOrderAndReleasePayout, hasOpenDispute } from '@/lib/orderActions';
import {
  DEFAULT_DELIVERY,
  DELIVERY_RELEASE_HOURS,
  deliveryEnd,
  deliveryLabel,
  type DeliveryAddress,
  type DeliverySettings,
} from '@/lib/delivery';

// SERVER-ONLY. Delivery settings, the delivery fee's journey (held, then paid
// to the farm or refunded), and releasing orders left at the door. See
// lib/delivery.ts for the rules.

export const DELIVERY_PHOTO_BUCKET = 'delivery-photos';

// Roads rarely run straight; this turns the straight line between two zip
// codes into a fair estimate of the drive (as lib/geo does for pickups).
const ROAD_FACTOR = 1.3;

const toSettings = (row: Record<string, unknown> | null): DeliverySettings => ({
  enabled: Boolean(row?.enabled),
  radius_miles: Number(row?.radius_miles ?? DEFAULT_DELIVERY.radius_miles),
  fee_cents: Number(row?.fee_cents ?? DEFAULT_DELIVERY.fee_cents),
  per_mile_cents: Number(row?.per_mile_cents ?? 0),
  min_order_cents: Number(row?.min_order_cents ?? 0),
  weekdays: Array.isArray(row?.weekdays) ? (row.weekdays as unknown[]).map(Number) : [],
  start_time: String(row?.start_time || DEFAULT_DELIVERY.start_time),
  end_time: String(row?.end_time || DEFAULT_DELIVERY.end_time),
  delivers_eggs: Boolean(row?.delivers_eggs),
  note: String(row?.note || ''),
});

// One farm's settings (the defaults, switched off, if it has none).
export async function farmDelivery(farmerId: string): Promise<DeliverySettings & { agreed: boolean }> {
  const { data } = await supabaseAdmin.from('farm_delivery').select('*').eq('farmer_id', farmerId).maybeSingle();
  return { ...toSettings(data || { ...DEFAULT_DELIVERY }), agreed: Boolean(data?.agreed_at) };
}

// The settings of each farm that delivers, with the zip code it delivers
// from, by farm.
export async function deliveringFarms(farmerIds: string[]) {
  const farms = new Map<string, DeliverySettings & { farmZip: string }>();
  if (farmerIds.length === 0) return farms;
  const { data } = await supabaseAdmin.from('farm_delivery').select('*').in('farmer_id', farmerIds).eq('enabled', true);
  const { data: profiles } = await supabaseAdmin.from('seller_profiles').select('id, zip_code').in('id', farmerIds);
  const zipById = new Map((profiles || []).map((p) => [p.id as string, String(p.zip_code || '').slice(0, 5)]));
  for (const row of data || []) {
    const farmZip = zipById.get(row.farmer_id) || '';
    if (/^\d{5}$/.test(farmZip)) farms.set(row.farmer_id, { ...toSettings(row), farmZip });
  }
  return farms;
}

// The estimated drive between two zip codes, in whole miles; null if either
// zip code can't be found.
export async function drivingMiles(fromZip: string, toZip: string) {
  if (fromZip === toZip) return 0;
  const [from, to] = await Promise.all([geocodeZip(fromZip), geocodeZip(toZip)]);
  if (!from || !to) return null;
  return Math.round(milesBetween(from, to) * ROAD_FACTOR);
}

// Saves the deliveries of a checkout that is about to be paid for, one per
// farm, as 'unpaid'. They become 'open' when the payment succeeds (see
// attachDeliveries); ones never paid for are deleted after a day.
export async function saveUnpaidDeliveries(params: {
  checkoutId: string;
  buyerId: string | null;
  buyerEmail: string;
  address: DeliveryAddress;
  deliveries: { farmerId: string; date: string; windowLabel: string; miles: number; feeCents: number }[];
}) {
  if (params.deliveries.length === 0) return;
  const { error } = await supabaseAdmin.from('order_deliveries').insert(
    params.deliveries.map((d) => ({
      checkout_id: params.checkoutId,
      farmer_id: d.farmerId,
      buyer_id: params.buyerId,
      buyer_email: params.buyerEmail,
      address: params.address.address,
      zip: params.address.zip,
      note: params.address.note,
      delivery_date: d.date,
      window_label: d.windowLabel,
      miles: d.miles,
      fee_cents: d.feeCents,
      status: 'unpaid',
    }))
  );
  if (error) throw error;
}

// A row of order_deliveries.
export type DeliveryRow = {
  id: string;
  farmer_id: string;
  address: string;
  note: string | null;
  delivery_date: string;
  window_label: string;
  fee_cents: number;
  status: string;
};

// Once a payment succeeds: marks its deliveries open and puts the delivery
// details on the orders they cover. Returns the deliveries by farm, for the
// confirmation emails. Safe to run twice.
export async function attachDeliveries(params: {
  checkoutId: string | null;
  paymentIntentId: string;
  orders: { id: string; farmerId: string }[];
}) {
  const byFarm = new Map<string, DeliveryRow>();
  if (!params.checkoutId) return byFarm;
  const { data } = await supabaseAdmin
    .from('order_deliveries')
    .select('*')
    .eq('checkout_id', params.checkoutId)
    .in('status', ['unpaid', 'open']);
  for (const delivery of data || []) {
    const orderIds = params.orders.filter((o) => o.farmerId === delivery.farmer_id).map((o) => o.id);
    if (orderIds.length === 0) continue;
    const settings = await farmDelivery(delivery.farmer_id);
    const end = deliveryEnd(settings, String(delivery.delivery_date));
    await supabaseAdmin
      .from('orders')
      .update({
        fulfillment: 'delivery',
        delivery_id: delivery.id,
        delivery_address: delivery.address,
        delivery_note: delivery.note || null,
        delivery_date: delivery.delivery_date,
        delivery_window: delivery.window_label,
        // The farm has until the end of the delivery window.
        ready_by: end.toISOString(),
        pickup_by: end.toISOString(),
      })
      .in('id', orderIds);
    if (delivery.status === 'unpaid') {
      await supabaseAdmin
        .from('order_deliveries')
        .update({ status: 'open', payment_intent_id: params.paymentIntentId })
        .eq('id', delivery.id);
    }
    byFarm.set(delivery.farmer_id, delivery);
  }
  return byFarm;
}

// A Farm Box member who has chosen delivery: the delivery for one box, saved
// unpaid before the box is charged. Returns its fee, or 0 when the member
// picks up (or the farm has stopped delivering).
export async function boxDelivery(params: {
  checkoutId: string;
  farmerId: string;
  member: { buyer_id: string | null; buyer_email: string; delivery_address?: string | null; delivery_zip?: string | null; delivery_note?: string | null };
  boxDate: string;
}) {
  const { member } = params;
  if (!member.delivery_address || !member.delivery_zip) return 0;
  const farm = (await deliveringFarms([params.farmerId])).get(params.farmerId);
  if (!farm) return 0;
  const miles = await drivingMiles(farm.farmZip, member.delivery_zip);
  if (miles === null || miles > farm.radius_miles) return 0;
  const feeCents = farm.fee_cents + farm.per_mile_cents * Math.ceil(miles);
  await saveUnpaidDeliveries({
    checkoutId: params.checkoutId,
    buyerId: member.buyer_id,
    buyerEmail: member.buyer_email,
    address: { address: member.delivery_address, zip: member.delivery_zip, note: member.delivery_note || '' },
    deliveries: [{ farmerId: params.farmerId, date: params.boxDate, windowLabel: deliveryLabel(farm, params.boxDate), miles, feeCents }],
  });
  return feeCents;
}

// A signed link to a delivery photo, for the buyer, the farm or an admin.
export async function deliveryPhotoLink(path: string | null | undefined, seconds = 7 * 24 * 3600) {
  if (!path) return null;
  const { data } = await supabaseAdmin.storage.from(DELIVERY_PHOTO_BUCKET).createSignedUrl(path, seconds);
  return data?.signedUrl || null;
}

const isOpen = (status: string) => status === 'pending_pickup' || status === 'ready_for_pickup';

// Hourly: pays the farm for orders left at the door once the buyer's time to
// report a problem has passed without one. Returns how many were released.
export async function releaseDeliveredOrders(siteUrl: string) {
  const cutoff = new Date(Date.now() - DELIVERY_RELEASE_HOURS * 3600 * 1000).toISOString();
  const { data: orders } = await supabaseAdmin
    .from('orders')
    .select('*')
    .in('status', ['pending_pickup', 'ready_for_pickup'])
    .not('delivered_at', 'is', null)
    .lte('delivered_at', cutoff)
    .is('buyer_problem_at', null)
    .is('no_show_reported_at', null)
    .limit(100);

  let released = 0;
  const thanked = new Set<string>();
  for (const order of orders || []) {
    if (hasOpenDispute(order)) continue;
    try {
      const { data: listing } = await supabaseAdmin.from('produce_listings').select('farmer_id').eq('id', order.listing_id).maybeSingle();
      if (!listing?.farmer_id) continue;
      const groupKey = order.delivery_id || order.id;
      await completeOrderAndReleasePayout(order, listing.farmer_id, siteUrl, !thanked.has(groupKey));
      thanked.add(groupKey);
      released += 1;
    } catch (err) {
      await alertAdmin('releasing an order left at the door', err, { order: order.id });
    }
  }
  return released;
}

// Hourly: settles each delivery whose orders are all finished. If anything
// in it was delivered, the fee goes to the farm (less the seller fee);
// if everything was cancelled, the fee goes back to the buyer. Also deletes
// deliveries never paid for, after a day, with the address on them.
export async function settleDeliveries() {
  const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  await supabaseAdmin.from('order_deliveries').delete().eq('status', 'unpaid').lte('created_at', dayAgo);

  const { data: deliveries } = await supabaseAdmin
    .from('order_deliveries')
    .select('*')
    .eq('status', 'open')
    .limit(100);

  let paid = 0;
  let refunded = 0;
  for (const delivery of deliveries || []) {
    try {
      const { data: orders } = await supabaseAdmin
        .from('orders')
        .select('id, status, dispute_status')
        .eq('delivery_id', delivery.id);
      if (!orders || orders.length === 0) continue;
      if (orders.some((o) => isOpen(o.status) || hasOpenDispute(o))) continue;

      const now = new Date().toISOString();
      if (delivery.fee_cents <= 0) {
        await supabaseAdmin.from('order_deliveries').update({ status: 'closed', settled_at: now }).eq('id', delivery.id);
        continue;
      }

      const paymentIntent = await stripeAdmin.paymentIntents.retrieve(delivery.payment_intent_id);
      const chargeId = typeof paymentIntent.latest_charge === 'string' ? paymentIntent.latest_charge : paymentIntent.latest_charge?.id;

      if (orders.some((o) => o.status === 'completed')) {
        const { data: seller } = await supabaseAdmin
          .from('seller_profiles')
          .select('stripe_account_id')
          .eq('id', delivery.farmer_id)
          .maybeSingle();
        if (!seller?.stripe_account_id || !chargeId) continue;
        const payoutCents = calculateFarmerPayoutCents(
          delivery.fee_cents,
          Number(paymentIntent.metadata?.seller_fee_rate) || SELLER_FEE_RATE
        );
        const transfer = await stripeAdmin.transfers.create(
          {
            amount: payoutCents,
            currency: 'usd',
            destination: seller.stripe_account_id,
            source_transaction: chargeId,
            transfer_group: paymentIntent.transfer_group ?? undefined,
            metadata: { delivery_id: String(delivery.id), kind: 'delivery_fee' },
          },
          { idempotencyKey: `delivery-fee-${delivery.id}` }
        );
        await supabaseAdmin
          .from('order_deliveries')
          .update({ status: 'paid', payout_cents: payoutCents, transfer_id: transfer.id, settled_at: now })
          .eq('id', delivery.id);
        paid += 1;
      } else {
        const refund = await stripeAdmin.refunds.create(
          { payment_intent: delivery.payment_intent_id, amount: delivery.fee_cents, metadata: { delivery_id: String(delivery.id) } },
          { idempotencyKey: `delivery-fee-refund-${delivery.id}` }
        );
        await supabaseAdmin
          .from('order_deliveries')
          .update({ status: 'refunded', refund_id: refund.id, settled_at: now })
          .eq('id', delivery.id);
        refunded += 1;
        if (delivery.buyer_email) {
          await sendEmail({
            to: delivery.buyer_email,
            subject: 'Your delivery fee was refunded',
            html: `<div style="font-family: sans-serif; max-width: 480px;">
              <p>Everything in your delivery for ${escapeHtml(delivery.window_label)} was cancelled, so the delivery fee of
              <strong>$${(delivery.fee_cents / 100).toFixed(2)}</strong> has been refunded to your original payment method.</p>
            </div>`,
          });
        }
      }
    } catch (err) {
      await alertAdmin('settling a delivery fee', err, { delivery: delivery.id });
    }
  }
  return { paid, refunded };
}
