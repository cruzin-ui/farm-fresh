'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Package } from 'lucide-react';
import { describeFrequency, formatBoxDate } from '@/lib/csaSchedule';

type Plan = {
  id: string;
  name: string;
  description: string;
  cost: { totalCents: number; priceCents: number };
  frequency: string;
  pickupWeekday: number;
  pickupWindow: string;
  seasonEnd: string;
  firstBox: string | null;
  spotsLeft: number | null;
  closedReason: string | null;
};

// A farm's CSA farm shares, on its farm page. Shows nothing for a farm that
// doesn't run one.
export default function FarmCsaPlans({ farmId }: { farmId: string }) {
  const [plans, setPlans] = useState<Plan[]>([]);

  useEffect(() => {
    fetch('/api/csa/plans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ farmId }),
    })
      .then((res) => res.json())
      .then((json) => setPlans(json.plans || []))
      .catch(() => setPlans([]));
  }, [farmId]);

  if (plans.length === 0) return null;

  return (
    <div className="mb-12">
      <h2 className="text-2xl font-bold text-gray-900 mb-1 flex items-center gap-2">
        <Package className="w-6 h-6 text-green-600" /> Farm Share (CSA)
      </h2>
      <p className="text-sm text-gray-600 mb-4">
        A box of whatever is best that week, on a regular day. Pay per box; skip, pause or cancel online any time.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {plans.map((plan) => (
          <div key={plan.id} className="bg-white border border-emerald-200 rounded-2xl p-5 shadow-sm flex flex-col gap-3">
            <div>
              <h3 className="text-lg font-bold text-gray-900">{plan.name}</h3>
              <p className="text-sm text-gray-600">
                {describeFrequency({ pickup_weekday: plan.pickupWeekday, frequency: plan.frequency })}
                {plan.pickupWindow ? `, ${plan.pickupWindow}` : ''} · until {formatBoxDate(plan.seasonEnd)}
              </p>
            </div>
            <p className="text-sm text-gray-700 line-clamp-4 whitespace-pre-line">{plan.description}</p>
            <div className="mt-auto flex items-end justify-between gap-3">
              <p className="text-sm">
                <span className="text-xl font-extrabold text-gray-900">${(plan.cost.priceCents / 100).toFixed(2)}</span>
                <span className="text-gray-600"> per box</span>
                <span className="block text-xs text-gray-500">
                  ${(plan.cost.totalCents / 100).toFixed(2)} with service fee
                </span>
              </p>
              {plan.closedReason ? (
                <span className="text-xs font-semibold text-gray-500 text-right">{plan.closedReason}</span>
              ) : (
                <Link
                  href={`/csa/${plan.id}`}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm"
                >
                  Join
                </Link>
              )}
            </div>
            {!plan.closedReason && plan.spotsLeft != null && plan.spotsLeft <= 10 && (
              <p className="text-xs font-semibold text-amber-800">
                {plan.spotsLeft} spot{plan.spotsLeft === 1 ? '' : 's'} left
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
