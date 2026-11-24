'use client';

import React, { useEffect, useState } from 'react';
import { CalendarDays } from 'lucide-react';

// On a listing: the farm's next markets where buyers can pick up an order
// placed ahead (chosen at checkout). Nothing shows when there aren't any.
// With `row`, it's one row of the listing's "getting it" list (a <dl>).
export default function ListingMarketPickup({ farmerId, row = false }: { farmerId: string; row?: boolean }) {
  const [events, setEvents] = useState<{ id: string; date: string; name: string; dateLabel: string; times: string; takesOrders: boolean }[]>([]);

  useEffect(() => {
    fetch('/api/appearances/public', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ farmerId }),
    })
      .then((res) => res.json())
      .then((json) => setEvents((json.events || []).filter((e: any) => e.takesOrders).slice(0, 2)))
      .catch(() => setEvents([]));
  }, [farmerId]);

  if (events.length === 0) return null;
  if (row) {
    return (
      <div className="flex items-start gap-3 p-4">
        <CalendarDays className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
        <div>
          <dt className="text-sm font-bold text-gray-900">Or at their market stand</dt>
          {events.map((e) => (
            <dd key={`${e.id}-${e.date}`} className="text-xs text-gray-600">
              {e.name} · {e.dateLabel}, {e.times}
            </dd>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="text-sm text-emerald-950 bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-start gap-2">
      <CalendarDays className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
      <div>
        <p className="font-semibold">Or pick it up at their market stand</p>
        <ul className="text-xs text-emerald-900">
          {events.map((e) => (
            <li key={`${e.id}-${e.date}`}>
              {e.name}: {e.dateLabel}, {e.times}
            </li>
          ))}
        </ul>
        <p className="text-xs text-emerald-900 mt-0.5">Choose the market at checkout. Ordering closes the evening before.</p>
      </div>
    </div>
  );
}
