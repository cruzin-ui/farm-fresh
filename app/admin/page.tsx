'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, AlertCircle, CheckCircle2, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { postWithAuth } from '@/lib/authedFetch';

type AdminOrder = {
  id: string;
  created_at: string;
  status: string;
  buyer_email: string | null;
  listing_title: string;
  unit_type: string;
  farm_name: string;
  quantity: number;
  total_price: number;
  refunded_amount: number;
  paid_via_stripe: boolean;
  payout_released: boolean;
  stripe_payment_intent_id: string | null;
  pickup_code: string | null;
  failed_code_attempts: number;
};

type SummaryRow = {
  month: string;
  farmer_id: string;
  farm_name: string;
  orders: number;
  produce_sales: number;
  farmer_paid: number;
  platform_fees: number;
  estimated_card_fees: number;
  estimated_net: number;
};

type OrderFilter = 'open' | 'all';

const formatMonth = (month: string) =>
  new Date(`${month}-01T12:00:00Z`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

const STATUS_LABELS: Record<string, string> = {
  pending_pickup: 'Pending Harvest',
  ready_for_pickup: 'Ready for Pickup',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const isOpen = (order: AdminOrder) =>
  order.status === 'pending_pickup' || order.status === 'ready_for_pickup';

export default function AdminPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [notAuthorized, setNotAuthorized] = useState(false);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [filter, setFilter] = useState<OrderFilter>('open');
  const [summaryRows, setSummaryRows] = useState<SummaryRow[]>([]);
  const [summaryMonth, setSummaryMonth] = useState<string>('');
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchOrders = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      router.push('/login?redirect=/admin');
      return;
    }

    const res = await postWithAuth('/api/admin/orders');
    if (res.status === 403) {
      setNotAuthorized(true);
      setLoading(false);
      return;
    }

    const data = await res.json();
    if (!res.ok) {
      setErrorMsg(data.error || 'Failed to load orders.');
    } else {
      setOrders(data.orders);
    }

    const summaryRes = await postWithAuth('/api/admin/summary');
    const summaryData = await summaryRes.json();
    if (summaryRes.ok) {
      setSummaryRows(summaryData.rows);
      setSummaryMonth((current) => current || summaryData.rows[0]?.month || '');
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runAction = async (order: AdminOrder, action: string, confirmText: string) => {
    if (!confirm(confirmText)) return;

    setBusyOrderId(order.id);
    setSuccessMsg(null);
    setErrorMsg(null);

    try {
      const res = await postWithAuth('/api/admin/orders/action', { orderId: order.id, action });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Action failed.');

      setSuccessMsg(data.message);
      await fetchOrders();
    } catch (err: any) {
      setErrorMsg(err.message || 'Action failed.');
    } finally {
      setBusyOrderId(null);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto my-20 p-8 text-center text-gray-500 text-sm">
        Loading admin dashboard...
      </div>
    );
  }

  if (notAuthorized) {
    return (
      <div className="max-w-md mx-auto my-20 p-6 bg-white border rounded-2xl text-center text-sm text-gray-600 shadow-sm">
        This page is only available to Farm Fresh Direct administrators.
      </div>
    );
  }

  const visibleOrders = filter === 'open' ? orders.filter(isOpen) : orders;

  const summaryMonths = [...new Set(summaryRows.map((r) => r.month))];
  const monthRows = summaryRows.filter((r) => r.month === summaryMonth);
  const monthTotals = monthRows.reduce(
    (acc, r) => ({
      produce_sales: acc.produce_sales + r.produce_sales,
      farmer_paid: acc.farmer_paid + r.farmer_paid,
      platform_fees: acc.platform_fees + r.platform_fees,
      estimated_net: acc.estimated_net + r.estimated_net,
    }),
    { produce_sales: 0, farmer_paid: 0, platform_fees: 0, estimated_net: 0 }
  );
  const farmersAtALoss = monthRows.filter((r) => r.estimated_net < 0).length;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-emerald-600" /> Admin — Orders & Payments
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            The 200 most recent orders across all farmers. Overrides here move real money.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {(['open', 'all'] as OrderFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors ${
                filter === f ? 'bg-emerald-600 text-white' : 'bg-white border text-gray-600 hover:bg-gray-50'
              }`}
            >
              {f === 'open' ? 'Open orders' : 'All orders'}
            </button>
          ))}
          <button
            onClick={fetchOrders}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white border text-gray-600 hover:bg-gray-50"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>
      </div>

      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl flex items-center gap-2 text-sm">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-center gap-2 text-sm">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* FARMER SALES BY MONTH */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Farmer Sales by Month</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Completed orders and no-shows, grouped by the month the order was placed.
            </p>
          </div>
          {summaryMonths.length > 0 && (
            <select
              value={summaryMonth}
              onChange={(e) => setSummaryMonth(e.target.value)}
              className="px-3 py-2 border rounded-xl text-xs font-semibold bg-white"
            >
              {summaryMonths.map((m) => (
                <option key={m} value={m}>
                  {formatMonth(m)}
                </option>
              ))}
            </select>
          )}
        </div>

        {monthRows.length === 0 ? (
          <p className="text-sm text-gray-500 py-4 text-center">
            No completed sales in the last six months yet.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div className="p-3 bg-gray-50 rounded-xl">
                <p className="text-gray-500">Active farmers</p>
                <p className="text-lg font-black text-gray-900">{monthRows.length}</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-xl">
                <p className="text-gray-500">Produce sold</p>
                <p className="text-lg font-black text-gray-900">${monthTotals.produce_sales.toFixed(2)}</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-xl">
                <p className="text-gray-500">Estimated platform net</p>
                <p
                  className={`text-lg font-black ${
                    monthTotals.estimated_net < 0 ? 'text-red-600' : 'text-emerald-700'
                  }`}
                >
                  ${monthTotals.estimated_net.toFixed(2)}
                </p>
              </div>
              <div className="p-3 bg-gray-50 rounded-xl">
                <p className="text-gray-500">Farmers below break-even</p>
                <p className="text-lg font-black text-gray-900">
                  {farmersAtALoss} of {monthRows.length}
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="text-gray-500 border-b">
                  <tr>
                    <th className="py-2 pr-4 font-semibold">Farm</th>
                    <th className="py-2 pr-4 font-semibold text-right">Orders</th>
                    <th className="py-2 pr-4 font-semibold text-right">Produce sold</th>
                    <th className="py-2 pr-4 font-semibold text-right">Paid to farmer</th>
                    <th className="py-2 pr-4 font-semibold text-right">Platform fees</th>
                    <th className="py-2 pr-4 font-semibold text-right">Est. card fees</th>
                    <th className="py-2 font-semibold text-right">Est. net</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {monthRows.map((r) => (
                    <tr key={r.farmer_id}>
                      <td className="py-2 pr-4 font-semibold text-gray-900">{r.farm_name}</td>
                      <td className="py-2 pr-4 text-right">{r.orders}</td>
                      <td className="py-2 pr-4 text-right">${r.produce_sales.toFixed(2)}</td>
                      <td className="py-2 pr-4 text-right">${r.farmer_paid.toFixed(2)}</td>
                      <td className="py-2 pr-4 text-right">${r.platform_fees.toFixed(2)}</td>
                      <td className="py-2 pr-4 text-right">${r.estimated_card_fees.toFixed(2)}</td>
                      <td
                        className={`py-2 text-right font-bold ${
                          r.estimated_net < 0 ? 'text-red-600' : 'text-emerald-700'
                        }`}
                      >
                        ${r.estimated_net.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-[11px] text-gray-400">
              Estimated net = platform fees − card fees (2.9% + 30¢ per order) − Stripe's $2 monthly fee per
              active farmer. It leaves out Stripe's per-payout fees, 1099 fees and disputes, so the real figure is
              a little lower. Orders placed before fee tracking was added may be slightly off.
            </p>
          </>
        )}
      </div>

      <h2 className="text-lg font-bold text-gray-900">Orders</h2>

      {visibleOrders.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-dashed border-gray-200 text-sm text-gray-500">
          No {filter === 'open' ? 'open ' : ''}orders.
        </div>
      ) : (
        <div className="space-y-3">
          {visibleOrders.map((order) => {
            const busy = busyOrderId === order.id;
            const refundable =
              order.paid_via_stripe && (isOpen(order) || order.status === 'completed') && order.total_price > 0;

            return (
              <div
                key={order.id}
                className="p-5 bg-white border border-gray-200 rounded-2xl shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4"
              >
                <div className="space-y-1 text-xs text-gray-600">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase ${
                        isOpen(order)
                          ? 'bg-amber-100 text-amber-800'
                          : order.status === 'completed'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {STATUS_LABELS[order.status] || order.status}
                    </span>
                    <span className="text-gray-400">
                      Order #{order.id.slice(0, 8)} · {new Date(order.created_at).toLocaleString()}
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-gray-900">
                    {order.quantity} {order.unit_type} of {order.listing_title}
                  </h3>
                  <p>
                    Farm: <span className="font-semibold">{order.farm_name}</span> · Buyer:{' '}
                    <span className="font-semibold">{order.buyer_email || 'Unknown'}</span>
                  </p>
                  <p>
                    Paid: <span className="font-semibold">${order.total_price.toFixed(2)}</span>
                    {order.refunded_amount > 0 && ` · Refunded: $${order.refunded_amount.toFixed(2)}`}
                    {' · '}
                    {!order.paid_via_stripe
                      ? 'Not paid through Stripe'
                      : order.payout_released
                        ? 'Payout released to farmer'
                        : 'Payout held by platform'}
                  </p>
                  <p>
                    Pickup code:{' '}
                    <span className="font-mono font-bold text-gray-900">{order.pickup_code || '—'}</span>
                    {order.failed_code_attempts > 0 && (
                      <span className="text-red-600 font-semibold">
                        {' '}
                        · {order.failed_code_attempts} wrong attempt{order.failed_code_attempts === 1 ? '' : 's'}
                      </span>
                    )}
                  </p>
                  {order.stripe_payment_intent_id && (
                    <p className="font-mono text-[10px] text-gray-400">{order.stripe_payment_intent_id}</p>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 shrink-0">
                  {isOpen(order) && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        runAction(
                          order,
                          'release',
                          `Complete this order WITHOUT a pickup code and release the payout to ${order.farm_name}?`
                        )
                      }
                      className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-400 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition-colors"
                    >
                      Release Payout
                    </button>
                  )}
                  {isOpen(order) && order.paid_via_stripe && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        runAction(
                          order,
                          'no_show',
                          `Close this order as a no-show? The buyer is refunded the produce cost minus a 10% restocking fee paid to ${order.farm_name}, and the platform fee is kept.`
                        )
                      }
                      className="bg-white border border-amber-300 text-amber-700 hover:bg-amber-50 disabled:opacity-50 text-xs font-bold px-3.5 py-2 rounded-xl transition-colors"
                    >
                      No-Show
                    </button>
                  )}
                  {refundable && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        runAction(
                          order,
                          'refund',
                          `Cancel this order and refund $${order.total_price.toFixed(2)} to ${order.buyer_email || 'the buyer'}?` +
                            (order.payout_released ? ` This also pulls the payout back from ${order.farm_name}.` : '')
                        )
                      }
                      className="bg-white border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50 text-xs font-bold px-3.5 py-2 rounded-xl transition-colors"
                    >
                      Cancel & Refund
                    </button>
                  )}
                  {isOpen(order) && order.failed_code_attempts > 0 && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        runAction(order, 'reset_attempts', 'Reset the wrong-code counter so the farmer can try again?')
                      }
                      className="bg-white border text-gray-600 hover:bg-gray-50 disabled:opacity-50 text-xs font-bold px-3.5 py-2 rounded-xl transition-colors"
                    >
                      Reset Code Attempts
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
