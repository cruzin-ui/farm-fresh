'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Sprout, Plus, AlertCircle } from 'lucide-react';
import { postWithAuth } from '@/lib/authedFetch';
import { LISTING_CATEGORIES } from '@/lib/categories';
import { GRACE_DAYS, MAX_GROWING } from '@/lib/growing';

type Crop = {
  id: string;
  name: string;
  variety: string;
  category: string;
  expectedFrom: string;
  expectedUntil: string | null;
  note: string;
  expected: string;
  hidden: boolean;
};

type Form = { id?: string; name: string; variety: string; category: string; expectedFrom: string; expectedUntil: string; note: string };
const EMPTY: Form = { name: '', variety: '', category: 'Vegetables', expectedFrom: '', expectedUntil: '', note: '' };

// "What we're growing" in the Seller Dashboard: crops in the ground and
// roughly when each should be ready, shown on the farm page. When one is
// ready, "Post it" starts a listing with its name filled in.
export default function GrowingNowEditor({
  sellerTermsAccepted,
  onPostCrop,
}: {
  sellerTermsAccepted: boolean;
  // Starts a new listing for this crop.
  onPostCrop: (crop: { title: string; variety: string; category: string }) => void;
}) {
  const [crops, setCrops] = useState<Crop[] | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const call = async (body: Record<string, unknown>, key: string) => {
    setBusy(key);
    setError(null);
    try {
      const res = await postWithAuth('/api/growing', body);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Something went wrong.');
      setCrops(json.crops);
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

  return (
    <section className="border rounded-2xl p-5 space-y-4 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Sprout className="w-5 h-5 text-emerald-600" /> What we&apos;re growing
          </h3>
          <p className="text-sm text-gray-600 max-w-xl">
            Show buyers what&apos;s in the ground and roughly when it&apos;ll be ready, on your farm page. A rough guess is
            fine. Each crop comes off the list when you post it for sale, or {GRACE_DAYS} days after its expected date.
          </p>
        </div>
        {!form && (
          <button
            onClick={() => setForm({ ...EMPTY })}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm"
          >
            <Plus className="w-4 h-4" /> Add a crop
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm flex gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {error}
        </p>
      )}

      {form && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const json = await call({ action: 'save', crop: form, acceptTerms }, 'save');
            if (json) setForm(null);
          }}
          className="border border-emerald-200 bg-emerald-50/40 rounded-2xl p-4 space-y-3"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="gr-name" className="block text-xs font-semibold text-gray-700 mb-1">What is it? *</label>
              <input id="gr-name" required maxLength={80} placeholder="e.g., Heirloom Tomatoes" {...field('name')} className="w-full px-3 py-2 border rounded-lg text-sm bg-white" />
            </div>
            <div>
              <label htmlFor="gr-variety" className="block text-xs font-semibold text-gray-700 mb-1">Variety (optional)</label>
              <input id="gr-variety" maxLength={60} placeholder="e.g., Cherokee Purple" {...field('variety')} className="w-full px-3 py-2 border rounded-lg text-sm bg-white" />
            </div>
            <div>
              <label htmlFor="gr-category" className="block text-xs font-semibold text-gray-700 mb-1">Category *</label>
              <select id="gr-category" {...field('category')} className="w-full px-3 py-2 border rounded-lg text-sm bg-white">
                {LISTING_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="gr-from" className="block text-xs font-semibold text-gray-700 mb-1">Ready around *</label>
                <input id="gr-from" type="date" required {...field('expectedFrom')} className="w-full px-3 py-2 border rounded-lg text-sm bg-white" />
              </div>
              <div>
                <label htmlFor="gr-until" className="block text-xs font-semibold text-gray-700 mb-1">Until (optional)</label>
                <input id="gr-until" type="date" {...field('expectedUntil')} className="w-full px-3 py-2 border rounded-lg text-sm bg-white" />
              </div>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="gr-note" className="block text-xs font-semibold text-gray-700 mb-1">Note for buyers (optional)</label>
              <input id="gr-note" maxLength={200} placeholder="e.g., First planting of the fall; a big crop this year" {...field('note')} className="w-full px-3 py-2 border rounded-lg text-sm bg-white" />
            </div>
          </div>
          <p className="text-xs text-gray-500">Buyers see it as a rough time, like &quot;Expected mid-November&quot;, not an exact date.</p>
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
              {busy === 'save' ? 'Saving…' : form.id ? 'Save changes' : 'Add it'}
            </button>
            <button type="button" onClick={() => setForm(null)} className="px-4 py-2.5 text-sm font-semibold text-gray-700">
              Cancel
            </button>
          </div>
        </form>
      )}

      {crops === null && <p className="text-sm text-gray-500">Loading…</p>}
      {crops && crops.length === 0 && !form && (
        <p className="text-sm text-gray-600 border border-dashed rounded-xl p-4 text-center">
          Nothing added yet. Buyers love seeing what&apos;s coming, and it gives them a reason to come back.
        </p>
      )}
      <ul className="divide-y border rounded-xl">
        {(crops || []).map((crop) => (
          <li key={crop.id} className="p-3 flex flex-wrap items-start justify-between gap-2">
            <div className="text-sm min-w-0">
              <p className="font-bold text-gray-900">
                {crop.name}
                {crop.variety && <span className="font-normal text-gray-600"> · {crop.variety}</span>}
              </p>
              <p className={`text-xs ${crop.hidden ? 'text-amber-800' : 'text-emerald-800'}`}>
                {crop.expected}
                {crop.hidden && ' · no longer shown to buyers. Update the date, post it, or remove it.'}
              </p>
              {crop.note && <p className="text-xs text-gray-600">{crop.note}</p>}
            </div>
            <div className="flex items-center gap-2 text-xs">
              <button
                onClick={() => onPostCrop({ title: crop.name, variety: crop.variety, category: crop.category })}
                className="font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg px-2.5 py-1"
              >
                Ready? Post it
              </button>
              <button
                onClick={() =>
                  setForm({
                    id: crop.id,
                    name: crop.name,
                    variety: crop.variety,
                    category: crop.category,
                    expectedFrom: crop.expectedFrom,
                    expectedUntil: crop.expectedUntil || '',
                    note: crop.note,
                  })
                }
                className="font-semibold border border-gray-300 rounded-lg px-2.5 py-1 hover:bg-gray-50"
              >
                Edit
              </button>
              <button
                disabled={busy !== null}
                onClick={() => call({ action: 'remove', id: crop.id }, `remove${crop.id}`)}
                className="font-semibold text-red-700 underline disabled:opacity-50"
              >
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>
      {crops && crops.length >= MAX_GROWING && <p className="text-xs text-gray-500">You can show up to {MAX_GROWING} crops.</p>}
    </section>
  );
}
