'use client';

import { Printer, Sprout } from 'lucide-react';
import { orderRef } from '@/lib/pickupGroups';
import { isSellerLate, canReportNoShow } from '@/lib/pickupRules';

type PickListOrder = {
  id: string;
  listing_id: string;
  checkout_id?: string | null;
  status: string;
  created_at: string;
  reserved_quantity: number;
  listing_title: string;
  listing_unit_type: string;
  ready_by?: string | null;
  pickup_by?: string | null;
  no_show_reported_at?: string | null;
};

type PickListListing = { id: string; variety?: string | null };

const shortDate = (date: string | Date) =>
  new Date(date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

const time = (date?: string | null) => (date ? new Date(date).getTime() : Number.MAX_SAFE_INTEGER);

// A box to tick with a pen on the printed sheet.
const TickBox = () => <span aria-hidden="true" className="inline-block w-4 h-4 border-2 border-gray-400 rounded-sm shrink-0" />;

const itemText = (order: PickListOrder) => `${order.reserved_quantity} ${order.listing_unit_type} ${order.listing_title}`;

// The seller's working sheet, kept to three short lists: what to harvest and
// by when, what goes in each buyer's bag, and what is already ready and
// waiting to be collected. Built from the seller's open orders; nothing here
// changes an order. It prints as a clean page to take out to the garden.
export default function PickList({
  orders,
  listings,
  farmName,
}: {
  orders: PickListOrder[];
  listings: PickListListing[];
  farmName: string;
}) {
  const listingById = new Map(listings.map((listing) => [listing.id, listing]));
  const toPrepare = orders.filter((order) => order.status === 'pending_pickup');
  const waiting = orders.filter((order) => order.status === 'ready_for_pickup');

  // What to harvest: one line per crop, soonest deadline first.
  const crops = new Map<string, { listingId: string; title: string; unit: string; total: number; earliest: string | null; late: boolean }>();
  for (const order of toPrepare) {
    const crop = crops.get(order.listing_id) || {
      listingId: order.listing_id,
      title: order.listing_title,
      unit: order.listing_unit_type,
      total: 0,
      earliest: null,
      late: false,
    };
    crop.total += Number(order.reserved_quantity || 0);
    if (order.ready_by && time(order.ready_by) < time(crop.earliest)) crop.earliest = order.ready_by;
    if (isSellerLate(order)) crop.late = true;
    crops.set(order.listing_id, crop);
  }
  const cropRows = [...crops.values()].sort((a, b) => time(a.earliest) - time(b.earliest) || a.title.localeCompare(b.title));

  // One bag per buyer: everything they bought together.
  const groupByBuyer = (list: PickListOrder[], dateOf: (order: PickListOrder) => string | null | undefined) => {
    const groups = new Map<string, PickListOrder[]>();
    for (const order of list) {
      const key = order.checkout_id || order.id;
      groups.set(key, [...(groups.get(key) || []), order]);
    }
    const earliest = (bag: PickListOrder[]) => Math.min(...bag.map((order) => time(dateOf(order))));
    return [...groups.values()].sort((a, b) => earliest(a) - earliest(b));
  };
  const bags = groupByBuyer(toPrepare, (order) => order.ready_by);
  const waitingBags = groupByBuyer(waiting, (order) => order.pickup_by);

  const heading = 'text-sm font-bold text-gray-900 uppercase tracking-wide';
  const row = 'flex items-center gap-3 py-2.5';

  return (
    <div className="print-area space-y-6 max-w-2xl">
      <div className="pb-4 border-b border-gray-100 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pick List</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            {farmName ? `${farmName} · ` : ''}
            {shortDate(new Date())}
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="print:hidden inline-flex items-center gap-1.5 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 text-xs font-bold px-3.5 py-2.5 rounded-xl"
        >
          <Printer className="w-4 h-4" aria-hidden="true" /> Print
        </button>
      </div>

      {orders.length === 0 && (
        <div className="text-center py-16 bg-gray-50 rounded-xl border border-dashed border-gray-200">
          <Sprout className="mx-auto h-12 w-12 text-gray-400 mb-3" aria-hidden="true" />
          <h2 className="text-base font-semibold text-gray-900">Nothing to pick right now</h2>
          <p className="text-xs text-gray-500 mt-1">When buyers order from your listings, what you need to harvest shows up here.</p>
        </div>
      )}

      {cropRows.length > 0 && (
        <section>
          <h2 className={heading}>Harvest</h2>
          <ul className="divide-y divide-gray-100">
            {cropRows.map((crop) => {
              const variety = listingById.get(crop.listingId)?.variety;
              return (
                <li key={crop.listingId} className={row}>
                  <TickBox />
                  <span className="flex-1 min-w-0 text-gray-900">
                    <span className="font-black">
                      {crop.total} {crop.unit}
                    </span>{' '}
                    {crop.title}
                    {variety ? <span className="text-gray-500"> ({variety})</span> : null}
                  </span>
                  <span className={`text-sm whitespace-nowrap ${crop.late ? 'font-bold text-red-700' : 'text-gray-600'}`}>
                    {crop.earliest ? `${crop.late ? 'Overdue' : 'By'} ${shortDate(crop.earliest)}` : ''}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {bags.length > 0 && (
        <section>
          <h2 className={heading}>Bag for each buyer</h2>
          <ul className="divide-y divide-gray-100">
            {bags.map((bag) => (
              <li key={bag[0].id} className={row}>
                <TickBox />
                <span className="font-mono font-bold text-gray-900 w-20 shrink-0">{orderRef(bag[0])}</span>
                <span className="flex-1 min-w-0 text-gray-800">{bag.map(itemText).join(', ')}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {waitingBags.length > 0 && (
        <section>
          <h2 className={heading}>Ready, waiting for pickup</h2>
          <ul className="divide-y divide-gray-100">
            {waitingBags.map((bag) => {
              const pickupBy = bag.map((order) => order.pickup_by).filter(Boolean).sort()[0];
              const timeUp = bag.some((order) => order.pickup_by && canReportNoShow(order));
              const reported = bag.some((order) => order.no_show_reported_at);
              return (
                <li key={bag[0].id} className={row}>
                  <span className="font-mono font-bold text-gray-900 w-20 shrink-0">{orderRef(bag[0])}</span>
                  <span className="flex-1 min-w-0 text-gray-800">{bag.map(itemText).join(', ')}</span>
                  <span className={`text-sm whitespace-nowrap ${timeUp ? 'font-bold text-amber-800' : 'text-gray-600'}`}>
                    {reported ? 'No-show reported' : pickupBy ? `${timeUp ? 'Ended' : 'Until'} ${shortDate(pickupBy)}` : ''}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
