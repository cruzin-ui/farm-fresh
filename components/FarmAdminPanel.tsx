'use client';

import { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, Mail } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { postWithAuth } from '@/lib/authedFetch';

// An admin's view of a seller, shown at the top of that seller's farm page:
// their track record, their contact details, and the things an admin might
// need to do about them. Only an admin ever sees it. The numbers come from a
// route that refuses everyone else, so for a buyer, the seller themselves or a
// signed-out visitor this renders nothing at all.

type SellerOverview = {
  farmer_id: string;
  farm_name: string;
  email: string | null;
  joined_at: string | null;
  payouts_set_up: boolean;
  suspension_id: string | null;
  suspension_reason: string | null;
  farm_address: string | null;
  change_reasons: { label: string; count: number }[];
  listings: number;
  orders: number;
  open: number;
  completed: number;
  seller_cancelled: number;
  seller_reduced: number;
  not_ready_in_time: number;
  no_shows: number;
  buyer_cancelled: number;
  buyer_problems: number;
  disputes: number;
  fast_completions: number;
  limit_resets: { at: string; by: string; reason: string; cancellations: number; lifted_suspension: boolean }[];
  flags: string[];
  produce_cents: number;
  paid_out_cents: number;
  fees_cents: number;
};

const usd = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const BUTTON = 'inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border transition-colors disabled:opacity-50';

export default function FarmAdminPanel({ sellerId }: { sellerId: string }) {
  const [seller, setSeller] = useState<SellerOverview | null>(null);
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    // Signed-out visitors can't be admins, so they aren't even asked about.
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;

    try {
      const res = await postWithAuth('/api/admin/seller', { sellerId });
      if (!res.ok) return;
      setSeller((await res.json()).seller);
    } catch {}
  }, [sellerId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!seller) return null;

  if (hidden) {
    return (
      <button
        type="button"
        onClick={() => setHidden(false)}
        className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-gray-600 underline print:hidden"
      >
        <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" /> Show the admin panel
      </button>
    );
  }

  // Suspensions and address changes all go through one admin route.
  const act = async (payload: Record<string, unknown>) => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await postWithAuth('/api/admin/accounts', payload);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'That did not work.');
      setNotice({ text: data.message, ok: true });
      await load();
    } catch (err: any) {
      setNotice({ text: err.message || 'That did not work.', ok: false });
    } finally {
      setBusy(false);
    }
  };

  const suspend = () => {
    const reason = prompt(
      `Suspend ${seller.farm_name}?\n\n` +
        "Their listings are hidden from buyers and they can't post new ones until you lift it. Orders they already have stay open. " +
        'They are emailed the reason below.',
      ''
    );
    if (reason === null) return;
    act({ action: 'suspend_seller', sellerId: seller.farmer_id, reason });
  };

  const liftSuspension = () => {
    if (!seller.suspension_id || !confirm(`Lift the suspension on ${seller.farm_name}?`)) return;
    act({ action: 'lift', id: seller.suspension_id });
  };

  // Starts the cancellation count again for a farm whose cancellations were
  // legitimate. Every cancellation stays on record, and so does the reset.
  const resetLimits = () => {
    const reason = prompt(
      `Reset ${seller.farm_name}'s cancellation count?\n\n` +
        'The automatic pause and the shared Farm Box rule will only count cancellations from now on. Their past cancellations stay on record, and this reset is recorded too. They are emailed.\n\nReason (kept on the record):',
      ''
    );
    if (reason === null) return;
    if (!reason.trim()) {
      alert('Please give a reason for the record.');
      return;
    }
    const liftSuspension = Boolean(seller.suspension_id) && confirm('They are suspended. Lift the suspension too?');
    act({ action: 'reset_limits', sellerId: seller.farmer_id, reason, liftSuspension });
  };

  const changeAddress = () => {
    const entered = prompt(
      `Web address for ${seller.farm_name}\n\n` +
        'Letters, numbers and hyphens. Leave it empty to remove their address so they can choose again.\n\n' +
        (seller.farm_address
          ? `Changing it breaks the current one (/${seller.farm_address}) wherever they have shared it.`
          : 'They have not chosen one yet.'),
      seller.farm_address || ''
    );
    if (entered === null) return;
    act({ action: 'set_farm_address', sellerId: seller.farmer_id, address: entered });
  };

  const tiles: { label: string; value: string | number; warn?: boolean }[] = [
    { label: 'Orders', value: seller.orders },
    { label: 'Picked up', value: seller.completed },
    { label: 'Open now', value: seller.open },
    { label: 'Seller cancelled', value: seller.seller_cancelled, warn: seller.seller_cancelled > 0 },
    { label: 'Seller reduced', value: seller.seller_reduced, warn: seller.seller_reduced > 0 },
    { label: 'Not ready in time', value: seller.not_ready_in_time, warn: seller.not_ready_in_time > 0 },
    { label: 'No-shows', value: seller.no_shows, warn: seller.no_shows > 0 },
    { label: 'Buyer problems', value: seller.buyer_problems, warn: seller.buyer_problems > 0 },
    { label: 'Payment disputes', value: seller.disputes, warn: seller.disputes > 0 },
    { label: 'Produce sold', value: usd(seller.produce_cents) },
    { label: 'Paid out to them', value: usd(seller.paid_out_cents) },
    { label: 'Fees we earned', value: usd(seller.fees_cents) },
  ];

  return (
    <section
      aria-label="Admin panel"
      className="mb-6 p-4 sm:p-5 bg-gray-100 border-2 border-gray-300 rounded-2xl space-y-4 text-sm text-gray-700 print:hidden"
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-gray-600">
            <ShieldCheck className="w-4 h-4" aria-hidden="true" /> Admin only
          </p>
          <p className="text-xs text-gray-500">Buyers and the seller don&apos;t see this.</p>
        </div>
        <button type="button" onClick={() => setHidden(true)} className="text-xs font-semibold text-gray-600 underline">
          Hide, to see the page as a buyer does
        </button>
      </div>

      <div className="space-y-1">
        <p className="text-base font-bold text-gray-900">{seller.farm_name}</p>
        <p className="text-xs break-all">
          {seller.email || 'No email on file'}
          {seller.joined_at &&
            ` · joined ${new Date(seller.joined_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`}
        </p>
        <p className="flex items-center gap-1.5 flex-wrap text-[11px] font-bold">
          <span className={`px-2 py-0.5 rounded-full ${seller.payouts_set_up ? 'bg-emerald-100 text-emerald-900' : 'bg-amber-100 text-amber-900'}`}>
            {seller.payouts_set_up ? 'Payouts connected' : 'Payouts not set up'}
          </span>
          <span className={`px-2 py-0.5 rounded-full ${seller.suspension_id ? 'bg-red-600 text-white' : 'bg-gray-200 text-gray-700'}`}>
            {seller.suspension_id ? 'Suspended' : 'Not suspended'}
          </span>
          <span className="px-2 py-0.5 rounded-full bg-gray-200 text-gray-700">
            {seller.farm_address ? `Web address: /${seller.farm_address}` : 'No web address chosen'}
          </span>
          <span className="px-2 py-0.5 rounded-full bg-gray-200 text-gray-700">
            {seller.listings} listing{seller.listings === 1 ? '' : 's'}
          </span>
        </p>
        {seller.suspension_id && seller.suspension_reason && (
          <p className="text-xs text-red-800">Suspended because: {seller.suspension_reason}</p>
        )}
        {seller.flags.map((flag) => (
          <p key={flag} className="text-xs font-bold text-red-700">
            Flag: {flag}
          </p>
        ))}
      </div>

      <dl className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
        {tiles.map((tile) => (
          <div key={tile.label} className="p-2.5 bg-white border border-gray-200 rounded-xl">
            <dt className="text-[11px] text-gray-500 leading-tight">{tile.label}</dt>
            <dd className={`mt-0.5 text-base font-bold tabular-nums ${tile.warn ? 'text-red-700' : 'text-gray-900'}`}>
              {tile.value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="text-xs space-y-0.5">
        <p>
          <span className="font-bold text-gray-900">Cancellation limit resets: </span>
          {seller.limit_resets.length === 0 ? 'none' : seller.limit_resets.length}
        </p>
        {seller.limit_resets.slice(0, 5).map((r) => (
          <p key={r.at} className="text-gray-600">
            {new Date(r.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} by {r.by}: “{r.reason}” (
            {r.cancellations} cancellation{r.cancellations === 1 ? '' : 's'} on record then{r.lifted_suspension ? '; suspension lifted' : ''})
          </p>
        ))}
      </div>

      {seller.change_reasons.length > 0 && (
        <p className="text-xs">
          <span className="font-bold text-gray-900">Reasons they gave for cancelling or reducing: </span>
          {seller.change_reasons.map((r) => `${r.label} (${r.count})`).join('; ')}
        </p>
      )}

      {notice && (
        <p role="status" className={`text-xs font-semibold ${notice.ok ? 'text-emerald-800' : 'text-red-700'}`}>
          {notice.text}
        </p>
      )}

      <div className="flex gap-2 flex-wrap">
        {seller.email && (
          <a
            href={`mailto:${seller.email}?subject=${encodeURIComponent('About your Farm Fresh Direct farm')}`}
            className={`${BUTTON} bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600`}
          >
            <Mail className="w-3.5 h-3.5" aria-hidden="true" /> Email Seller
          </a>
        )}
        <a href={`/admin?section=all&seller=${seller.farmer_id}`} className={`${BUTTON} bg-white text-gray-700 border-gray-300 hover:bg-gray-50`}>
          See Their Orders
        </a>
        <a href={`/admin?section=listings&seller=${seller.farmer_id}`} className={`${BUTTON} bg-white text-gray-700 border-gray-300 hover:bg-gray-50`}>
          See Their Listings
        </a>
        <button type="button" disabled={busy} onClick={changeAddress} className={`${BUTTON} bg-white text-gray-700 border-gray-300 hover:bg-gray-50`}>
          Change Web Address
        </button>
        <button type="button" disabled={busy} onClick={resetLimits} className={`${BUTTON} bg-white text-gray-700 border-gray-300 hover:bg-gray-50`}>
          Reset Cancellation Limit
        </button>
        {seller.suspension_id ? (
          <button type="button" disabled={busy} onClick={liftSuspension} className={`${BUTTON} bg-white text-gray-700 border-gray-300 hover:bg-gray-50`}>
            Lift Suspension
          </button>
        ) : (
          <button type="button" disabled={busy} onClick={suspend} className={`${BUTTON} bg-white text-red-700 border-red-200 hover:bg-red-50`}>
            Suspend Seller
          </button>
        )}
      </div>

      <p className="text-xs text-gray-500">
        Refunds and payout releases are on each order in the admin page, under See Their Orders.
      </p>
    </section>
  );
}
