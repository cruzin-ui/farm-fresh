'use client';

import React, { useEffect, useState } from 'react';
import { CalendarDays, MapPin, ShoppingBag } from 'lucide-react';

type FarmEvent = {
  id: string;
  date: string;
  kindLabel: string;
  name: string;
  address: string;
  city: string;
  dateLabel: string;
  times: string;
  note: string;
  takesOrders: boolean;
  mapUrl: string;
};

// "Where to find us" on a farm's page: the next markets and events it will be
// at. Nothing shows when there aren't any.
export default function FarmAppearances({ farmerId, farmName }: { farmerId: string; farmName: string }) {
  const [events, setEvents] = useState<FarmEvent[]>([]);

  useEffect(() => {
    fetch('/api/appearances/public', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ farmerId }),
    })
      .then((res) => res.json())
      .then((json) => setEvents(json.events || []))
      .catch(() => setEvents([]));
  }, [farmerId]);

  if (events.length === 0) return null;
  const ordersAhead = events.some((e) => e.takesOrders);

  return (
    <section className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm mb-8 space-y-3">
      <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
        <CalendarDays className="w-5 h-5 text-emerald-600" /> Where to find {farmName}
      </h2>
      <ul className="divide-y">
        {events.map((event) => (
          <li key={`${event.id}-${event.date}`} className="py-3 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4">
            <div className="sm:w-48 shrink-0">
              <p className="text-sm font-bold text-gray-900">{event.dateLabel}</p>
              <p className="text-xs text-gray-600">{event.times}</p>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900">
                {event.name} <span className="text-xs font-medium text-gray-500">· {event.kindLabel}</span>
              </p>
              <a href={event.mapUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-emerald-800 hover:underline inline-flex items-start gap-1">
                <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
                {event.address}, {event.city}
              </a>
              {event.note && <p className="text-xs text-gray-700 mt-1">{event.note}</p>}
            </div>
          </li>
        ))}
      </ul>
      {ordersAhead && (
        <p className="text-xs text-emerald-900 bg-emerald-50 border border-emerald-100 rounded-lg p-2 flex items-start gap-1.5">
          <ShoppingBag className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
          Order ahead from their listings above and choose a market pickup at checkout. Your order will be waiting at their
          stand.
        </p>
      )}
    </section>
  );
}
