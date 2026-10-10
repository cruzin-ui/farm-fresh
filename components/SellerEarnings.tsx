'use client';

import React, { useMemo, useState } from 'react';

// A seller's sales at a glance: three headline numbers, what they earned each
// week, and which crops earned it. Everything is worked out from the orders
// the dashboard has already loaded, so this makes no requests of its own.

type SellerOrder = {
  id: string;
  status: string;
  listing_title?: string | null;
  farmer_payout_amount?: number | string | null;
  no_show_fee_amount?: number | string | null;
  completed_at?: string | null;
  cancelled_by_buyer_at?: string | null;
  created_at: string;
};

const WEEKS_SHOWN = 8;
const CROPS_SHOWN = 5;
const PLOT_HEIGHT = 144;

const toCents = (value: unknown) => Math.round(Number(value || 0) * 100);

const money = (cents: number) =>
  `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Axis labels drop the cents when there are none, so "$40" not "$40.00".
const axisMoney = (cents: number) =>
  `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: cents % 100 === 0 ? 0 : 2 })}`;

// What an order that has closed actually paid the seller: the payout for a
// pickup, or the restocking fee for a no-show or late cancellation.
function earnedCents(order: SellerOrder) {
  if (order.status === 'completed') return toCents(order.farmer_payout_amount);
  if (order.status === 'cancelled') return toCents(order.no_show_fee_amount);
  return 0;
}

function startOfWeek(date: Date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - d.getDay());
  return d;
}

// The top of the chart: the smallest round number at or above the tallest bar.
function niceCeiling(cents: number) {
  if (cents <= 0) return 1000;
  const magnitude = Math.pow(10, Math.floor(Math.log10(cents)));
  for (const step of [1, 2, 5, 10]) {
    if (step * magnitude >= cents) return step * magnitude;
  }
  return 10 * magnitude;
}

export default function SellerEarnings({
  history,
  openOrders,
}: {
  history: SellerOrder[];
  openOrders: SellerOrder[];
}) {
  const [activeWeek, setActiveWeek] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  const stats = useMemo(() => {
    const paid = history.filter((o) => earnedCents(o) > 0);
    const totalCents = paid.reduce((sum, o) => sum + earnedCents(o), 0);
    const pickedUp = history.filter((o) => o.status === 'completed').length;
    const waitingCents = openOrders.reduce((sum, o) => sum + toCents(o.farmer_payout_amount), 0);

    const thisWeek = startOfWeek(new Date());
    const weeks = Array.from({ length: WEEKS_SHOWN }, (_, i) => {
      const start = new Date(thisWeek);
      start.setDate(start.getDate() - 7 * (WEEKS_SHOWN - 1 - i));
      return { start, cents: 0, orders: 0 };
    });
    const byCrop = new Map<string, { cents: number; orders: number }>();

    for (const order of paid) {
      const cents = earnedCents(order);
      const when = startOfWeek(new Date(order.completed_at || order.cancelled_by_buyer_at || order.created_at));
      const week = weeks.find((w) => w.start.getTime() === when.getTime());
      if (week) {
        week.cents += cents;
        week.orders += 1;
      }

      const title = order.listing_title || 'Harvest Crop';
      const crop = byCrop.get(title) || { cents: 0, orders: 0 };
      crop.cents += cents;
      crop.orders += 1;
      byCrop.set(title, crop);
    }

    const ranked = [...byCrop.entries()]
      .map(([title, value]) => ({ title, ...value }))
      .sort((a, b) => b.cents - a.cents);
    const crops = ranked.slice(0, CROPS_SHOWN);
    const rest = ranked.slice(CROPS_SHOWN);
    if (rest.length > 0) {
      crops.push({
        title: `${rest.length} other crop${rest.length === 1 ? '' : 's'}`,
        cents: rest.reduce((sum, c) => sum + c.cents, 0),
        orders: rest.reduce((sum, c) => sum + c.orders, 0),
      });
    }

    return { totalCents, pickedUp, waitingCents, weeks, crops, hasSales: paid.length > 0 };
  }, [history, openOrders]);

  const weekLabel = (date: Date) => date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const shortWeekLabel = (date: Date) => `${date.getMonth() + 1}/${date.getDate()}`;
  const orderCount = (n: number) => `${n} order${n === 1 ? '' : 's'}`;

  const top = niceCeiling(Math.max(...stats.weeks.map((w) => w.cents)));
  const topCrop = Math.max(...stats.crops.map((c) => c.cents), 1);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-gray-900">Your sales</h2>
        {stats.hasSales && (
          <button
            type="button"
            onClick={() => setShowTable((v) => !v)}
            className="text-xs font-semibold text-emerald-800 underline underline-offset-2"
          >
            {showTable ? 'Show as charts' : 'Show as tables'}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-4 border border-gray-200 rounded-xl">
          <p className="text-xs text-gray-500">Earned so far</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{money(stats.totalCents)}</p>
          <p className="text-xs text-gray-500 mt-1">After the seller fee</p>
        </div>
        <div className="p-4 border border-gray-200 rounded-xl">
          <p className="text-xs text-gray-500">Waiting on pickup</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{money(stats.waitingCents)}</p>
          <p className="text-xs text-gray-500 mt-1">
            {openOrders.length === 0 ? 'No open orders' : `From ${orderCount(openOrders.length)} still open`}
          </p>
        </div>
        <div className="p-4 border border-gray-200 rounded-xl">
          <p className="text-xs text-gray-500">Orders picked up</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{stats.pickedUp}</p>
          <p className="text-xs text-gray-500 mt-1">Since you started selling</p>
        </div>
      </div>

      {!stats.hasSales ? (
        <div className="p-6 border border-dashed border-gray-300 rounded-xl text-center text-xs text-gray-500">
          Your weekly earnings and best-selling crops will show here after your first pickup.
        </div>
      ) : showTable ? (
        <div className="space-y-4">
          <div className="p-4 border border-gray-200 rounded-xl">
            <table className="w-full text-xs text-gray-700">
              <caption className="text-left text-sm font-bold text-gray-900 pb-2">Earnings by week</caption>
              <thead>
                <tr className="text-gray-500 border-b border-gray-200">
                  <th className="text-left font-semibold py-1.5">Week of</th>
                  <th className="text-right font-semibold py-1.5">Orders</th>
                  <th className="text-right font-semibold py-1.5">Earned</th>
                </tr>
              </thead>
              <tbody>
                {stats.weeks.map((week) => (
                  <tr key={week.start.getTime()} className="border-b border-gray-100 last:border-0">
                    <td className="py-1.5">{weekLabel(week.start)}</td>
                    <td className="py-1.5 text-right tabular-nums">{week.orders}</td>
                    <td className="py-1.5 text-right tabular-nums">{money(week.cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="p-4 border border-gray-200 rounded-xl">
            <table className="w-full text-xs text-gray-700">
              <caption className="text-left text-sm font-bold text-gray-900 pb-2">Earnings by crop</caption>
              <thead>
                <tr className="text-gray-500 border-b border-gray-200">
                  <th className="text-left font-semibold py-1.5">Crop</th>
                  <th className="text-right font-semibold py-1.5">Orders</th>
                  <th className="text-right font-semibold py-1.5">Earned</th>
                </tr>
              </thead>
              <tbody>
                {stats.crops.map((crop) => (
                  <tr key={crop.title} className="border-b border-gray-100 last:border-0">
                    <td className="py-1.5 break-words">{crop.title}</td>
                    <td className="py-1.5 text-right tabular-nums">{crop.orders}</td>
                    <td className="py-1.5 text-right tabular-nums">{money(crop.cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="p-4 border border-gray-200 rounded-xl">
            <h3 className="text-sm font-bold text-gray-900">Earnings by week</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              The last {WEEKS_SHOWN} weeks, by the week each order was picked up.
            </p>

            <div className="flex gap-2 mt-4">
              <div
                className="flex flex-col justify-between text-[10px] text-gray-500 text-right tabular-nums -my-1.5"
                style={{ height: PLOT_HEIGHT + 12 }}
                aria-hidden="true"
              >
                <span>{axisMoney(top)}</span>
                <span>{axisMoney(top / 2)}</span>
                <span>$0</span>
              </div>

              <div className="flex-1 min-w-0">
                <div className="relative" style={{ height: PLOT_HEIGHT }}>
                  <div className="absolute inset-x-0 top-0 border-t border-gray-100" />
                  <div className="absolute inset-x-0 top-1/2 border-t border-gray-100" />
                  <div className="absolute inset-x-0 bottom-0 border-t border-gray-300" />

                  <div className="absolute inset-0 flex">
                    {stats.weeks.map((week, i) => {
                      const height = week.cents > 0 ? Math.max((week.cents / top) * PLOT_HEIGHT, 2) : 0;
                      const active = activeWeek === i;
                      return (
                        <button
                          key={week.start.getTime()}
                          type="button"
                          onPointerEnter={() => setActiveWeek(i)}
                          onPointerLeave={() => setActiveWeek((current) => (current === i ? null : current))}
                          onFocus={() => setActiveWeek(i)}
                          onBlur={() => setActiveWeek((current) => (current === i ? null : current))}
                          aria-label={`Week of ${weekLabel(week.start)}: ${money(week.cents)} from ${orderCount(week.orders)}`}
                          className="relative flex-1 h-full flex items-end justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 rounded"
                        >
                          <span
                            className={`block w-full max-w-[24px] rounded-t ${active ? 'bg-emerald-600' : 'bg-emerald-700'}`}
                            style={{ height }}
                          />
                          {active && (
                            <span
                              className={`absolute z-10 whitespace-nowrap rounded-lg bg-gray-900 px-2.5 py-1.5 text-left shadow-lg pointer-events-none ${
                                i < 2 ? 'left-0' : i >= WEEKS_SHOWN - 2 ? 'right-0' : 'left-1/2 -translate-x-1/2'
                              }`}
                              style={{ bottom: Math.min(height + 6, PLOT_HEIGHT - 40) }}
                            >
                              <span className="block text-sm font-bold text-white">{money(week.cents)}</span>
                              <span className="block text-[10px] text-gray-300">
                                Week of {weekLabel(week.start)} · {orderCount(week.orders)}
                              </span>
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex mt-1.5" aria-hidden="true">
                  {stats.weeks.map((week) => (
                    <span
                      key={week.start.getTime()}
                      className="flex-1 text-center text-[10px] text-gray-500 tabular-nums"
                    >
                      {shortWeekLabel(week.start)}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 border border-gray-200 rounded-xl">
            <h3 className="text-sm font-bold text-gray-900">Earnings by crop</h3>
            <p className="text-xs text-gray-500 mt-0.5">Since you started selling.</p>

            <ul className="mt-4 space-y-3">
              {stats.crops.map((crop) => (
                <li key={crop.title}>
                  <div className="flex items-baseline justify-between gap-3 text-xs">
                    <span className="text-gray-700 break-words min-w-0">{crop.title}</span>
                    <span className="shrink-0 tabular-nums">
                      <span className="font-bold text-gray-900">{money(crop.cents)}</span>
                      <span className="text-gray-500"> · {orderCount(crop.orders)}</span>
                    </span>
                  </div>
                  <div className="mt-1 h-2 border-l border-gray-300">
                    <div
                      className="h-full rounded-r bg-emerald-700"
                      style={{ width: `${Math.max((crop.cents / topCrop) * 100, 1)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
