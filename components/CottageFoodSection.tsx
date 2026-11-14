'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle, FileUp } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { postWithAuth } from '@/lib/authedFetch';
import { COTTAGE_REG_PATTERN, cleanCottageReg } from '@/lib/categories';

type Registration = { regNumber: string; submittedAt: string } | null;

// In Farm Profile & Photo: the farm's Arizona cottage food registration. With
// one (the number plus a photo or PDF of the registration certificate), the
// farm can list jams, preserves and baked goods. Removing it takes those
// listings off sale. `onChange` tells the dashboard the current number.
export default function CottageFoodSection({ onChange }: { onChange: (regNumber: string) => void }) {
  const [registration, setRegistration] = useState<Registration | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [number, setNumber] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const apply = (next: Registration) => {
    setRegistration(next);
    onChange(next?.regNumber || '');
  };

  useEffect(() => {
    (async () => {
      try {
        const res = await postWithAuth('/api/seller/cottage-food', { action: 'get' });
        const json = await res.json();
        apply(res.ok ? json.registration : null);
      } catch {
        setRegistration(null);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async () => {
    setError(null);
    setNotice(null);
    const reg = cleanCottageReg(number);
    if (!COTTAGE_REG_PATTERN.test(reg)) {
      setError('Enter your registration number as it appears on your certificate.');
      return;
    }
    if (!file) {
      setError('Upload a photo or PDF of your registration certificate.');
      return;
    }
    setBusy(true);
    try {
      const { data } = await supabase.auth.getSession();
      const form = new FormData();
      form.append('number', reg);
      form.append('file', file);
      const res = await fetch('/api/seller/cottage-food', {
        method: 'POST',
        headers: { Authorization: `Bearer ${data.session?.access_token || ''}` },
        body: form,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Your registration could not be saved.');
      apply(json.registration);
      setEditing(false);
      setFile(null);
      setNotice('Saved. You can now list jams, preserves and baked goods.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (
      !window.confirm(
        'Remove your cottage food registration? Your jams, preserves and baked goods listings will be taken off sale. Orders already placed are not affected.'
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await postWithAuth('/api/seller/cottage-food', { action: 'remove' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not remove it.');
      apply(null);
      setNotice(
        json.takenDown
          ? `Removed. ${json.takenDown} listing${json.takenDown === 1 ? ' was' : 's were'} taken off sale.`
          : 'Removed.'
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const showForm = registration === null || editing;

  return (
    <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-2">
      <p className="text-sm font-bold text-gray-900">
        Cottage food registration <span className="text-xs font-normal text-gray-500">(optional)</span>
      </p>
      <p className="text-xs text-gray-600">
        Want to sell jams, preserves or baked goods made in your home kitchen? Register with the{' '}
        <a
          href="https://www.azdhs.gov/CottageFood"
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-emerald-800 underline"
        >
          Arizona cottage food program
        </a>
        , then add your registration number and certificate here. The number is shown on those listings.
      </p>

      {registration === undefined && <p className="text-xs text-gray-500">Loading…</p>}

      {registration && !editing && (
        <div className="flex flex-wrap items-center justify-between gap-2 bg-white border rounded-lg p-3">
          <p className="text-sm text-gray-800 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
            Registration <strong>{registration.regNumber}</strong> · certificate on file
          </p>
          <span className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setEditing(true);
                setNumber(registration.regNumber);
                setNotice(null);
              }}
              className="text-xs font-semibold border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50"
            >
              Update
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className="text-xs font-semibold text-red-700 border border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-50 disabled:opacity-50"
            >
              Remove
            </button>
          </span>
        </div>
      )}

      {showForm && registration !== undefined && (
        <div className="space-y-2">
          <div>
            <label htmlFor="cottage-number" className="block text-xs font-semibold text-gray-700 mb-1">
              Registration number
            </label>
            <input
              id="cottage-number"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              maxLength={30}
              autoComplete="off"
              placeholder="As shown on your certificate"
              className="w-full px-4 py-2 border rounded-lg text-sm bg-white uppercase"
            />
          </div>
          <div>
            <label htmlFor="cottage-file" className="block text-xs font-semibold text-gray-700 mb-1">
              Registration certificate (PDF or photo, under 4 MB)
            </label>
            <label
              htmlFor="cottage-file"
              className="flex items-center gap-2 px-4 py-2 border border-dashed border-gray-300 rounded-lg text-sm bg-white cursor-pointer hover:border-emerald-400"
            >
              <FileUp className="w-4 h-4 text-emerald-700 shrink-0" aria-hidden="true" />
              <span className="truncate">{file ? file.name : 'Choose a file'}</span>
            </label>
            <input
              id="cottage-file"
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/heic,image/webp"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="sr-only"
            />
          </div>
          <p className="text-xs text-gray-600">
            By saving, you confirm this is your own current registration, and that you follow the cottage food rules,
            including labeling, for everything you list in those categories. We may spot-check certificates.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={submit}
              disabled={busy}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-400 text-white text-sm font-semibold rounded-lg"
            >
              {busy ? 'Saving…' : 'Save registration'}
            </button>
            {editing && (
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setFile(null);
                  setError(null);
                }}
                className="text-sm font-semibold text-gray-600 underline"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="text-xs text-red-700 flex gap-1.5">
          <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" /> {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-xs text-emerald-800 flex gap-1.5">
          <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" /> {notice}
        </p>
      )}
    </div>
  );
}
