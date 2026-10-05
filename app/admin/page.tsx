'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Download,
  LayoutDashboard,
  ClipboardList,
  Archive,
  Mail,
  TrendingUp,
  Star,
  PieChart,
  Search,
} from 'lucide-react';
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
  no_show_reported_at: string | null;
  no_show_disputed_at: string | null;
  no_show_auto_approve_at: string | null;
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

type ContactMessage = {
  id: string;
  created_at: string;
  email: string;
  subject: string;
  message: string;
  resolved: boolean;
  user_id: string | null;
};

// The sections of the admin page, chosen from the menu down the side.
type AdminSection = 'overview' | 'attention' | 'open' | 'all' | 'messages' | 'reviews' | 'fees' | 'reports';

type AdminReview = {
  id: string;
  created_at: string;
  seller_id: string;
  order_id: string | null;
  farm_name: string;
  rating: number;
  comment: string | null;
  removed: boolean;
};

// The last twelve months, newest first, as "YYYY-MM" — the months a report
// can be downloaded for.
function recentMonths() {
  const now = new Date();
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    return d.toISOString().slice(0, 7);
  });
}

// Turns rows of data into a CSV file and hands it to the browser to save.
function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return;

  const columns = Object.keys(rows[0]);
  const cell = (value: unknown) => {
    const text = value == null ? '' : String(value);
    // Quote anything a spreadsheet could misread, and neutralise values that
    // would otherwise be run as a formula.
    // (Only text is treated this way, so negative numbers stay numbers.)
    const safe = typeof value === 'string' && /^[=+\-@]/.test(text) ? "'" + text : text;
    return /[",\n]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe;
  };

  const csv = [columns.join(','), ...rows.map((row) => columns.map((c) => cell(row[c])).join(','))].join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

const formatMonth = (month: string) =>
  new Date(`${month}-01T12:00:00Z`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

const STATUS_LABELS: Record<string, string> = {
  pending_pickup: 'Pending Harvest',
  ready_for_pickup: 'Ready for Pickup',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

// Open orders older than this are flagged: the buyer's money is being held
// and nothing will move it until someone acts.
const STALE_AFTER_DAYS = 7;

const daysOpen = (order: AdminOrder) =>
  Math.floor((Date.now() - new Date(order.created_at).getTime()) / (24 * 60 * 60 * 1000));

const isOpen = (order: AdminOrder) =>
  order.status === 'pending_pickup' || order.status === 'ready_for_pickup';

export default function AdminPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [notAuthorized, setNotAuthorized] = useState(false);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [section, setSection] = useState<AdminSection>('overview');
  const [summaryRows, setSummaryRows] = useState<SummaryRow[]>([]);
  const [summaryMonth, setSummaryMonth] = useState<string>('');
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [showResolvedMessages, setShowResolvedMessages] = useState(false);
  const [reviews, setReviews] = useState<AdminReview[]>([]);
  // Fee breakdown: one month ("YYYY-MM") or every month together, and the
  // text typed to find a farm.
  const [feeMonth, setFeeMonth] = useState<string>('all');
  const [farmSearch, setFarmSearch] = useState('');
  const [downloadingReport, setDownloadingReport] = useState(false);
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
      setSummaryMonth((current) => current || summaryData.rows[0]?.month || recentMonths()[0]);
    }

    const messagesRes = await postWithAuth('/api/admin/messages');
    const messagesData = await messagesRes.json();
    if (messagesRes.ok) setMessages(messagesData.messages);

    const reviewsRes = await postWithAuth('/api/admin/reviews');
    const reviewsData = await reviewsRes.json();
    if (reviewsRes.ok) setReviews(reviewsData.reviews);

    setLoading(false);
  };

  const setMessageResolved = async (message: ContactMessage, resolved: boolean) => {
    const res = await postWithAuth('/api/admin/messages', { id: message.id, resolved });
    if (res.ok) {
      setMessages((current) => current.map((m) => (m.id === message.id ? { ...m, resolved } : m)));
    } else {
      setErrorMsg('Could not update that message.');
    }
  };

  const removeReview = async (review: AdminReview) => {
    if (
      !confirm(
        `Remove this ${review.rating}-star review of ${review.farm_name}? It disappears from the farm's page and star rating, and its text is erased for good. This cannot be undone.`
      )
    ) {
      return;
    }

    setSuccessMsg(null);
    setErrorMsg(null);
    const res = await postWithAuth('/api/admin/reviews', { id: review.id });
    if (res.ok) {
      setReviews((current) => current.map((r) => (r.id === review.id ? { ...r, removed: true, comment: null } : r)));
      setSuccessMsg('Review removed.');
    } else {
      setErrorMsg('Could not remove that review.');
    }
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

  const openOrders = orders.filter(isOpen);
  const staleOrders = openOrders.filter((o) => daysOpen(o) > STALE_AFTER_DAYS);
  // Open orders a farmer has reported as a no-show, waiting for a decision.
  const reportedNoShows = openOrders.filter((o) => o.no_show_reported_at);
  // Everything that may need a decision from the admin: no-show reports and
  // orders that have sat open too long.
  const attentionOrders = openOrders.filter((o) => o.no_show_reported_at || daysOpen(o) > STALE_AFTER_DAYS);

  const isOrderSection = section === 'attention' || section === 'open' || section === 'all';
  const visibleOrders = section === 'attention' ? attentionOrders : section === 'open' ? openOrders : orders;

  const summaryMonths = recentMonths();

  // One row per order placed in the selected month, for bookkeeping.
  const downloadOrdersReport = async () => {
    setDownloadingReport(true);
    setErrorMsg(null);
    try {
      const res = await postWithAuth('/api/admin/report', { month: summaryMonth });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not build the report.');
      if (data.rows.length === 0) {
        setErrorMsg(`No orders were placed in ${formatMonth(summaryMonth)}.`);
        return;
      }
      downloadCsv(`farm-fresh-direct-orders-${summaryMonth}.csv`, data.rows);
    } catch (err: any) {
      setErrorMsg(err.message || 'Could not build the report.');
    } finally {
      setDownloadingReport(false);
    }
  };
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

  // Where the money from finished orders went, farm by farm, for the chosen
  // month or for all months together. Stripe's share is the estimate the
  // summary already makes (card fees plus the monthly charge per active farmer).
  const feeByFarm = new Map<
    string,
    { farmer_id: string; farm_name: string; orders: number; produce_sales: number; to_farmer: number; to_stripe: number; to_platform: number }
  >();
  for (const r of feeMonth === 'all' ? summaryRows : summaryRows.filter((row) => row.month === feeMonth)) {
    const farm = feeByFarm.get(r.farmer_id) || {
      farmer_id: r.farmer_id,
      farm_name: r.farm_name,
      orders: 0,
      produce_sales: 0,
      to_farmer: 0,
      to_stripe: 0,
      to_platform: 0,
    };
    farm.orders += r.orders;
    farm.produce_sales += r.produce_sales;
    farm.to_farmer += r.farmer_paid;
    farm.to_stripe += r.platform_fees - r.estimated_net;
    farm.to_platform += r.estimated_net;
    feeByFarm.set(r.farmer_id, farm);
  }
  const feeRows = [...feeByFarm.values()].sort((a, b) => b.to_farmer - a.to_farmer);
  const feeTotals = feeRows.reduce(
    (acc, r) => ({
      to_farmer: acc.to_farmer + r.to_farmer,
      to_stripe: acc.to_stripe + r.to_stripe,
      to_platform: acc.to_platform + r.to_platform,
    }),
    { to_farmer: 0, to_stripe: 0, to_platform: 0 }
  );
  const feeGrandTotal = feeTotals.to_farmer + feeTotals.to_stripe + feeTotals.to_platform;
  const shareOf = (amount: number) => (feeGrandTotal > 0 ? `${Math.round((amount / feeGrandTotal) * 100)}%` : '—');
  const shownFeeRows = feeRows.filter((r) => r.farm_name.toLowerCase().includes(farmSearch.trim().toLowerCase()));
  const feePeriodLabel = feeMonth === 'all' ? 'all months' : formatMonth(feeMonth);

  const openMessages = messages.filter((m) => !m.resolved);
  const visibleMessages = showResolvedMessages ? messages : openMessages;

  const navItems: { id: AdminSection; label: string; icon: typeof Mail; count?: number; urgent?: boolean }[] = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'attention', label: 'Needs attention', icon: AlertCircle, count: attentionOrders.length, urgent: true },
    { id: 'open', label: 'Open orders', icon: ClipboardList, count: openOrders.length },
    { id: 'all', label: 'All orders', icon: Archive },
    { id: 'messages', label: 'Messages', icon: Mail, count: openMessages.length, urgent: true },
    { id: 'reviews', label: 'Reviews', icon: Star },
    { id: 'fees', label: 'Fee breakdown', icon: PieChart },
    { id: 'reports', label: 'Reports', icon: TrendingUp },
  ];

  const disputedNoShows = reportedNoShows.filter((o) => o.no_show_disputed_at).length;
  const overviewCards: { section: AdminSection; label: string; value: string; detail: string; urgent: boolean }[] = [
    {
      section: 'attention',
      label: 'Needs attention',
      value: String(attentionOrders.length),
      detail:
        attentionOrders.length === 0
          ? 'Nothing is waiting on you right now.'
          : `${reportedNoShows.length} no-show report${reportedNoShows.length === 1 ? '' : 's'} (${disputedNoShows} waiting on your decision) · ${staleOrders.length} open more than ${STALE_AFTER_DAYS} days`,
      urgent: attentionOrders.length > 0,
    },
    {
      section: 'open',
      label: 'Open orders',
      value: String(openOrders.length),
      detail: 'Paid for and waiting to be picked up.',
      urgent: false,
    },
    {
      section: 'messages',
      label: 'Open messages',
      value: String(openMessages.length),
      detail: 'Sent through the Contact Us page and not yet marked resolved.',
      urgent: openMessages.length > 0,
    },
    {
      section: 'fees',
      label: summaryMonth ? `Produce sold in ${formatMonth(summaryMonth)}` : 'Produce sold',
      value: `$${monthTotals.produce_sales.toFixed(2)}`,
      detail: `Estimated platform net $${monthTotals.estimated_net.toFixed(2)}. See where the money went.`,
      urgent: false,
    },
  ];

  const orderSectionTitle =
    section === 'attention' ? 'Needs Attention' : section === 'open' ? 'Open Orders' : 'All Orders';
  const orderSectionHint =
    section === 'attention'
      ? `No-show reports, and orders open more than ${STALE_AFTER_DAYS} days.`
      : section === 'open'
        ? 'Paid orders waiting for pickup.'
        : 'The 200 most recent orders across all farmers.';

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-emerald-600" /> Admin
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Orders, messages and reports for the whole marketplace. Overrides here move real money.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchOrders}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white border text-gray-600 hover:bg-gray-50"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>
      </div>

      {successMsg && (
        <div role="status" className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl flex items-center gap-2 text-sm">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div role="alert" className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-center gap-2 text-sm">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <div className="lg:flex lg:items-start lg:gap-6">
        <nav
          aria-label="Admin sections"
          className="flex lg:flex-col gap-2 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0 mb-4 lg:mb-0 lg:w-56 lg:shrink-0 lg:sticky lg:top-6"
        >
          {navItems.map(({ id, label, icon: Icon, count, urgent }) => {
            const active = section === id;
            return (
              <button
                key={id}
                onClick={() => setSection(id)}
                aria-current={active ? 'page' : undefined}
                className={`shrink-0 flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-sm font-semibold text-left transition-colors ${
                  active ? 'bg-emerald-600 text-white' : 'bg-white border text-gray-700 hover:bg-gray-50'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span className="lg:flex-1 whitespace-nowrap">{label}</span>
                {count !== undefined && count > 0 && (
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      active
                        ? 'bg-white text-emerald-800'
                        : urgent
                          ? 'bg-red-100 text-red-800'
                          : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="flex-1 min-w-0 space-y-6">
          {section === 'overview' && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-gray-900">Overview</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {overviewCards.map((card) => (
                  <button
                    key={card.section}
                    onClick={() => setSection(card.section)}
                    className={`p-5 rounded-2xl border shadow-sm text-left transition-colors ${
                      card.urgent
                        ? 'bg-amber-50 border-amber-300 hover:bg-amber-100'
                        : 'bg-white border-gray-200 hover:border-emerald-400'
                    }`}
                  >
                    <p className="text-sm font-semibold text-gray-700">{card.label}</p>
                    <p className="text-3xl font-black text-gray-900 mt-1">{card.value}</p>
                    <p className="text-xs text-gray-600 mt-1">{card.detail}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* CONTACT MESSAGES */}
          {section === 'messages' && (
            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">
                    Contact Messages{openMessages.length > 0 ? ` (${openMessages.length} open)` : ''}
                  </h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Sent through the Contact Us page. Each one is also emailed to you; replying to that email
                    answers the sender.
                  </p>
                </div>
                {messages.length > openMessages.length && (
                  <button
                    onClick={() => setShowResolvedMessages((current) => !current)}
                    className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-white border text-gray-600 hover:bg-gray-50"
                  >
                    {showResolvedMessages ? 'Hide resolved' : 'Show resolved'}
                  </button>
                )}
              </div>

              {visibleMessages.length === 0 ? (
                <p className="text-sm text-gray-500 py-2 text-center">No open messages.</p>
              ) : (
                <div className="space-y-3">
                  {visibleMessages.map((m) => (
                    <div
                      key={m.id}
                      className={`p-4 border rounded-xl text-sm ${m.resolved ? 'bg-gray-50 border-gray-200' : 'border-amber-200 bg-amber-50/40'}`}
                    >
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                          <p className="font-bold text-gray-900 break-words">{m.subject}</p>
                          <p className="text-xs text-gray-500">
                            From{' '}
                            <a
                              href={`mailto:${m.email}?subject=${encodeURIComponent(`Re: ${m.subject}`)}`}
                              className="font-semibold text-emerald-700 underline break-all"
                            >
                              {m.email}
                            </a>
                            {m.user_id ? ' (signed-in user)' : ''} · {new Date(m.created_at).toLocaleString()}
                          </p>
                        </div>
                        <button
                          onClick={() => setMessageResolved(m, !m.resolved)}
                          className="shrink-0 px-3 py-2 rounded-xl text-xs font-bold bg-white border text-gray-600 hover:bg-gray-50"
                        >
                          {m.resolved ? 'Reopen' : 'Mark Resolved'}
                        </button>
                      </div>
                      <p className="mt-2 text-gray-700 whitespace-pre-wrap break-words">{m.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* REVIEWS */}
          {section === 'reviews' && (
            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5 space-y-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Reviews</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  The 200 most recent reviews buyers have left. Remove one only if it is abusive, off-topic or
                  shares private details — not because it is negative.
                </p>
              </div>

              {reviews.length === 0 ? (
                <p className="text-sm text-gray-500 py-2 text-center">No reviews yet.</p>
              ) : (
                <div className="space-y-3">
                  {reviews.map((review) => (
                    <div
                      key={review.id}
                      className={`p-4 border rounded-xl text-sm ${review.removed ? 'bg-gray-50 border-gray-200' : 'border-gray-200'}`}
                    >
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                          <p className="font-bold text-gray-900">
                            {review.rating} of 5 stars ·{' '}
                            <a
                              href={`/sellers/${review.seller_id}`}
                              target="_blank"
                              className="text-emerald-700 underline break-words"
                            >
                              {review.farm_name}
                            </a>
                          </p>
                          <p className="text-xs text-gray-500">
                            {new Date(review.created_at).toLocaleString()}
                            {review.order_id ? ` · Order #${review.order_id.slice(0, 8)}` : ''}
                          </p>
                        </div>
                        {review.removed ? (
                          <span className="shrink-0 text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase bg-gray-200 text-gray-700">
                            Removed
                          </span>
                        ) : (
                          <button
                            onClick={() => removeReview(review)}
                            className="shrink-0 px-3 py-2 rounded-xl text-xs font-bold bg-white border border-red-200 text-red-600 hover:bg-red-50"
                          >
                            Remove Review
                          </button>
                        )}
                      </div>
                      {!review.removed && (
                        <p className="mt-2 text-gray-700 whitespace-pre-wrap break-words">
                          {review.comment || <span className="text-gray-500">No written comment.</span>}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* FEE BREAKDOWN */}
          {section === 'fees' && (
            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Fee Breakdown</h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Where the money from picked-up orders and no-shows went. Refunds and sales tax are left out.
                  </p>
                </div>
                <select
                  aria-label="Month"
                  value={feeMonth}
                  onChange={(e) => setFeeMonth(e.target.value)}
                  className="px-3 py-2 border rounded-xl text-xs font-semibold bg-white"
                >
                  <option value="all">All months</option>
                  {summaryMonths.map((m) => (
                    <option key={m} value={m}>
                      {formatMonth(m)}
                    </option>
                  ))}
                </select>
              </div>

              {feeRows.length === 0 ? (
                <p className="text-sm text-gray-500 py-4 text-center">No completed sales in {feePeriodLabel}.</p>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="p-4 bg-gray-50 rounded-xl">
                      <p className="text-xs font-semibold text-gray-600">Paid to farmers</p>
                      <p className="text-2xl font-black text-gray-900">${feeTotals.to_farmer.toFixed(2)}</p>
                      <p className="text-xs text-gray-600">{shareOf(feeTotals.to_farmer)} of what buyers paid</p>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-xl">
                      <p className="text-xs font-semibold text-gray-600">Stripe fees (estimated)</p>
                      <p className="text-2xl font-black text-gray-900">${feeTotals.to_stripe.toFixed(2)}</p>
                      <p className="text-xs text-gray-600">{shareOf(feeTotals.to_stripe)} of what buyers paid</p>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-xl">
                      <p className="text-xs font-semibold text-gray-600">Kept by the platform (estimated)</p>
                      <p className={`text-2xl font-black ${feeTotals.to_platform < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                        ${feeTotals.to_platform.toFixed(2)}
                      </p>
                      <p className="text-xs text-gray-600">{shareOf(feeTotals.to_platform)} of what buyers paid</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="relative flex-1 min-w-48 max-w-sm">
                      <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                      <input
                        type="search"
                        aria-label="Search farms"
                        placeholder="Search farms..."
                        value={farmSearch}
                        onChange={(e) => setFarmSearch(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 border rounded-xl text-sm"
                      />
                    </div>
                    <button
                      onClick={() =>
                        downloadCsv(
                          `farm-fresh-direct-fee-breakdown-${feeMonth}.csv`,
                          shownFeeRows.map(({ farmer_id, ...row }) => ({
                            farm: row.farm_name,
                            orders: row.orders,
                            produce_sold: row.produce_sales.toFixed(2),
                            paid_to_farmer: row.to_farmer.toFixed(2),
                            stripe_fees_estimated: row.to_stripe.toFixed(2),
                            kept_by_platform_estimated: row.to_platform.toFixed(2),
                          }))
                        )
                      }
                      disabled={shownFeeRows.length === 0}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white border text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      <Download className="w-3.5 h-3.5" aria-hidden="true" />
                      Download (CSV)
                    </button>
                  </div>

                  {shownFeeRows.length === 0 ? (
                    <p className="text-sm text-gray-500 py-4 text-center">No farm matches "{farmSearch}".</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <caption className="sr-only">Fee breakdown by farm for {feePeriodLabel}</caption>
                        <thead className="text-gray-500 border-b">
                          <tr>
                            <th scope="col" className="py-2 pr-4 font-semibold">Farm</th>
                            <th scope="col" className="py-2 pr-4 font-semibold text-right">Orders</th>
                            <th scope="col" className="py-2 pr-4 font-semibold text-right">Produce sold</th>
                            <th scope="col" className="py-2 pr-4 font-semibold text-right">Paid to farmer</th>
                            <th scope="col" className="py-2 pr-4 font-semibold text-right">Stripe (est.)</th>
                            <th scope="col" className="py-2 font-semibold text-right">Platform (est.)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {shownFeeRows.map((r) => (
                            <tr key={r.farmer_id}>
                              <th scope="row" className="py-2 pr-4 font-semibold text-gray-900">
                                <a href={`/sellers/${r.farmer_id}`} target="_blank" className="hover:underline">
                                  {r.farm_name}
                                </a>
                              </th>
                              <td className="py-2 pr-4 text-right">{r.orders}</td>
                              <td className="py-2 pr-4 text-right">${r.produce_sales.toFixed(2)}</td>
                              <td className="py-2 pr-4 text-right">${r.to_farmer.toFixed(2)}</td>
                              <td className="py-2 pr-4 text-right">${r.to_stripe.toFixed(2)}</td>
                              <td className={`py-2 text-right font-bold ${r.to_platform < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                                ${r.to_platform.toFixed(2)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <p className="text-[11px] text-gray-400">
                    The three amounts add up to what buyers paid, before tax. Paid to farmers includes no-show
                    restocking fees. Stripe's share is an estimate, not read from your Stripe account: card fees
                    (2.9% + 30¢ per payment) plus Stripe's $2 monthly fee per active farmer. It leaves out
                    per-payout fees, 1099 fees and disputes, so the platform's real share is a little lower. A
                    red platform figure means that farm cost more in Stripe fees than it brought in.
                  </p>
                </>
              )}
            </div>
          )}

          {/* REPORTS */}
          {section === 'reports' && (
            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Reports</h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Spreadsheets for your records or your accountant, one month at a time.
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <select
                    aria-label="Month"
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
                  <button
                    onClick={downloadOrdersReport}
                    disabled={downloadingReport || !summaryMonth}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-400 text-white"
                  >
                    <Download className="w-3.5 h-3.5" aria-hidden="true" />
                    {downloadingReport ? 'Preparing...' : 'Orders report (CSV)'}
                  </button>
                  <button
                    onClick={() =>
                      downloadCsv(
                        `farm-fresh-direct-farmer-summary-${summaryMonth}.csv`,
                        monthRows.map(({ farmer_id, ...row }) => row)
                      )
                    }
                    disabled={monthRows.length === 0}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white border text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    <Download className="w-3.5 h-3.5" aria-hidden="true" />
                    Farmer summary (CSV)
                  </button>
                </div>
              </div>

              <p className="text-[11px] text-gray-400">
                The orders report lists every order placed in the month, one per row, with the buyer's payment,
                refunds, the farmer's payout, your fees and the pickup city and zip. Open it in Excel or Google
                Sheets, or send it to your accountant.
              </p>

            </div>
          )}

          {isOrderSection && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-bold text-gray-900">{orderSectionTitle}</h2>
                <p className="text-xs text-gray-500 mt-0.5">{orderSectionHint}</p>
              </div>

              {reportedNoShows.length > 0 && (
                <div className="p-4 bg-amber-50 border border-amber-300 rounded-xl text-sm text-amber-950 flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" aria-hidden="true" />
                  <span>
                    <strong>
                      {reportedNoShows.length} open no-show report{reportedNoShows.length === 1 ? '' : 's'}
                      {reportedNoShows.some((o) => o.no_show_disputed_at)
                        ? `, ${reportedNoShows.filter((o) => o.no_show_disputed_at).length} needing your decision`
                        : ''}
                      .
                    </strong>{' '}
                    Reports the buyer doesn't answer are closed automatically after 48 hours. Ones marked "Buyer
                    responded" wait for you: use No-Show to close the order and issue the refund, or Dismiss Report to
                    leave it open. If a buyer replies to you by email, click Hold for Review to stop the clock.
                  </span>
                </div>
              )}

              {staleOrders.length > 0 && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-800 flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-red-500 shrink-0" aria-hidden="true" />
                  <span>
                    <strong>
                      {staleOrders.length} order{staleOrders.length === 1 ? ' has' : 's have'} been open more than{' '}
                      {STALE_AFTER_DAYS} days.
                    </strong>{' '}
                    The buyer has paid and the money is still being held. Check with the farmer, then release the
                    payout, refund the order or close it as a no-show.
                  </span>
                </div>
              )}

              {visibleOrders.length === 0 ? (
                <div className="text-center py-16 bg-white rounded-xl border border-dashed border-gray-200 text-sm text-gray-500">
                  {section === 'attention' ? 'Nothing needs your attention.' : section === 'open' ? 'No open orders.' : 'No orders.'}
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
                            {isOpen(order) && daysOpen(order) > STALE_AFTER_DAYS && (
                              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase bg-red-100 text-red-800">
                                Open {daysOpen(order)} days
                              </span>
                            )}
                            {isOpen(order) && order.no_show_reported_at && (
                              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase bg-amber-200 text-amber-950">
                                No-show reported {new Date(order.no_show_reported_at).toLocaleDateString()}
                              </span>
                            )}
                            {isOpen(order) && order.no_show_reported_at && order.no_show_disputed_at && (
                              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase bg-red-100 text-red-800">
                                Buyer responded — needs your decision
                              </span>
                            )}
                            {isOpen(order) && order.no_show_auto_approve_at && (
                              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-700">
                                Closes automatically after {new Date(order.no_show_auto_approve_at).toLocaleString()}
                              </span>
                            )}
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
                          {isOpen(order) && order.no_show_reported_at && !order.no_show_disputed_at && (
                            <button
                              disabled={busy}
                              onClick={() =>
                                runAction(
                                  order,
                                  'hold_no_show',
                                  'Put this report on hold? It will not be closed automatically and will wait for your decision.'
                                )
                              }
                              className="bg-white border text-gray-600 hover:bg-gray-50 disabled:opacity-50 text-xs font-bold px-3.5 py-2 rounded-xl transition-colors"
                            >
                              Hold for Review
                            </button>
                          )}
                          {isOpen(order) && order.no_show_reported_at && (
                            <button
                              disabled={busy}
                              onClick={() =>
                                runAction(
                                  order,
                                  'dismiss_no_show',
                                  "Dismiss the farmer's no-show report? The order stays open and no money moves."
                                )
                              }
                              className="bg-white border text-gray-600 hover:bg-gray-50 disabled:opacity-50 text-xs font-bold px-3.5 py-2 rounded-xl transition-colors"
                            >
                              Dismiss Report
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
          )}
        </div>
      </div>
    </div>
  );
}
