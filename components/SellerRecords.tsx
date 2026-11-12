'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Download, Printer, ExternalLink, Landmark, FileText, ChevronDown } from 'lucide-react';
import { postWithAuth } from '@/lib/authedFetch';
import type { LedgerLine } from '@/lib/sellerLedger';
import { addUp, buildLedgerCsv, downloadCsv, linesBetween, monthlyTotals, type Totals } from '@/lib/salesCsv';

// "Your records" in Sales & Payouts: every closed order with its fees, payout
// and sales tax, for any period; month and quarter totals; a printable
// statement and spreadsheet; the bank deposits Stripe made and the orders in
// each; and a way into the farm's own Stripe dashboard.

const money = (c: number) =>
  `${c < 0 ? '−' : ''}$${(Math.abs(c) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const shortDay = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

// Today in Arizona, "2026-11-12".
const todayAz = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Phoenix', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

const iso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);

type Preset = 'this-month' | 'last-month' | 'this-quarter' | 'last-quarter' | 'this-year' | 'last-year' | 'all' | 'custom';

const PRESETS: { value: Preset; label: string }[] = [
  { value: 'this-month', label: 'This month' },
  { value: 'last-month', label: 'Last month' },
  { value: 'this-quarter', label: 'This quarter' },
  { value: 'last-quarter', label: 'Last quarter' },
  { value: 'this-year', label: 'This year' },
  { value: 'last-year', label: 'Last year' },
  { value: 'all', label: 'All time' },
  { value: 'custom', label: 'Choose dates…' },
];

// The first and last day of a preset period.
function presetRange(preset: Preset): { from: string; to: string } {
  const [y, m] = todayAz().split('-').map(Number);
  const month = m - 1;
  const q = Math.floor(month / 3);
  switch (preset) {
    case 'this-month':
      return { from: iso(y, month, 1), to: iso(y, month + 1, 0) };
    case 'last-month':
      return { from: iso(y, month - 1, 1), to: iso(y, month, 0) };
    case 'this-quarter':
      return { from: iso(y, q * 3, 1), to: iso(y, q * 3 + 3, 0) };
    case 'last-quarter':
      return { from: iso(y, q * 3 - 3, 1), to: iso(y, q * 3, 0) };
    case 'this-year':
      return { from: iso(y, 0, 1), to: iso(y, 11, 31) };
    case 'last-year':
      return { from: iso(y - 1, 0, 1), to: iso(y - 1, 11, 31) };
    default:
      return { from: '', to: '' };
  }
}

type Deposit = { id: string; amountCents: number; arrivalDay: string; status: string };
type DepositItem = { id: string; day: string; amountCents: number; ref: string | null; orderId: string | null; description: string };

export default function SellerRecords({ farmName, payoutsConnected }: { farmName: string; payoutsConnected: boolean }) {
  const [lines, setLines] = useState<LedgerLine[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [preset, setPreset] = useState<Preset>('this-year');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [tableYear, setTableYear] = useState(() => Number(todayAz().slice(0, 4)));
  const [stripeBusy, setStripeBusy] = useState(false);
  const [stripeError, setStripeError] = useState<string | null>(null);

  useEffect(() => {
    postWithAuth('/api/seller/records')
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Could not load your records.');
        setLines(json.lines);
      })
      .catch((err) => setLoadError(err.message));
  }, []);

  const range = preset === 'custom' ? { from: customFrom, to: customTo } : presetRange(preset);
  const periodLabel =
    preset === 'all'
      ? 'All time'
      : range.from && range.to
        ? `${shortDay(range.from)} – ${shortDay(range.to)}`
        : range.from
          ? `From ${shortDay(range.from)}`
          : range.to
            ? `Until ${shortDay(range.to)}`
            : 'All time';

  const inPeriod = useMemo(() => (lines ? linesBetween(lines, range.from, range.to) : []), [lines, range.from, range.to]);
  const totals = useMemo(() => addUp(inPeriod), [inPeriod]);
  const years = useMemo(() => {
    const set = new Set((lines || []).map((l) => Number(l.day.slice(0, 4))));
    set.add(Number(todayAz().slice(0, 4)));
    return [...set].sort((a, b) => b - a);
  }, [lines]);
  const monthly = useMemo(() => (lines ? monthlyTotals(lines, tableYear) : []), [lines, tableYear]);
  const hasPacking = (lines || []).some((l) => l.packingCents !== 0);

  // A whole calendar year also gets its month and quarter totals in the file.
  const wholeYear =
    range.from.endsWith('-01-01') && range.to.endsWith('-12-31') && range.from.slice(0, 4) === range.to.slice(0, 4)
      ? Number(range.from.slice(0, 4))
      : null;

  const download = () =>
    downloadCsv(
      `farm-fresh-direct-records-${range.from || 'start'}-to-${range.to || 'now'}.csv`,
      buildLedgerCsv(inPeriod, periodLabel, wholeYear)
    );

  const openStripe = async () => {
    setStripeBusy(true);
    setStripeError(null);
    // Opened before the request, so the browser doesn't block it as a pop-up.
    const tab = window.open('', '_blank');
    try {
      const res = await postWithAuth('/api/connect/dashboard-link');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not open Stripe.');
      if (tab) tab.location.href = json.url;
      else window.location.href = json.url;
    } catch (err: any) {
      tab?.close();
      setStripeError(err.message);
    } finally {
      setStripeBusy(false);
    }
  };

  return (
    <section className="space-y-5">
      <div className="pt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Your records</h2>
          <p className="text-xs text-gray-500 max-w-xl">
            Every order that has been picked up or cancelled, with our fees, what you were paid and the sales tax we
            collected. Print a statement or download a spreadsheet for any period.
          </p>
        </div>
        {payoutsConnected && (
          <button
            type="button"
            onClick={openStripe}
            disabled={stripeBusy}
            className="inline-flex items-center gap-2 bg-white border border-gray-300 hover:border-emerald-500 text-gray-800 text-xs font-bold px-3.5 py-2.5 rounded-xl disabled:opacity-60"
          >
            <ExternalLink className="w-4 h-4" aria-hidden="true" />
            {stripeBusy ? 'Opening Stripe…' : 'Bank deposits & tax forms on Stripe'}
          </button>
        )}
      </div>
      {stripeError && <p className="text-xs font-semibold text-red-700">{stripeError}</p>}

      {loadError && <p className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">{loadError}</p>}
      {!lines && !loadError && <p className="text-sm text-gray-500">Loading your records…</p>}

      {lines && (
        <>
          {/* The period */}
          <div className="p-4 border border-gray-200 rounded-xl space-y-4 bg-white">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label htmlFor="rec-period" className="block text-xs font-semibold text-gray-700 mb-1">
                  Period
                </label>
                <select
                  id="rec-period"
                  value={preset}
                  onChange={(e) => {
                    const next = e.target.value as Preset;
                    if (next === 'custom' && !customFrom && !customTo) {
                      const r = presetRange(preset);
                      setCustomFrom(r.from);
                      setCustomTo(r.to);
                    }
                    setPreset(next);
                  }}
                  className="px-3 py-2 border rounded-lg text-sm bg-white"
                >
                  {PRESETS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
              {preset === 'custom' && (
                <>
                  <div>
                    <label htmlFor="rec-from" className="block text-xs font-semibold text-gray-700 mb-1">
                      From
                    </label>
                    <input id="rec-from" type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="px-3 py-2 border rounded-lg text-sm bg-white" />
                  </div>
                  <div>
                    <label htmlFor="rec-to" className="block text-xs font-semibold text-gray-700 mb-1">
                      To
                    </label>
                    <input id="rec-to" type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="px-3 py-2 border rounded-lg text-sm bg-white" />
                  </div>
                </>
              )}
              <div className="flex flex-wrap gap-2 ml-auto">
                <button
                  type="button"
                  onClick={() => window.print()}
                  disabled={totals.count === 0}
                  className="inline-flex items-center gap-2 bg-white border border-emerald-300 text-emerald-900 hover:bg-emerald-50 disabled:opacity-50 text-xs font-bold px-3.5 py-2.5 rounded-xl"
                >
                  <Printer className="w-4 h-4" aria-hidden="true" /> Print statement
                </button>
                <button
                  type="button"
                  onClick={download}
                  disabled={totals.count === 0}
                  className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white text-xs font-bold px-3.5 py-2.5 rounded-xl"
                >
                  <Download className="w-4 h-4" aria-hidden="true" /> Download spreadsheet
                </button>
              </div>
            </div>

            <TotalsGrid totals={totals} showPacking={hasPacking} />
            <p className="text-xs text-gray-500">
              {periodLabel}. An order counts on the day it was picked up, or closed if it never was (Arizona time).
              Sales tax is what Farm Fresh Direct collected from the buyer and pays to the state; it isn&apos;t taken from
              your payout. Talk to a tax professional about what you need to report.
            </p>
          </div>

          {/* Month and quarter totals */}
          <details className="border border-gray-200 rounded-xl bg-white group">
            <summary className="cursor-pointer select-none px-4 py-3 text-sm font-bold text-gray-900 flex items-center justify-between">
              Monthly and quarterly totals
              <ChevronDown className="w-4 h-4 text-gray-500 group-open:rotate-180 transition-transform" aria-hidden="true" />
            </summary>
            <div className="px-4 pb-4 space-y-3">
              <div>
                <label htmlFor="rec-year" className="text-xs font-semibold text-gray-700 mr-2">
                  Year
                </label>
                <select id="rec-year" value={tableYear} onChange={(e) => setTableYear(Number(e.target.value))} className="px-3 py-1.5 border rounded-lg text-sm bg-white">
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
              <MonthlyTable rows={monthly} />
            </div>
          </details>

          {payoutsConnected && <Deposits />}

          {/* The orders in the period */}
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-gray-900">
              Orders in this period <span className="font-normal text-gray-500">({inPeriod.length})</span>
            </h3>
            {inPeriod.length === 0 ? (
              <p className="p-6 text-center text-xs text-gray-500 border border-dashed border-gray-300 rounded-xl">
                {lines.length === 0
                  ? 'Orders will be logged here for your records once they are picked up or closed.'
                  : 'No orders closed in this period. Choose another one above.'}
              </p>
            ) : (
              <ul className="space-y-2">
                {inPeriod.map((l) => (
                  <li key={l.key} className="p-3.5 border border-gray-200 rounded-xl bg-white flex justify-between items-start gap-3">
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-sm font-bold text-gray-900">
                        {l.item}
                        <span className="ml-2 text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                          {l.saleType}
                        </span>
                      </p>
                      <p className="text-xs text-gray-600">
                        Order <span className="font-mono font-bold">{l.ref}</span> · {l.quantity} {l.unit}
                        {l.cases ? ` (${l.cases})` : ''} · {l.outcome} {shortDay(l.day)}
                      </p>
                      {(l.buyerName || l.buyerEmail) && (
                        <p className="text-xs text-gray-600 break-all">
                          Buyer: {[l.buyerName, l.buyerEmail].filter(Boolean).join(' · ')}
                        </p>
                      )}
                      <p className="text-xs text-gray-500">
                        Sold {money(l.salesCents)} · fee {money(l.feeCents)}
                        {l.packingCents !== 0 && ` · packing ${money(l.packingCents)}`}
                        {l.restockingCents > 0 && ` · restocking fee ${money(l.restockingCents)}`}
                        {l.taxCents > 0 && ` · sales tax collected ${money(l.taxCents)}`}
                        {l.taxExempt && ' · tax-exempt resale'}
                        {l.pickupCode && (
                          <>
                            {' · '}pickup code <span className="font-mono font-bold text-gray-700">{l.pickupCode}</span>
                          </>
                        )}
                      </p>
                      {l.invoice && (
                        <a
                          href={`/invoice/${l.orderId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-800 underline underline-offset-2"
                        >
                          <FileText className="w-3.5 h-3.5" aria-hidden="true" /> Invoice
                        </a>
                      )}
                    </div>
                    <span className="shrink-0 text-right">
                      <span className="block text-[10px] font-semibold text-gray-500">Paid to you</span>
                      <span className={`text-sm font-black ${l.paidCents > 0 ? 'text-emerald-800' : 'text-gray-400'}`}>{money(l.paidCents)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* What prints: a statement for the period. Hidden on screen. */}
          <div className="print-area hidden print:block text-[11px] text-black">
            <h1 className="text-xl font-bold">{farmName}: sales statement</h1>
            <p>
              {periodLabel} · printed {shortDay(todayAz())} · from Farm Fresh Direct
            </p>
            <div className="mt-3">
              <TotalsGrid totals={totals} showPacking={hasPacking} />
            </div>
            {wholeYear != null && (
              <div className="mt-4">
                <p className="font-bold mb-1">Monthly and quarterly totals, {wholeYear}</p>
                <MonthlyTable rows={monthlyTotals(lines, wholeYear)} />
              </div>
            )}
            <table className="w-full mt-4 border-collapse">
              <thead>
                <tr className="border-b border-black text-left">
                  <th className="py-1 pr-2">Date</th>
                  <th className="py-1 pr-2">Order</th>
                  <th className="py-1 pr-2">Type</th>
                  <th className="py-1 pr-2">Item</th>
                  <th className="py-1 pr-2">Outcome</th>
                  <th className="py-1 pr-2 text-right">Sold</th>
                  <th className="py-1 pr-2 text-right">Fees</th>
                  <th className="py-1 pr-2 text-right">Paid</th>
                  <th className="py-1 text-right">Tax</th>
                </tr>
              </thead>
              <tbody>
                {[...inPeriod].reverse().map((l) => (
                  <tr key={l.key} className="border-b border-gray-300">
                    <td className="py-0.5 pr-2 whitespace-nowrap">{l.day}</td>
                    <td className="py-0.5 pr-2 font-mono">{l.ref}</td>
                    <td className="py-0.5 pr-2">{l.saleType}</td>
                    <td className="py-0.5 pr-2">
                      {l.item} ({l.quantity} {l.unit})
                    </td>
                    <td className="py-0.5 pr-2">{l.outcome}</td>
                    <td className="py-0.5 pr-2 text-right">{money(l.salesCents)}</td>
                    <td className="py-0.5 pr-2 text-right">{money(l.feeCents - l.packingCents)}</td>
                    <td className="py-0.5 pr-2 text-right">{money(l.paidCents)}</td>
                    <td className="py-0.5 text-right">{money(l.taxCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3">
              Fees are Farm Fresh Direct&apos;s seller fee, less any shared Farm Box packing fees paid to you (or plus those
              you paid). Paid includes restocking fees. Tax is sales tax collected from buyers by Farm Fresh Direct, not
              taken from your payouts.
            </p>
          </div>
        </>
      )}
    </section>
  );
}

function TotalsGrid({ totals, showPacking }: { totals: Totals; showPacking: boolean }) {
  const items: [string, number, boolean?][] = [
    ['Produce sold', totals.sales],
    ['Farm Fresh Direct fees', totals.fee],
    ...(showPacking ? ([['Shared box packing fees', totals.packing]] as [string, number][]) : []),
    ['Restocking fees to you', totals.restocking],
    ['Paid to you', totals.paid, true],
    ['Sales tax collected by us', totals.tax],
  ];
  return (
    <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs text-gray-500">
      <div>
        <dt>Orders</dt>
        <dd className="text-base font-bold text-gray-900">{totals.count}</dd>
      </div>
      {items.map(([label, value, strong]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd className={`text-base font-bold ${strong ? 'text-emerald-800' : 'text-gray-900'}`}>{money(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function MonthlyTable({ rows }: { rows: ReturnType<typeof monthlyTotals> }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs text-gray-700 min-w-[30rem]">
        <thead>
          <tr className="text-gray-500 border-b border-gray-200">
            <th className="text-left font-semibold py-1.5">Period</th>
            <th className="text-right font-semibold py-1.5">Orders</th>
            <th className="text-right font-semibold py-1.5">Sold</th>
            <th className="text-right font-semibold py-1.5">Fees</th>
            <th className="text-right font-semibold py-1.5">Paid to you</th>
            <th className="text-right font-semibold py-1.5">Sales tax</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.label}
              className={`border-b border-gray-100 ${r.kind === 'quarter' ? 'bg-emerald-50/60 font-semibold' : ''} ${
                r.kind === 'year' ? 'font-bold text-gray-900 border-t-2 border-gray-300' : ''
              }`}
            >
              <td className="py-1.5">{r.label}</td>
              <td className="py-1.5 text-right tabular-nums">{r.totals.count}</td>
              <td className="py-1.5 text-right tabular-nums">{money(r.totals.sales)}</td>
              <td className="py-1.5 text-right tabular-nums">{money(r.totals.fee - r.totals.packing)}</td>
              <td className="py-1.5 text-right tabular-nums">{money(r.totals.paid)}</td>
              <td className="py-1.5 text-right tabular-nums">{money(r.totals.tax)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// The bank deposits Stripe has made, newest first; open one to see the
// orders it paid for.
function Deposits() {
  const [deposits, setDeposits] = useState<Deposit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [items, setItems] = useState<Record<string, DepositItem[] | 'loading' | 'error'>>({});

  const load = () => {
    setError(null);
    postWithAuth('/api/seller/deposits')
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Could not load your deposits.');
        setDeposits(json.deposits || []);
      })
      .catch((err) => setError(err.message));
  };

  const toggle = (id: string) => {
    setOpen((current) => (current === id ? null : id));
    if (items[id] && items[id] !== 'error') return;
    setItems((m) => ({ ...m, [id]: 'loading' }));
    postWithAuth('/api/seller/deposits', { payoutId: id })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error();
        setItems((m) => ({ ...m, [id]: json.items || [] }));
      })
      .catch(() => setItems((m) => ({ ...m, [id]: 'error' })));
  };

  const STATUS: Record<string, string> = { paid: 'In your bank', in_transit: 'On its way', pending: 'Pending', failed: 'Failed', canceled: 'Cancelled' };

  return (
    <div className="border border-gray-200 rounded-xl bg-white">
      <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-gray-900 flex items-center gap-2">
            <Landmark className="w-4 h-4 text-emerald-700" aria-hidden="true" /> Bank deposits
          </p>
          <p className="text-xs text-gray-500">Match each deposit in your bank account to the orders it paid for.</p>
        </div>
        {!deposits && (
          <button type="button" onClick={load} className="text-xs font-bold text-emerald-800 underline underline-offset-2">
            Show deposits
          </button>
        )}
      </div>
      {error && <p className="px-4 pb-3 text-xs font-semibold text-red-700">{error}</p>}
      {deposits && (
        <div className="px-4 pb-4">
          {deposits.length === 0 ? (
            <p className="text-xs text-gray-500">No deposits yet. Stripe sends your payments to your bank once a week, on Fridays.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {deposits.map((d) => {
                const detail = items[d.id];
                return (
                  <li key={d.id} className="py-2">
                    <button type="button" onClick={() => toggle(d.id)} className="w-full flex items-center justify-between gap-3 text-left" aria-expanded={open === d.id}>
                      <span className="text-sm text-gray-800">
                        <span className="font-semibold">{shortDay(d.arrivalDay)}</span>
                        <span className="ml-2 text-xs text-gray-500">{STATUS[d.status] || d.status}</span>
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="text-sm font-bold text-gray-900 tabular-nums">{money(d.amountCents)}</span>
                        <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${open === d.id ? 'rotate-180' : ''}`} aria-hidden="true" />
                      </span>
                    </button>
                    {open === d.id && (
                      <div className="mt-2 pl-3 border-l-2 border-emerald-200">
                        {detail === 'loading' || detail === undefined ? (
                          <p className="text-xs text-gray-500">Loading…</p>
                        ) : detail === 'error' ? (
                          <p className="text-xs text-red-700">Could not load this deposit. Try again.</p>
                        ) : detail.length === 0 ? (
                          <p className="text-xs text-gray-500">No orders found in this deposit.</p>
                        ) : (
                          <ul className="space-y-1">
                            {detail.map((it) => (
                              <li key={it.id} className="flex justify-between gap-3 text-xs text-gray-700">
                                <span>
                                  {shortDay(it.day)} · {it.ref && <span className="font-mono font-bold">{it.ref} </span>}
                                  {it.description}
                                  {it.orderId && (
                                    <a href={`/invoice/${it.orderId}`} target="_blank" rel="noopener noreferrer" className="ml-1.5 font-semibold text-emerald-800 underline">
                                      Invoice
                                    </a>
                                  )}
                                </span>
                                <span className="tabular-nums font-semibold shrink-0">{money(it.amountCents)}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
