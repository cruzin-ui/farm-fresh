import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { calculateFarmerPayoutCents, SELLER_FEE_RATE } from '@/lib/pricing';
import { orderRef } from '@/lib/pickupGroups';

// SERVER-ONLY. A seller's record book: one line for every order that has
// closed (picked up or cancelled), with what it sold for, the fees, what the
// farm was paid and when, and the sales tax we collected on it. Shared Farm
// Box parts the farm put into another farm's box are included as lines of
// their own, since they're paid from that farm's order.
//
// Shown in Sales & Payouts (components/SellerRecords.tsx) and downloaded as
// the spreadsheet; the rules for what each column means are here.

export type SaleType = 'Order' | 'Farm Box' | 'Flower Box' | 'Market pickup' | 'Wholesale' | 'Shared Farm Box';

export type LedgerLine = {
  // The order, or for a shared-box part "<order id>:share".
  key: string;
  orderId: string;
  // The order number buyers and sellers both see.
  ref: string;
  // An invoice can be printed for it (not for a part of another farm's box).
  invoice: boolean;
  saleType: SaleType;
  item: string;
  quantity: number;
  unit: string;
  // "3 cases of 12" for a wholesale order.
  cases: string | null;
  orderedDay: string;
  // The day it counts on: picked up, or closed if it never was (Arizona time).
  day: string;
  pickedUp: boolean;
  outcome: string;
  salesCents: number;
  feeCents: number;
  // Packing fees in a shared Farm Box: paid to the host by each partner
  // (positive for the host, negative for a partner). 0 otherwise.
  packingCents: number;
  restockingCents: number;
  paidCents: number;
  // Sales tax on the buyer's purchase of this item, which Farm Fresh Direct
  // collected at checkout and pays to the state. 0 for a shared-box part.
  taxCents: number;
  taxExempt: boolean;
  // When the payment reached the farm's Stripe balance, and its transfer.
  paidDay: string | null;
  transferId: string | null;
  buyerName: string | null;
  buyerEmail: string | null;
  pickupCode: string | null;
  marketLabel: string | null;
};

const CANCEL_REASONS: Record<string, string> = {
  seller: 'You cancelled it',
  seller_late: 'Buyer cancelled: not ready in time',
  seller_changed: 'Buyer cancelled after you changed the order',
  never_ready: 'Cancelled automatically: never marked ready',
  listing_removed: 'Listing removed by Farm Fresh Direct',
  admin: 'Cancelled by Farm Fresh Direct',
  buyer: 'Buyer cancelled',
  no_show: 'Buyer did not pick up',
};

const cents = (value: unknown) => Math.round(Number(value || 0) * 100);

// A moment as a calendar day in Arizona, "2026-11-12".
export function arizonaDay(value: string | null | undefined) {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Phoenix', year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(value)
  );
}

// The moment an order closed: picked up, or cancelled.
const closedAt = (o: any) => o.completed_at || o.cancelled_by_buyer_at || o.no_show_reported_at || o.created_at;

export function saleTypeOf(order: any, category: string | null | undefined): SaleType {
  if (category === 'CSA Box') return 'Farm Box';
  if (category === 'Flower Box') return 'Flower Box';
  if (order.wholesale_cases) return 'Wholesale';
  if (order.market_appearance_id) return 'Market pickup';
  return 'Order';
}

const outcomeOf = (o: any) =>
  o.status === 'completed' ? 'Picked up' : CANCEL_REASONS[o.cancel_reason || ''] || 'Cancelled';

// A shared box's money for one farm: its parts (a host also counts the parts
// it filled in for), what it was paid, and the packing fee in or out.
function shareMoney(order: any, shares: any[], farmerId: string) {
  const mine = shares.find((s) => s.farmer_id === farmerId);
  if (!mine) return null;
  const rate = order.seller_fee_rate != null ? Number(order.seller_fee_rate) : SELLER_FEE_RATE;
  const paid = Number(mine.payout_cents || 0);
  if (order.status !== 'completed') {
    return { sales: 0, fee: 0, packing: 0, restocking: paid, paid, transferId: mine.stripe_transfer_id || null };
  }
  const counted = shares.filter((s) =>
    mine.role === 'host'
      ? (s.role === 'host' && s.status !== 'refunded') || s.status === 'substituted'
      : s.farmer_id === farmerId && s.status === 'included'
  );
  const sales = counted.reduce((sum, s) => sum + Number(s.share_cents || 0), 0);
  const afterFee = calculateFarmerPayoutCents(sales, rate);
  return {
    sales,
    fee: sales - afterFee,
    packing: paid - afterFee,
    restocking: 0,
    paid,
    transferId: mine.stripe_transfer_id || null,
  };
}

export async function sellerLedger(farmerId: string): Promise<LedgerLine[]> {
  // Every listing the farm has posted, including hidden Farm Box ones.
  const { data: listings } = await supabaseAdmin
    .from('produce_listings')
    .select('id, title, variety, unit_type, category')
    .eq('farmer_id', farmerId);
  const listingById = new Map((listings || []).map((l) => [l.id as string, l]));

  const own: any[] = [];
  const ids = [...listingById.keys()];
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabaseAdmin
      .from('orders')
      .select('*')
      .in('listing_id', ids.slice(i, i + 200))
      .in('status', ['completed', 'cancelled']);
    own.push(...(data || []));
  }

  // Parts of other farms' shared boxes this farm filled.
  const { data: partnerShares } = await supabaseAdmin
    .from('order_farm_shares')
    .select('order_id')
    .eq('farmer_id', farmerId)
    .eq('role', 'partner');
  const partnerOrderIds = [...new Set((partnerShares || []).map((s) => s.order_id as string))];
  const { data: partnerOrders } = partnerOrderIds.length
    ? await supabaseAdmin.from('orders').select('*').in('id', partnerOrderIds).in('status', ['completed', 'cancelled'])
    : { data: [] as any[] };

  const allOrderIds = [...own.map((o) => o.id), ...(partnerOrders || []).map((o) => o.id)];
  const sharesByOrder = new Map<string, any[]>();
  for (let i = 0; i < allOrderIds.length; i += 200) {
    const { data } = await supabaseAdmin.from('order_farm_shares').select('*').in('order_id', allOrderIds.slice(i, i + 200));
    for (const s of data || []) sharesByOrder.set(s.order_id, [...(sharesByOrder.get(s.order_id) || []), s]);
  }

  const completedIds = own.filter((o) => o.status === 'completed').map((o) => o.id);
  const codeByOrder = new Map<string, string>();
  for (let i = 0; i < completedIds.length; i += 200) {
    const { data } = await supabaseAdmin.from('order_pickup_codes').select('order_id, code').in('order_id', completedIds.slice(i, i + 200));
    for (const c of data || []) codeByOrder.set(c.order_id, c.code);
  }

  // Hidden Farm Box listings of other farms, for naming partner lines.
  const otherListingIds = [...new Set((partnerOrders || []).map((o) => o.listing_id))].filter((id) => !listingById.has(id));
  const { data: otherListings } = otherListingIds.length
    ? await supabaseAdmin.from('produce_listings').select('id, title, category, farmer_id').in('id', otherListingIds)
    : { data: [] as any[] };
  const otherById = new Map((otherListings || []).map((l) => [l.id as string, l]));
  const hostIds = [...new Set((otherListings || []).map((l) => l.farmer_id))];
  const { data: hosts } = hostIds.length
    ? await supabaseAdmin.from('seller_profiles').select('id, farm_name').in('id', hostIds)
    : { data: [] as any[] };
  const hostName = new Map((hosts || []).map((h) => [h.id as string, h.farm_name as string]));

  const lines: LedgerLine[] = [];

  for (const o of own) {
    const listing = listingById.get(o.listing_id);
    const completed = o.status === 'completed';
    const shares = sharesByOrder.get(o.id) || [];
    const split = shares.length ? shareMoney(o, shares, farmerId) : null;
    const sales = split ? split.sales : completed ? cents(o.subtotal_amount) : 0;
    const paid = split ? split.paid : completed ? cents(o.farmer_payout_amount) : cents(o.no_show_fee_amount);
    const restocking = split ? split.restocking : completed ? 0 : cents(o.no_show_fee_amount);
    const fee = split ? split.fee : completed ? Math.max(0, sales - paid) : 0;
    const day = arizonaDay(closedAt(o));
    const transferId = split ? split.transferId : o.stripe_transfer_id || null;
    const quantity = Number((completed ? o.reserved_quantity : o.original_quantity ?? o.reserved_quantity) ?? 0);
    lines.push({
      key: o.id,
      orderId: o.id,
      ref: orderRef(o),
      invoice: true,
      // A box this farm hosted with partner farms.
      saleType: split ? 'Shared Farm Box' : saleTypeOf(o, listing?.category),
      item: [listing?.title || 'Harvest Crop', listing?.variety].filter(Boolean).join(' · '),
      quantity,
      unit: listing?.unit_type || '',
      cases: o.wholesale_cases ? `${o.wholesale_cases} case${o.wholesale_cases === 1 ? '' : 's'} of ${o.wholesale_case_size}` : null,
      orderedDay: arizonaDay(o.created_at),
      day,
      pickedUp: completed,
      outcome: outcomeOf(o),
      salesCents: sales,
      feeCents: fee,
      packingCents: split ? split.packing : 0,
      restockingCents: restocking,
      paidCents: paid,
      taxCents: cents(o.tax_amount),
      taxExempt: Boolean(o.tax_exempt_certificate_id),
      paidDay: paid > 0 ? day : null,
      transferId,
      buyerName: o.buyer_name || null,
      buyerEmail: o.buyer_email || null,
      pickupCode: completed ? codeByOrder.get(o.id) || o.pickup_code || null : null,
      marketLabel: o.market_label || null,
    });
  }

  for (const o of partnerOrders || []) {
    const split = shareMoney(o, sharesByOrder.get(o.id) || [], farmerId);
    if (!split) continue;
    const listing = otherById.get(o.listing_id);
    const day = arizonaDay(closedAt(o));
    lines.push({
      key: `${o.id}:share`,
      orderId: o.id,
      ref: orderRef(o),
      invoice: false,
      saleType: 'Shared Farm Box',
      item: `Your part of ${listing?.title || 'a Farm Box'}${listing ? ` (${hostName.get(listing.farmer_id) || 'host farm'})` : ''}`,
      quantity: 1,
      unit: 'box',
      cases: null,
      orderedDay: arizonaDay(o.created_at),
      day,
      pickedUp: o.status === 'completed',
      outcome: outcomeOf(o),
      salesCents: split.sales,
      feeCents: split.fee,
      packingCents: split.packing,
      restockingCents: split.restocking,
      paidCents: split.paid,
      taxCents: 0,
      taxExempt: false,
      paidDay: split.paid > 0 ? day : null,
      transferId: split.transferId,
      // The buyer is the host farm's customer.
      buyerName: null,
      buyerEmail: null,
      pickupCode: null,
      marketLabel: null,
    });
  }

  return lines.sort((a, b) => b.day.localeCompare(a.day) || b.orderedDay.localeCompare(a.orderedDay));
}
