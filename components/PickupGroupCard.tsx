'use client';

import { useState } from 'react';
import Link from 'next/link';
import { QRCodeSVG } from 'qrcode.react';
import { postWithAuth } from '@/lib/authedFetch';
import {
  calculateCancellationSplit,
  isWithinFreeCancellation,
  RESTOCKING_RATE,
  FREE_CANCELLATION_HOURS,
} from '@/lib/pricing';
import { MapPin, Store } from 'lucide-react';
import ReviewForm from '@/components/ReviewForm';
import OrderMessages from '@/components/OrderMessages';
import { describeItems, isOpenStatus, type BuyerOrder, type PickupGroup } from '@/lib/pickupGroups';
import { isSellerLate } from '@/lib/pickupRules';

// "Mon, Oct 12" in the reader's own time zone.
const shortDate = (date: string) =>
  new Date(date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  pending_pickup: { label: 'Being Prepared', className: 'bg-amber-100 text-amber-800' },
  ready_for_pickup: { label: 'Ready for Pickup', className: 'bg-blue-100 text-blue-800' },
  completed: { label: 'Picked Up', className: 'bg-emerald-100 text-emerald-800' },
  cancelled: { label: 'Cancelled', className: 'bg-gray-100 text-gray-600' },
};

// Lets the buyer cancel one item that hasn't been picked up yet. Before they
// confirm, it spells out what comes back: the produce price, less a restocking
// fee once the free-cancellation window has passed. The service fee is kept
// either way. The server works the amounts out again itself; this is only the
// preview.
function CancelItem({ item, token }: { item: BuyerOrder; token?: string | null }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Orders from before these amounts were recorded can't be previewed, so
  // they are cancelled through support instead.
  if (item.subtotal_amount <= 0) return null;

  // The farmer missed their deadline, so this cancellation costs the buyer nothing.
  const sellerLate = isSellerLate(item);
  const late = !isWithinFreeCancellation(item.created_at) || item.no_show_reported;
  const split = calculateCancellationSplit({
    subtotalCents: Math.round(item.subtotal_amount * 100),
    paidCents: Math.round(item.total_price * 100),
    taxCents: Math.round(item.tax_amount * 100),
    restockingRate: late ? RESTOCKING_RATE : 0,
  });
  const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  const cancel = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await postWithAuth('/api/orders/cancel', { orderId: item.id, ...(token ? { token } : {}) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not cancel this order.');
      // Reload so the code, statuses and totals all reflect the cancellation.
      window.location.reload();
    } catch (err: any) {
      setError(err.message || 'Could not cancel this order.');
      setBusy(false);
    }
  };

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-xs font-semibold text-red-600 hover:underline py-1 print:hidden"
      >
        Cancel this item
      </button>
    );
  }

  return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-950 space-y-2 print:hidden">
      <p className="font-bold text-sm">
        Cancel {item.quantity} {item.listing_unit_type} of {item.listing_title}?
      </p>
      {sellerLate ? (
        <p>
          The farmer didn't have this ready in time, so you'll be refunded in full:{' '}
          <strong>${item.total_price.toFixed(2)}</strong>, including the service fee.
        </p>
      ) : (
      <ul className="list-disc pl-5 space-y-1">
        <li>
          You'll be refunded <strong>{money(split.refundCents)}</strong> to your original payment method.
        </li>
        <li>
          The service fee for this item ({money(split.keptCents)}) is not refunded.
        </li>
        {split.restockingCents > 0 && (
          <li>
            A {RESTOCKING_RATE * 100}% restocking fee ({money(split.restockingCents)}) goes to the farmer, because{' '}
            {item.no_show_reported
              ? 'the farmer has reported this order as not collected'
              : `it has been more than ${FREE_CANCELLATION_HOURS} hours since you ordered`}
            .
          </li>
        )}
      </ul>
      )}
      {error && (
        <p role="alert" className="font-semibold text-red-700">
          {error}
        </p>
      )}
      <div className="flex gap-2 flex-wrap">
        <button
          type="button"
          onClick={cancel}
          disabled={busy}
          className="bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white font-bold px-3.5 py-2 rounded-xl"
        >
          {busy ? 'Cancelling...' : 'Yes, Cancel It'}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={busy}
          className="bg-white border text-gray-700 font-bold px-3.5 py-2 rounded-xl hover:bg-gray-50"
        >
          Keep My Order
        </button>
      </div>
    </div>
  );
}

// The buyer's side of a pickup. Once the farmer marks an item picked up, the
// buyer is asked whether they actually received it — a "no" goes to the
// admins, because the two accounts don't match. Any item, picked up or not,
// can also have a problem reported against it.
function ItemFeedback({ item, token }: { item: BuyerOrder; token?: string | null }) {
  const [mode, setMode] = useState<'idle' | 'not-received' | 'problem'>('idle');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [received, setReceived] = useState(item.buyer_received);
  const [reportedAt, setReportedAt] = useState(item.buyer_problem_at);

  const send = async (payload: { received?: boolean; note?: string }) => {
    setBusy(true);
    setError(null);
    try {
      const res = await postWithAuth('/api/orders/feedback', { orderId: item.id, ...(token ? { token } : {}), ...payload });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not send that.');

      if (payload.received === true) setReceived(true);
      else setReportedAt(new Date().toISOString());
      setMode('idle');
      setNote('');
    } catch (err: any) {
      setError(err.message || 'Could not send that.');
    } finally {
      setBusy(false);
    }
  };

  if (reportedAt) {
    return (
      <p role="status" className="text-xs font-semibold text-amber-900 bg-amber-50 border border-amber-200 rounded-xl p-3">
        You reported a problem with this item on {shortDate(reportedAt)}. We're looking into it and will email you.
      </p>
    );
  }

  if (mode !== 'idle') {
    const inputId = `problem-${item.id}`;
    return (
      <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 text-xs text-amber-950 space-y-2 print:hidden">
        <label htmlFor={inputId} className="block font-bold text-sm">
          {mode === 'not-received' ? "Tell us what happened — you didn't get this item?" : 'What went wrong with this item?'}
        </label>
        <textarea
          id={inputId}
          rows={3}
          maxLength={1000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={
            mode === 'not-received'
              ? 'For example: I picked up the corn but the farmer said the potatoes had run out.'
              : 'For example: the farmer asked me to pay cash, or nobody was at the address.'
          }
          className="w-full px-3 py-2 border border-amber-300 rounded-lg text-sm bg-white"
        />
        <p>This goes to Farm Fresh Direct, not to the farmer. We'll reply by email.</p>
        {error && (
          <p role="alert" className="font-semibold text-red-700">
            {error}
          </p>
        )}
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            disabled={busy || note.trim().length < 5}
            onClick={() => send({ ...(mode === 'not-received' ? { received: false } : {}), note })}
            className="bg-amber-700 hover:bg-amber-800 disabled:bg-gray-400 text-white font-bold px-3.5 py-2 rounded-xl"
          >
            {busy ? 'Sending...' : 'Send to Farm Fresh Direct'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setMode('idle')}
            className="bg-white border text-gray-700 font-bold px-3.5 py-2 rounded-xl hover:bg-gray-50"
          >
            Never Mind
          </button>
        </div>
      </div>
    );
  }

  if (item.status === 'completed' && !received) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-950 space-y-2 print:hidden">
        <p className="font-bold text-sm">The farmer marked this as picked up. Did you receive it?</p>
        {error && (
          <p role="alert" className="font-semibold text-red-700">
            {error}
          </p>
        )}
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            disabled={busy}
            onClick={() => send({ received: true })}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-400 text-white font-bold px-3.5 py-2 rounded-xl"
          >
            {busy ? 'Saving...' : 'Yes, I Got It'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setMode('not-received')}
            className="bg-white border border-red-200 text-red-700 font-bold px-3.5 py-2 rounded-xl hover:bg-red-50"
          >
            No, I Didn't Get It
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 flex-wrap print:hidden">
      {item.status === 'completed' && received && (
        <span className="text-xs font-semibold text-emerald-800">You confirmed you received this.</span>
      )}
      {item.status !== 'cancelled' && (
        <button
          type="button"
          onClick={() => setMode('problem')}
          className="text-xs font-semibold text-gray-600 hover:underline py-1"
        >
          Report a problem
        </button>
      )}
    </div>
  );
}

// Everything a buyer bought from one farm in one checkout: the pickup code
// that covers it, what the code is for, and where each item stands. `token` is
// the secret from a guest's order link; signed-in buyers don't need one.
export default function PickupGroupCard({ group, token }: { group: PickupGroup; token?: string | null }) {
  const openItems = group.items.filter((item) => isOpenStatus(item.status));
  const open = openItems.length > 0;
  const completedItems = group.items.filter((item) => item.status === 'completed');
  // The code is for whatever is still to be collected; once nothing is, it is
  // shown as a record of everything it covered.
  const codeItems = open ? openItems : group.items;
  // After a partial pickup the items still to collect carry a new code, so
  // theirs is the one to show.
  const code = (open ? openItems[0].pickup_code : null) || group.code;

  const addresses = [...new Set(openItems.map((item) => item.pickup_address).filter(Boolean))];
  const first = group.items[0];

  return (
    <div className="p-5 bg-white border border-gray-200 rounded-2xl shadow-sm space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-base font-bold text-gray-900 flex items-center gap-2">
          <Store className="w-5 h-5 text-emerald-600 shrink-0" aria-hidden="true" />
          {group.farmerId ? (
            <Link href={`/sellers/${group.farmerId}`} className="hover:underline">
              {group.farmName}
            </Link>
          ) : (
            group.farmName
          )}
        </p>
        <span className="text-xs text-gray-500">Ordered {new Date(first.created_at).toLocaleDateString()}</span>
      </div>

      {code && (
        <div
          className={`rounded-xl p-4 text-center border-2 ${
            open ? 'border-emerald-500 bg-emerald-50' : 'border-dashed border-gray-300 bg-gray-50'
          }`}
        >
          <p className={`text-xs font-bold uppercase tracking-widest ${open ? 'text-emerald-800' : 'text-gray-500'}`}>
            {open
              ? 'Your Pickup Code'
              : completedItems.length > 0
                ? 'Pickup Code (used at pickup)'
                : 'Pickup Code (order cancelled)'}
          </p>
          <p className={`text-4xl font-black tracking-wider font-mono ${open ? 'text-emerald-900' : 'text-gray-500'}`}>
            {code}
          </p>
          <p className={`text-sm font-semibold mt-1 ${open ? 'text-emerald-950' : 'text-gray-600'}`}>
            For: {describeItems(codeItems)} from {group.farmName}
          </p>
          {open && (
            // The same code as above, for the farmer to scan instead of typing.
            <div className="mt-3 inline-block bg-white p-3 rounded-xl border border-emerald-200">
              <QRCodeSVG
                value={code}
                size={160}
                marginSize={2}
                role="img"
                title={`QR code for pickup code ${code}`}
              />
            </div>
          )}
          {open && (
            <p className="text-xs text-gray-600 mt-1">
              Show this QR code to the farmer to scan, or read them the code, only when you collect your
              produce — it releases their payment.
              {openItems.length > 1 &&
                " If you collect only some of these items, this code is used up and we'll email you a new one for the rest."}
            </p>
          )}
        </div>
      )}

      <ul className="divide-y divide-gray-100">
        {group.items.map((item) => {
          const status = STATUS_STYLES[item.status] || { label: item.status, className: 'bg-gray-100 text-gray-600' };

          return (
            <li key={item.id} className="py-3 first:pt-0 last:pb-0 space-y-2">
              <div className="flex justify-between items-start gap-4">
                <div className="space-y-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900 break-words">
                    {item.quantity} {item.listing_unit_type} of {item.listing_title}
                  </p>
                  <span className={`inline-block text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase ${status.className}`}>
                    {status.label}
                  </span>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-black text-emerald-800">${item.total_price.toFixed(2)}</p>
                  {item.refunded_amount > 0 && (
                    <p className="text-[11px] text-gray-500">${item.refunded_amount.toFixed(2)} refunded</p>
                  )}
                </div>
              </div>

              {addresses.length > 1 && isOpenStatus(item.status) && item.pickup_address && (
                <p className="text-xs text-gray-700 flex items-start gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>
                    Pickup address: <span className="font-semibold">{item.pickup_address}</span>
                  </span>
                </p>
              )}

              {item.status === 'ready_for_pickup' && item.pickup_details && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-900">
                  <p className="font-bold mb-1">Pickup details from the farmer</p>
                  <p className="whitespace-pre-wrap">{item.pickup_details}</p>
                </div>
              )}

              {item.status === 'pending_pickup' && item.ready_by && (
                <p className={`text-xs ${isSellerLate(item) ? 'font-semibold text-red-700' : 'text-gray-600'}`}>
                  {isSellerLate(item)
                    ? `The farmer was due to have this ready by ${shortDate(item.ready_by)}. You can wait, or cancel it for a full refund.`
                    : `The farmer should have this ready by ${shortDate(item.ready_by)}. We'll email you when it is.`}
                </p>
              )}

              {item.status === 'pending_pickup' && !item.pickup_address && (
                <p className="text-xs text-gray-600 flex items-start gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>
                    Pickup{item.pickup_area ? ` in ${item.pickup_area}` : ''}. You'll get the exact address when the
                    farmer marks this ready.
                  </span>
                </p>
              )}

              {item.status === 'ready_for_pickup' && item.pickup_by && (
                <p className="text-xs font-semibold text-blue-900">Please pick up by {shortDate(item.pickup_by)}.</p>
              )}

              {isOpenStatus(item.status) && <CancelItem item={item} token={token} />}

              <ItemFeedback item={item} token={token} />
            </li>
          );
        })}
      </ul>

      {addresses.length === 1 && (
        <p className="text-sm text-gray-700 flex items-start gap-1.5">
          <MapPin className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            Pickup address: <span className="font-semibold">{addresses[0]}</span>
            {openItems.some((item) => item.status !== 'ready_for_pickup') && (
              <span className="block text-xs text-gray-500 mt-0.5">
                Please wait until the farmer marks an item ready before heading over for it.
              </span>
            )}
          </span>
        </p>
      )}

      <OrderMessages orderId={(openItems[0] || first).id} role="buyer" token={token} />

      {completedItems.length > 0 && (
        <ReviewForm
          orderId={completedItems[0].id}
          token={token}
          alreadyReviewed={completedItems.some((item) => item.reviewed)}
        />
      )}
    </div>
  );
}
