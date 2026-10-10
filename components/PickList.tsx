'use client';

import { Printer, Sprout, ShoppingBag, PackageCheck, AlertCircle } from 'lucide-react';
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
  farmer_payout_amount?: number | null;
  no_show_reported_at?: string | null;
};

type PickListListing = { id: string; variety?: string | null; available_quantity?: number | null };

const shortDate = (date: string | Date) =>
  new Date(date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

const time = (date?: string | null) => (date ? new Date(date).getTime() : Number.MAX_SAFE_INTEGER);

// A box to tick with a pen on the printed sheet.
const TickBox = () => <span aria-hidden="true" className="inline-block w-4 h-4 border-2 border-gray-500 rounded-sm shrink-0" />;

// The seller's working sheet: what to harvest and by when, how to bag it up
// per buyer, and what is already sitting ready and waiting to be collected.
// Built from the seller's open orders; nothing here changes an order. It
// prints as a clean page to take out to the garden.
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

  // --- What to harvest: one line per crop, soonest deadline first ---
  const crops = new Map<
    string,
    { listingId: string; title: string; unit: string; total: number; orders: PickListOrder[]; earliest: string | null }
  >();
  for (const order of toPrepare) {
    const crop = crops.get(order.listing_id) || {
      listingId: order.listing_id,
      title: order.listing_title,
      unit: order.listing_unit_type,
      total: 0,
      orders: [],
      earliest: null,
    };
    crop.total += Number(order.reserved_quantity || 0);
    crop.orders.push(order);
    if (order.ready_by && time(order.ready_by) < time(crop.earliest)) crop.earliest = order.ready_by;
    crops.set(order.listing_id, crop);
  }
  const cropRows = [...crops.values()].sort((a, b) => time(a.earliest) - time(b.earliest) || a.title.localeCompare(b.title));

  // --- How to bag it: one bag per buyer (everything they bought together) ---
  const groupByBuyer = (list: PickListOrder[]) => {
    const groups = new Map<string, PickListOrder[]>();
    for (const order of list) {
      const key = order.checkout_id || order.id;
      groups.set(key, [...(groups.get(key) || []), order]);
    }
    return [...groups.values()];
  };
  const bags = groupByBuyer(toPrepare).sort(
    (a, b) => Math.min(...a.map((o) => time(o.ready_by))) - Math.min(...b.map((o) => time(o.ready_by)))
  );
  const waitingBags = groupByBuyer(waiting).sort(
    (a, b) => Math.min(...a.map((o) => time(o.pickup_by))) - Math.min(...b.map((o) => time(o.pickup_by)))
  );

  const overdueCount = toPrepare.filter((order) => isSellerLate(order)).length;
  const nextDue = cropRows.find((crop) => crop.earliest)?.earliest || null;
  const payoutTotal = toPrepare.reduce((sum, order) => sum + Number(order.farmer_payout_amount || 0), 0);

  return (
    <div className="print-area space-y-6">
      <div className="pb-4 border-b border-gray-100 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pick List</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            {farmName ? `${farmName} · ` : ''}What to harvest and prepare, as of {shortDate(new Date())}.
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

      {orders.length === 0 ? (
        <div className="text-center py-16 bg-gray-50 rounded-xl border border-dashed border-gray-200">
          <Sprout className="mx-auto h-12 w-12 text-gray-400 mb-3" aria-hidden="true" />
          <h2 className="text-base font-semibold text-gray-900">Nothing to pick right now</h2>
          <p className="text-xs text-gray-500 mt-1">When buyers order from your listings, what you need to harvest shows up here.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div className="p-3 bg-gray-50 rounded-xl">
              <p className="text-gray-600">Orders to prepare</p>
              <p className="text-lg font-black text-gray-900">{toPrepare.length}</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-xl">
              <p className="text-gray-600">Next due</p>
              <p className="text-lg font-black text-gray-900">{nextDue ? shortDate(nextDue) : '—'}</p>
            </div>
            <div className={`p-3 rounded-xl ${overdueCount > 0 ? 'bg-red-50' : 'bg-gray-50'}`}>
              <p className="text-gray-600">Overdue</p>
              <p className={`text-lg font-black ${overdueCount > 0 ? 'text-red-700' : 'text-gray-900'}`}>{overdueCount}</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-xl">
              <p className="text-gray-600">Your payout for these</p>
              <p className="text-lg font-black text-emerald-700">${payoutTotal.toFixed(2)}</p>
            </div>
          </div>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Sprout className="w-5 h-5 text-emerald-600" aria-hidden="true" /> To harvest
            </h2>
            {cropRows.length === 0 ? (
              <p className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-xl p-3">
                Nothing left to harvest. Everything ordered has been marked ready.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <caption className="sr-only">Total to harvest for each crop, soonest deadline first</caption>
                  <thead className="text-xs text-gray-500 border-b">
                    <tr>
                      <th scope="col" className="py-2 pr-3 font-semibold w-8">
                        <span className="sr-only">Done</span>
                      </th>
                      <th scope="col" className="py-2 pr-4 font-semibold">Crop</th>
                      <th scope="col" className="py-2 pr-4 font-semibold text-right">Total to pick</th>
                      <th scope="col" className="py-2 pr-4 font-semibold text-right">Orders</th>
                      <th scope="col" className="py-2 pr-4 font-semibold">Ready by</th>
                      <th scope="col" className="py-2 font-semibold text-right">Still listed for sale</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {cropRows.map((crop) => {
                      const listing = listingById.get(crop.listingId);
                      const late = crop.orders.some((order) => isSellerLate(order));
                      return (
                        <tr key={crop.listingId}>
                          <td className="py-2.5 pr-3">
                            <TickBox />
                          </td>
                          <th scope="row" className="py-2.5 pr-4 font-bold text-gray-900">
                            {crop.title}
                            {listing?.variety ? <span className="font-normal text-gray-600"> — {listing.variety}</span> : null}
                          </th>
                          <td className="py-2.5 pr-4 text-right font-black text-gray-900 whitespace-nowrap">
                            {crop.total} {crop.unit}
                          </td>
                          <td className="py-2.5 pr-4 text-right">{crop.orders.length}</td>
                          <td className={`py-2.5 pr-4 whitespace-nowrap ${late ? 'font-bold text-red-700' : ''}`}>
                            {crop.earliest ? shortDate(crop.earliest) : '—'}
                            {late && ' (overdue)'}
                          </td>
                          <td className="py-2.5 text-right whitespace-nowrap">
                            {Math.floor(Number(listing?.available_quantity ?? 0))} {crop.unit}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-[11px] text-gray-500">
              "Total to pick" covers orders already paid for. "Still listed for sale" is what buyers can still order
              on top of that.
            </p>
          </section>

          {bags.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-emerald-600" aria-hidden="true" /> Pack by buyer
              </h2>
              <p className="text-xs text-gray-600">
                One bag per buyer. Write the order number on the bag: the buyer has the same number on their order
                page, so you can find their bag at pickup.
              </p>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {bags.map((bag) => {
                  const due = bag.map((order) => order.ready_by).filter(Boolean).sort()[0];
                  const late = bag.some((order) => isSellerLate(order));
                  return (
                    <li key={bag[0].id} className="border border-gray-200 rounded-xl p-3 space-y-2 break-inside-avoid">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-black text-gray-900 font-mono">Order {orderRef(bag[0])}</p>
                        <p className={`text-xs ${late ? 'font-bold text-red-700' : 'text-gray-600'}`}>
                          {due ? `Ready by ${shortDate(due)}` : ''}
                          {late && ' (overdue)'}
                        </p>
                      </div>
                      <ul className="space-y-1.5">
                        {bag.map((order) => (
                          <li key={order.id} className="flex items-center gap-2 text-sm text-gray-800">
                            <TickBox />
                            <span>
                              <span className="font-bold">
                                {order.reserved_quantity} {order.listing_unit_type}
                              </span>{' '}
                              of {order.listing_title}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {waitingBags.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <PackageCheck className="w-5 h-5 text-emerald-600" aria-hidden="true" /> Ready and waiting for pickup
              </h2>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {waitingBags.map((bag) => {
                  const pickupBy = bag.map((order) => order.pickup_by).filter(Boolean).sort()[0];
                  const timeUp = bag.some((order) => order.pickup_by && canReportNoShow(order));
                  const reported = bag.some((order) => order.no_show_reported_at);
                  return (
                    <li key={bag[0].id} className="border border-gray-200 rounded-xl p-3 space-y-2 break-inside-avoid">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-black text-gray-900 font-mono">Order {orderRef(bag[0])}</p>
                        <p className={`text-xs ${timeUp ? 'font-bold text-amber-800' : 'text-gray-600'}`}>
                          {pickupBy ? `${timeUp ? 'Pickup time ended' : 'Buyer has until'} ${shortDate(pickupBy)}` : ''}
                        </p>
                      </div>
                      <ul className="space-y-1 text-sm text-gray-800">
                        {bag.map((order) => (
                          <li key={order.id}>
                            <span className="font-bold">
                              {order.reserved_quantity} {order.listing_unit_type}
                            </span>{' '}
                            of {order.listing_title}
                          </li>
                        ))}
                      </ul>
                      {reported ? (
                        <p className="text-xs text-amber-900 flex items-center gap-1.5">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /> No-show reported; waiting on the buyer.
                        </p>
                      ) : (
                        timeUp && (
                          <p className="text-xs text-amber-900 flex items-center gap-1.5 print:hidden">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /> You can report this as a
                            no-show under Incoming Orders.
                          </p>
                        )
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
