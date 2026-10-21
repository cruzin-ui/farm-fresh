'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { postWithAuth } from '@/lib/authedFetch';

type Crop = { id: string; farm: string; farmId: string; name: string; variety: string; category: string; expected: string; note: string };

type Post = {
  id: string;
  farm: string;
  farmId: string;
  kind: string;
  name: string;
  place: string;
  schedule: string;
  note: string;
  takesOrders: boolean;
  openOrders: number;
};

// Farms' market and event posts, for the admin page, with a way to take one
// down (as with listings).
export default function AdminAppearances() {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [crops, setCrops] = useState<Crop[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const call = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const res = await postWithAuth('/api/admin/appearances', body);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Something went wrong.');
      setPosts(json.posts);
      setCrops(json.crops || []);
      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    call({ action: 'list' });
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-gray-900">Markets &amp; events</h2>
        <p className="text-sm text-gray-600">
          Where farms say they'll be, shown on their farm pages. Taking a post down refunds any orders booked for pickup there
          and emails the farm your reason.
        </p>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      {posts === null && <p className="text-sm text-gray-500">Loading…</p>}
      {posts && posts.length === 0 && <p className="text-sm text-gray-500">No upcoming posts.</p>}
      <ul className="divide-y border rounded-xl bg-white">
        {(posts || []).map((p) => (
          <li key={p.id} className="p-3 space-y-1 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-gray-900">
                  {p.name} <span className="text-xs font-normal text-gray-500">· {p.kind}</span>
                </p>
                <p className="text-xs text-gray-600">
                  <Link href={`/sellers/${p.farmId}`} className="font-semibold text-emerald-800 underline">
                    {p.farm}
                  </Link>{' '}
                  · {p.place} · {p.schedule}
                  {p.takesOrders && ' · takes orders'}
                  {p.openOrders > 0 && ` · ${p.openOrders} open order${p.openOrders === 1 ? '' : 's'}`}
                </p>
                {p.note && <p className="text-xs text-gray-700 mt-1">“{p.note}”</p>}
              </div>
              {removing !== p.id && (
                <button
                  onClick={() => {
                    setRemoving(p.id);
                    setReason('');
                  }}
                  className="text-xs font-semibold text-red-700 underline"
                >
                  Take down
                </button>
              )}
            </div>
            {removing === p.id && (
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  aria-label="Reason (sent to the farm)"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={300}
                  placeholder="Reason (sent to the farm)"
                  className="flex-1 px-3 py-2 border border-red-200 rounded-lg text-sm"
                />
                <button
                  disabled={busy || !reason.trim()}
                  onClick={async () => {
                    if (await call({ action: 'remove', id: p.id, reason })) setRemoving(null);
                  }}
                  className="px-3 py-2 text-xs font-bold bg-red-600 text-white rounded-lg disabled:opacity-50"
                >
                  Take down{p.openOrders > 0 ? ` and refund ${p.openOrders}` : ''}
                </button>
                <button onClick={() => setRemoving(null)} className="text-xs font-semibold text-gray-600">
                  Never mind
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      <div className="pt-4">
        <h2 className="text-lg font-bold text-gray-900">What farms are growing</h2>
        <p className="text-sm text-gray-600">Crops farms show on their farm pages as coming soon. Removing one emails the farm your reason.</p>
      </div>
      {crops.length === 0 && posts !== null && <p className="text-sm text-gray-500">None right now.</p>}
      <ul className="divide-y border rounded-xl bg-white">
        {crops.map((c) => {
          const key = `crop|${c.id}`;
          return (
            <li key={c.id} className="p-3 space-y-1 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-gray-900">
                    {c.name}
                    {c.variety && <span className="font-normal text-gray-600"> · {c.variety}</span>}{' '}
                    <span className="text-xs font-normal text-gray-500">· {c.category}</span>
                  </p>
                  <p className="text-xs text-gray-600">
                    <Link href={`/sellers/${c.farmId}`} className="font-semibold text-emerald-800 underline">
                      {c.farm}
                    </Link>{' '}
                    · {c.expected}
                  </p>
                  {c.note && <p className="text-xs text-gray-700 mt-1">“{c.note}”</p>}
                </div>
                {removing !== key && (
                  <button
                    onClick={() => {
                      setRemoving(key);
                      setReason('');
                    }}
                    className="text-xs font-semibold text-red-700 underline"
                  >
                    Remove
                  </button>
                )}
              </div>
              {removing === key && (
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    aria-label="Reason (sent to the farm)"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    maxLength={300}
                    placeholder="Reason (sent to the farm)"
                    className="flex-1 px-3 py-2 border border-red-200 rounded-lg text-sm"
                  />
                  <button
                    disabled={busy || !reason.trim()}
                    onClick={async () => {
                      if (await call({ action: 'remove_crop', id: c.id, reason })) setRemoving(null);
                    }}
                    className="px-3 py-2 text-xs font-bold bg-red-600 text-white rounded-lg disabled:opacity-50"
                  >
                    Remove crop
                  </button>
                  <button onClick={() => setRemoving(null)} className="text-xs font-semibold text-gray-600">
                    Never mind
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
