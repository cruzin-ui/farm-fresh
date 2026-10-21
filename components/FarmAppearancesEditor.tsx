'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, Plus, AlertCircle, CheckCircle2, MapPin } from 'lucide-react';
import { postWithAuth } from '@/lib/authedFetch';
import { todayInArizona } from '@/lib/csaSchedule';
import { APPEARANCE_KINDS, ORDER_CUTOFF_HOUR, formatTime } from '@/lib/appearances';

type Post = {
  id: string;
  kind: string;
  kindLabel: string;
  name: string;
  address: string;
  city: string;
  zip: string;
  startsOn: string;
  endsOn: string;
  repeatsWeekly: boolean;
  startTime: string;
  endTime: string;
  note: string;
  takesOrders: boolean;
  schedule: string;
  times: string;
  openOrders: number;
  dates: { date: string; label: string; skipped: boolean; orders: number }[];
};

type Form = {
  id?: string;
  kind: string;
  name: string;
  address: string;
  city: string;
  zip: string;
  startsOn: string;
  repeatsWeekly: boolean;
  endsOn: string;
  startTime: string;
  endTime: string;
  note: string;
  takesOrders: boolean;
};

const EMPTY: Form = {
  kind: 'market',
  name: '',
  address: '',
  city: '',
  zip: '',
  startsOn: '',
  repeatsWeekly: false,
  endsOn: '',
  startTime: '08:00',
  endTime: '12:00',
  note: '',
  takesOrders: true,
};

// "Where to find us" in the Seller Dashboard: the farmers markets, festivals
// and other places the farm will be, shown on its farm page. Buyers can order
// ahead for pickup at any that take orders.
export default function FarmAppearancesEditor({ sellerTermsAccepted }: { sellerTermsAccepted: boolean }) {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // A take-down or skip that would cancel orders, waiting for the farmer to confirm.
  const [confirm, setConfirm] = useState<{ action: 'remove' | 'skip'; id: string; date?: string; orders: number } | null>(null);
  const [reasonFor, setReasonFor] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const call = async (body: Record<string, unknown>, key: string) => {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      const res = await postWithAuth('/api/appearances', body);
      const json = await res.json();
      if (res.status === 409 && json.needsConfirm) {
        setConfirm({ action: body.action as 'remove' | 'skip', id: body.id as string, date: body.date as string | undefined, orders: json.orders });
        return null;
      }
      if (!res.ok) throw new Error(json.error || 'Something went wrong.');
      setPosts(json.appearances);
      if (json.notice) setNotice(json.notice);
      return json;
    } catch (err: any) {
      setError(err.message);
      return null;
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    call({ action: 'get' }, 'load');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const field = (name: keyof Form) => ({
    value: String(form?.[name] ?? ''),
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((current) => (current ? { ...current, [name]: e.target.value } : current)),
  });

  const runAction = async (body: Record<string, unknown>, key: string) => {
    const json = await call(body, key);
    if (json) {
      setConfirm(null);
      setReasonFor(null);
      setReason('');
    }
  };

  return (
    <section className="border rounded-2xl p-5 space-y-4 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-emerald-600" /> Where to find us
          </h3>
          <p className="text-sm text-gray-600 max-w-xl">
            Tell buyers which farmers markets, festivals and pop-ups you'll be at. They show on your farm page, and buyers who
            follow you and asked to hear about your markets get an email. Buyers can also order ahead and pick up at your
            stand; ordering for a date closes at {formatTime(`${ORDER_CUTOFF_HOUR}:00`)} the day before.
          </p>
        </div>
        {!form && (
          <button
            onClick={() => {
              setForm({ ...EMPTY, startsOn: todayInArizona() });
              setError(null);
            }}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm"
          >
            <Plus className="w-4 h-4" /> Add a market or event
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm flex gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {error}
        </p>
      )}
      {notice && (
        <p role="status" className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-sm flex gap-2">
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> {notice}
        </p>
      )}

      {form && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const json = await call({ action: 'save', appearance: form, acceptTerms }, 'save');
            if (json) setForm(null);
          }}
          className="border border-emerald-200 bg-emerald-50/40 rounded-2xl p-4 space-y-3"
        >
          <h4 className="font-bold text-gray-900">{form.id ? 'Edit' : 'Add a market or event'}</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="ap-kind" className="block text-xs font-semibold text-gray-700 mb-1">What is it? *</label>
              <select id="ap-kind" {...field('kind')} className="w-full px-3 py-2 border rounded-lg text-sm bg-white">
                {Object.entries(APPEARANCE_KINDS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="ap-name" className="block text-xs font-semibold text-gray-700 mb-1">Name *</label>
              <input id="ap-name" required maxLength={100} placeholder="e.g., Downtown Phoenix Farmers Market" {...field('name')} className="w-full px-3 py-2 border rounded-lg text-sm bg-white" />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="ap-address" className="block text-xs font-semibold text-gray-700 mb-1">Where (the venue's street address) *</label>
              <input id="ap-address" required maxLength={200} placeholder="e.g., 721 N Central Ave" {...field('address')} className="w-full px-3 py-2 border rounded-lg text-sm bg-white" />
              <p className="text-xs text-gray-500 mt-1">Shown publicly. Use the market or event's address, not your home.</p>
            </div>
            <div>
              <label htmlFor="ap-city" className="block text-xs font-semibold text-gray-700 mb-1">City *</label>
              <input id="ap-city" required maxLength={100} placeholder="Phoenix" {...field('city')} className="w-full px-3 py-2 border rounded-lg text-sm bg-white" />
            </div>
            <div>
              <label htmlFor="ap-zip" className="block text-xs font-semibold text-gray-700 mb-1">Zip code *</label>
              <input id="ap-zip" required inputMode="numeric" maxLength={5} {...field('zip')} className="w-full px-3 py-2 border rounded-lg text-sm bg-white" />
            </div>
            <div>
              <label htmlFor="ap-date" className="block text-xs font-semibold text-gray-700 mb-1">{form.repeatsWeekly ? 'First date *' : 'Date *'}</label>
              <input id="ap-date" type="date" required {...field('startsOn')} className="w-full px-3 py-2 border rounded-lg text-sm bg-white" />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm text-gray-700 pb-2">
                <input
                  type="checkbox"
                  checked={form.repeatsWeekly}
                  onChange={(e) => setForm((current) => (current ? { ...current, repeatsWeekly: e.target.checked } : current))}
                  className="w-4 h-4"
                />
                Every week on this day
              </label>
            </div>
            {form.repeatsWeekly && (
              <div>
                <label htmlFor="ap-end" className="block text-xs font-semibold text-gray-700 mb-1">Last date *</label>
                <input id="ap-end" type="date" required {...field('endsOn')} className="w-full px-3 py-2 border rounded-lg text-sm bg-white" />
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 sm:col-span-2">
              <div>
                <label htmlFor="ap-start" className="block text-xs font-semibold text-gray-700 mb-1">From *</label>
                <input id="ap-start" type="time" required {...field('startTime')} className="w-full px-3 py-2 border rounded-lg text-sm bg-white" />
              </div>
              <div>
                <label htmlFor="ap-finish" className="block text-xs font-semibold text-gray-700 mb-1">Until *</label>
                <input id="ap-finish" type="time" required {...field('endTime')} className="w-full px-3 py-2 border rounded-lg text-sm bg-white" />
              </div>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="ap-note" className="block text-xs font-semibold text-gray-700 mb-1">Note for buyers (optional)</label>
              <textarea id="ap-note" rows={2} maxLength={300} placeholder="e.g., Look for the green tent by the fountain. Tomatoes and eggs this week!" {...field('note')} className="w-full px-3 py-2 border rounded-lg text-sm bg-white" />
            </div>
            <label className="sm:col-span-2 flex items-start gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.takesOrders}
                onChange={(e) => setForm((current) => (current ? { ...current, takesOrders: e.target.checked } : current))}
                className="mt-0.5 w-4 h-4"
              />
              <span>
                Buyers can order ahead and pick up here. You bring their orders to your stand, mark them ready, and hand them
                over with the buyer's pickup code, as at the farm.
              </span>
            </label>
          </div>
          {!sellerTermsAccepted && (
            <label className="flex items-start gap-2 text-sm text-gray-700">
              <input type="checkbox" required checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)} className="mt-0.5 w-4 h-4" />
              <span>
                I agree to the{' '}
                <Link href="/seller-terms" target="_blank" className="font-semibold text-emerald-800 underline">
                  Seller Terms
                </Link>
                .
              </span>
            </label>
          )}
          <div className="flex gap-2">
            <button type="submit" disabled={busy !== null} className="px-4 py-2.5 bg-emerald-600 text-white font-bold rounded-xl text-sm disabled:opacity-50">
              {busy === 'save' ? 'Saving…' : form.id ? 'Save changes' : 'Post it'}
            </button>
            <button type="button" onClick={() => setForm(null)} className="px-4 py-2.5 text-sm font-semibold text-gray-700">
              Cancel
            </button>
          </div>
        </form>
      )}

      {confirm && (
        <div role="alertdialog" className="p-3 border border-red-200 bg-red-50 rounded-xl space-y-2 text-sm text-red-900">
          <p>
            {confirm.orders} order{confirm.orders === 1 ? ' is' : 's are'} booked for pickup{' '}
            {confirm.action === 'skip' ? 'that day' : 'here'}. Going ahead cancels {confirm.orders === 1 ? 'it' : 'them'} and refunds the
            buyers in full, and counts as a cancellation by your farm.
          </p>
          <input
            aria-label="Message to the buyers"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={300}
            placeholder="Message to the buyers, e.g., the market was rained out"
            className="w-full px-3 py-2 border border-red-200 rounded-lg text-sm bg-white"
          />
          <div className="flex gap-2">
            <button
              disabled={busy !== null}
              onClick={() =>
                runAction({ action: confirm.action, id: confirm.id, date: confirm.date, reason, cancelOrders: true }, 'confirm')
              }
              className="px-3 py-2 text-xs font-bold bg-red-600 text-white rounded-lg disabled:opacity-50"
            >
              Cancel and refund {confirm.orders === 1 ? 'it' : 'them'}
            </button>
            <button onClick={() => setConfirm(null)} className="text-xs font-semibold text-gray-700">
              Never mind
            </button>
          </div>
        </div>
      )}

      {posts === null && <p className="text-sm text-gray-500">Loading…</p>}
      {posts && posts.length === 0 && !form && (
        <p className="text-sm text-gray-600 border border-dashed rounded-xl p-4 text-center">
          Nothing posted yet. Add the markets you sell at so buyers can find you, and order ahead for pickup there.
        </p>
      )}

      <ul className="space-y-3">
        {(posts || []).map((post) => (
          <li key={post.id} className="border rounded-xl p-4 space-y-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-700">{post.kindLabel}</p>
                <p className="font-bold text-gray-900">{post.name}</p>
                <p className="text-sm text-gray-600 flex items-start gap-1">
                  <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
                  {post.address}, {post.city}
                </p>
                <p className="text-sm text-gray-700">{post.schedule}</p>
                {post.takesOrders && <p className="text-xs text-emerald-800">Buyers can order ahead for pickup here.</p>}
                {post.openOrders > 0 && (
                  <p className="text-xs font-semibold text-gray-800">
                    {post.openOrders} order{post.openOrders === 1 ? '' : 's'} booked for pickup here. They're in your Orders.
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() =>
                    setForm({
                      id: post.id,
                      kind: post.kind,
                      name: post.name,
                      address: post.address,
                      city: post.city,
                      zip: post.zip,
                      startsOn: post.startsOn,
                      repeatsWeekly: post.repeatsWeekly,
                      endsOn: post.endsOn,
                      startTime: post.startTime,
                      endTime: post.endTime,
                      note: post.note,
                      takesOrders: post.takesOrders,
                    })
                  }
                  className="text-xs font-semibold border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50"
                >
                  Edit
                </button>
                <button
                  onClick={() => runAction({ action: 'remove', id: post.id }, `remove${post.id}`)}
                  disabled={busy !== null}
                  className="text-xs font-semibold text-red-700 underline disabled:opacity-50"
                >
                  Take down
                </button>
              </div>
            </div>
            {post.repeatsWeekly && post.dates.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {post.dates.map((d) => {
                  const key = `${post.id}|${d.date}`;
                  return (
                    <li key={d.date} className={`text-xs rounded-lg border px-2 py-1 ${d.skipped ? 'bg-gray-100 text-gray-500 line-through' : 'bg-white'}`}>
                      {d.label}
                      {d.orders > 0 && ` · ${d.orders} order${d.orders === 1 ? '' : 's'}`}{' '}
                      {d.skipped ? (
                        <button
                          onClick={() => runAction({ action: 'unskip', id: post.id, date: d.date }, key)}
                          className="ml-1 font-semibold text-emerald-800 underline"
                        >
                          I'll be there
                        </button>
                      ) : reasonFor === key ? (
                        <span className="inline-flex gap-1 ml-1">
                          <input
                            aria-label="Why you won't be there"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            maxLength={300}
                            placeholder="Why? (optional)"
                            className="px-2 py-0.5 border rounded text-xs"
                          />
                          <button
                            onClick={() => runAction({ action: 'skip', id: post.id, date: d.date, reason }, key)}
                            className="font-semibold text-red-700"
                          >
                            Not there
                          </button>
                        </span>
                      ) : (
                        <button
                          onClick={() => {
                            setReasonFor(key);
                            setReason('');
                          }}
                          className="ml-1 font-semibold text-gray-600 underline"
                        >
                          Not there this week?
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
