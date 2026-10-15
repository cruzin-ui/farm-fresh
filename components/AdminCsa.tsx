'use client';

import React, { useEffect, useState } from 'react';
import { postWithAuth } from '@/lib/authedFetch';
import { describeFrequency, formatBoxDate } from '@/lib/csaSchedule';

type Plan = {
  id: string;
  name: string;
  farm: string;
  status: string;
  priceCents: number;
  frequency: string;
  pickupWeekday: number;
  seasonStart: string;
  seasonEnd: string;
  active: number;
  paused: number;
  cancelled: number;
};

type Box = {
  member_id: string;
  box_date: string;
  status: string;
  attempts: number;
  last_error: string | null;
  plan: string;
  farm: string;
  buyer: string;
  card: string;
};

const BOX_STATUS: Record<string, string> = {
  paid: 'bg-emerald-100 text-emerald-800',
  failed: 'bg-red-100 text-red-800',
  farm_skipped: 'bg-amber-100 text-amber-900',
  charging: 'bg-gray-100 text-gray-700',
};

// The admin page's CSA section: every Farm Box, and the last two weeks of
// box charges with declined cards first.
export default function AdminCsa() {
  const [data, setData] = useState<{ plans: Plan[]; boxes: Box[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    postWithAuth('/api/admin/csa')
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Could not load Farm Boxes.');
        setData(json);
      })
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <p className="text-sm text-red-700">{error}</p>;
  if (!data) return <p className="text-sm text-gray-500">Loading…</p>;

  const live = data.plans.filter((p) => p.status !== 'ended');
  const failed = data.boxes.filter((b) => b.status === 'failed');

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5 space-y-3">
        <h2 className="text-lg font-bold text-gray-900">Farm Boxes (CSA)</h2>
        <p className="text-sm text-gray-700">
          <strong>{live.length}</strong> running · <strong>{live.reduce((sum, p) => sum + p.active, 0)}</strong> active
          members · <strong>{data.boxes.filter((b) => b.status === 'paid').length}</strong> boxes paid and{' '}
          <strong className={failed.length ? 'text-red-700' : ''}>{failed.length}</strong> declined in the last two weeks
        </p>
        {data.plans.length === 0 ? (
          <p className="text-sm text-gray-500">No farm has set up a Farm Box yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b">
                  <th className="py-2 pr-3">Share</th>
                  <th className="py-2 pr-3">Farm</th>
                  <th className="py-2 pr-3">Schedule</th>
                  <th className="py-2 pr-3">Price</th>
                  <th className="py-2 pr-3">Members</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.plans.map((p) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="py-2 pr-3 font-semibold text-gray-900">{p.name}</td>
                    <td className="py-2 pr-3">{p.farm}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {describeFrequency({ pickup_weekday: p.pickupWeekday, frequency: p.frequency })},{' '}
                      {formatBoxDate(p.seasonStart)}–{formatBoxDate(p.seasonEnd)}
                    </td>
                    <td className="py-2 pr-3">${(p.priceCents / 100).toFixed(2)}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {p.active} active{p.paused ? `, ${p.paused} paused` : ''}{p.cancelled ? `, ${p.cancelled} left` : ''}
                    </td>
                    <td className="py-2 capitalize">{p.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5 space-y-3">
        <h3 className="font-bold text-gray-900">Box charges, last two weeks</h3>
        <p className="text-xs text-gray-600">
          A declined card is tried again the next day, and the member is emailed to update it. Each paid box is also an
          ordinary order under Orders.
        </p>
        {data.boxes.length === 0 ? (
          <p className="text-sm text-gray-500">No box charges yet.</p>
        ) : (
          <ul className="divide-y border rounded-xl text-sm">
            {data.boxes.map((b) => (
              <li key={`${b.member_id}${b.box_date}`} className="p-3 flex flex-wrap items-center justify-between gap-2">
                <span>
                  <strong>{formatBoxDate(b.box_date)}</strong> · {b.plan} ({b.farm}) · {b.buyer}
                  {b.card ? ` · ${b.card}` : ''}
                  {b.last_error && b.status !== 'paid' && <span className="block text-xs text-gray-500">{b.last_error}</span>}
                </span>
                <span className={`text-[11px] font-bold rounded-full px-2 py-0.5 ${BOX_STATUS[b.status] || 'bg-gray-100'}`}>
                  {b.status.replace('_', ' ')}
                  {b.status === 'failed' && b.attempts > 1 ? ` ×${b.attempts}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
