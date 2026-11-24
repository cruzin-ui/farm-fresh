'use client';

import { useEffect, useState } from 'react';
import { Truck } from 'lucide-react';
import { EGG_CATEGORY } from '@/lib/delivery';

type Delivery = { summary: string; note: string; deliversEggs: boolean };

// "This farm delivers: within 10 miles · Sat, 9:00 am – 12:00 pm · $5.00",
// on a farm page or listing, when the farm delivers. On a listing, says when
// that item is pickup only (marked so, or eggs from a farm that doesn't
// deliver eggs). Shows nothing for a farm that doesn't deliver.
export default function FarmDeliveryNote({
  farmerId,
  category,
  pickupOnly,
  row = false,
}: {
  farmerId: string;
  category?: string | null;
  pickupOnly?: boolean;
  // One row of the listing's "getting it" list (a <dl>).
  row?: boolean;
}) {
  const [delivery, setDelivery] = useState<Delivery | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/delivery?farmerId=${encodeURIComponent(farmerId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => !cancelled && setDelivery(json?.delivery || null))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [farmerId]);

  if (!delivery) return null;
  const notThisOne = pickupOnly || (category === EGG_CATEGORY && !delivery.deliversEggs);

  if (row) {
    return (
      <div className="flex items-start gap-3 p-4">
        <Truck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
        <div>
          <dt className="text-sm font-bold text-gray-900">{notThisOne ? 'Delivery' : 'Or have it delivered'}</dt>
          <dd className="text-xs text-gray-600">
            {notThisOne ? 'This farm delivers, but this item is pickup only.' : delivery.summary.replace(/^Delivers within/, 'Within')}
          </dd>
          {!notThisOne && delivery.note && <dd className="text-xs text-gray-500 mt-0.5">{delivery.note}</dd>}
        </div>
      </div>
    );
  }

  return (
    <p className="text-sm text-blue-950 bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-start gap-2">
      <Truck className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" aria-hidden="true" />
      <span>
        <strong>This farm delivers.</strong> {delivery.summary}.{delivery.note ? ` ${delivery.note}` : ''}
        {notThisOne ? (
          <span className="block font-semibold mt-0.5">This item is pickup only.</span>
        ) : (
          <span className="block text-xs mt-0.5">Choose delivery and a date at checkout.</span>
        )}
      </span>
    </p>
  );
}
