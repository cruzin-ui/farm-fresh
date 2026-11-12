'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Printer, ArrowLeft } from 'lucide-react';
import { postWithAuth } from '@/lib/authedFetch';

type Invoice = {
  number: string;
  ref: string;
  operator: string;
  farm: { name: string; place: string; address: string | null };
  buyer: { name: string | null; email: string | null };
  orderedDay: string;
  pickedUpDay: string | null;
  status: string;
  pickup: string | null;
  taxExempt: boolean;
  wholesale: boolean;
  lines: { item: string; quantity: number; unit: string; cases: string | null; unitPriceCents: number; amountCents: number; status: string }[];
  subtotalCents: number;
  serviceFeeCents: number;
  taxCents: number;
  chargedCents: number;
  refundedCents: number;
  viewer: 'seller' | 'buyer' | 'admin';
};

const money = (c: number) => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const longDay = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

// A printable invoice for one farm's part of an order, for the farm's records
// or the buyer's (a business buying wholesale, say). Print it, or save it as
// a PDF from the print window.
export default function InvoicePage() {
  const { orderId } = useParams<{ orderId: string }>();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    postWithAuth('/api/invoice', { orderId })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Could not load the invoice.');
        setInvoice(json.invoice);
      })
      .catch((err) => setError(err.message));
  }, [orderId]);

  if (error) {
    return (
      <div className="max-w-md mx-auto my-12 p-6 bg-white border rounded-2xl text-center space-y-3">
        <p className="text-sm text-gray-700">{error}</p>
        <Link href="/login" className="text-sm font-semibold text-emerald-800 underline">
          Sign in
        </Link>
      </div>
    );
  }
  if (!invoice) return <p className="max-w-3xl mx-auto my-12 text-sm text-gray-500 text-center">Loading invoice…</p>;

  const back = invoice.viewer === 'seller' ? '/dashboard?tab=sales' : '/orders';
  const net = invoice.chargedCents - invoice.refundedCents;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between gap-3 mb-4 print:hidden">
        <Link href={back} className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-800">
          <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Back
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold px-4 py-2.5 rounded-xl"
        >
          <Printer className="w-4 h-4" aria-hidden="true" /> Print or save as PDF
        </button>
      </div>

      <article className="print-area invoice bg-white border border-gray-200 rounded-2xl p-6 sm:p-10 text-sm text-gray-800">
        <header className="flex flex-wrap items-start justify-between gap-4 pb-5 border-b-2 border-emerald-700">
          <div>
            <h1 className="text-2xl font-bold text-emerald-900">{invoice.farm.name}</h1>
            {invoice.farm.place && <p className="text-gray-600">{invoice.farm.place}</p>}
            {invoice.farm.address && <p className="text-gray-600">{invoice.farm.address}</p>}
            <p className="text-xs text-gray-500 mt-1">Sold through Farm Fresh Direct</p>
          </div>
          <div className="text-right">
            <p className="text-xl font-bold text-gray-900 uppercase tracking-wide">Invoice</p>
            <p className="text-gray-700">
              No. <span className="font-mono font-bold">{invoice.number}</span>
            </p>
            <p className="text-gray-600">Order {invoice.ref}</p>
            <p className="text-gray-600">Date: {longDay(invoice.orderedDay)}</p>
          </div>
        </header>

        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 py-5 border-b border-gray-200">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Bill to</p>
            <p className="font-semibold text-gray-900">{invoice.buyer.name || 'Customer'}</p>
            {invoice.buyer.email && <p className="text-gray-600 break-all">{invoice.buyer.email}</p>}
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Pickup</p>
            <p className="text-gray-700">{invoice.pickup || `At the farm${invoice.farm.place ? `, ${invoice.farm.place}` : ''}`}</p>
            {invoice.pickedUpDay && <p className="text-gray-600">Picked up {longDay(invoice.pickedUpDay)}</p>}
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Status</p>
            <p className="font-semibold text-emerald-800">{invoice.status}</p>
            <p className="text-gray-600">Paid by card, {longDay(invoice.orderedDay)}</p>
          </div>
        </section>

        <table className="w-full mt-5">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
              <th className="text-left font-bold py-2">Item</th>
              <th className="text-right font-bold py-2">Qty</th>
              <th className="text-right font-bold py-2">Price</th>
              <th className="text-right font-bold py-2">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((line, i) => (
              <tr key={i} className="border-b border-gray-100 align-top">
                <td className="py-2.5 pr-2">
                  <span className="font-semibold text-gray-900">{line.item}</span>
                  {line.cases && <span className="block text-xs text-gray-500">Wholesale: {line.cases}</span>}
                  {line.status !== 'Picked up' && <span className="block text-xs text-gray-500">{line.status}</span>}
                </td>
                <td className="py-2.5 text-right tabular-nums whitespace-nowrap">
                  {line.quantity} {line.unit}
                </td>
                <td className="py-2.5 text-right tabular-nums whitespace-nowrap">
                  {money(line.unitPriceCents)}
                  {line.unit ? ` / ${line.unit.replace(/s$/, '')}` : ''}
                </td>
                <td className="py-2.5 text-right tabular-nums font-semibold">{money(line.amountCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl className="mt-4 ml-auto w-full sm:w-72 space-y-1.5 tabular-nums">
          <div className="flex justify-between">
            <dt className="text-gray-600">Subtotal</dt>
            <dd className="font-semibold">{money(invoice.subtotalCents)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-600">Service fee (Farm Fresh Direct)</dt>
            <dd>{money(invoice.serviceFeeCents)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-600">{invoice.taxExempt ? 'Sales tax (resale, exempt)' : 'Sales tax'}</dt>
            <dd>{money(invoice.taxCents)}</dd>
          </div>
          <div className="flex justify-between border-t border-gray-300 pt-1.5">
            <dt className="font-bold text-gray-900">Total charged</dt>
            <dd className="font-bold text-gray-900">{money(invoice.chargedCents)}</dd>
          </div>
          {invoice.refundedCents > 0 && (
            <>
              <div className="flex justify-between">
                <dt className="text-gray-600">Refunded</dt>
                <dd>−{money(invoice.refundedCents)}</dd>
              </div>
              <div className="flex justify-between border-t border-gray-300 pt-1.5">
                <dt className="font-bold text-gray-900">Total paid</dt>
                <dd className="font-bold text-emerald-800">{money(net)}</dd>
              </div>
            </>
          )}
        </dl>

        <footer className="mt-8 pt-4 border-t border-gray-200 text-xs text-gray-500 space-y-1">
          <p>
            Payment was collected online by {invoice.operator} (Farm Fresh Direct) for {invoice.farm.name}. Sales tax, where it
            applies, is collected and paid to the state by Farm Fresh Direct.
          </p>
          <p>Questions about this order? farmfreshdirect.online/contact</p>
        </footer>
      </article>
    </div>
  );
}
