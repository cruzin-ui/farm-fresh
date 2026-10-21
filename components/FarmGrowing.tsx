'use client';

import React, { useEffect, useState } from 'react';
import { Sprout } from 'lucide-react';

// The emoji shown for each category.
const EMOJI: Record<string, string> = {
  Vegetables: '🥕',
  'Fruits & Berries': '🍓',
  'Herbs & Spices': '🌿',
  Mushrooms: '🍄',
  'Honey & Jam': '🍯',
  'Fresh Eggs': '🥚',
  'Cut Flowers': '💐',
  'Plants & Seedlings': '🌱',
};

// "What we're growing" on a farm's page: crops in the ground and roughly when
// each should be ready. Nothing shows when the farm hasn't added any.
export default function FarmGrowing({ farmerId, farmName }: { farmerId: string; farmName: string }) {
  const [crops, setCrops] = useState<{ id: string; name: string; variety: string; category: string; note: string; expected: string }[]>([]);

  useEffect(() => {
    fetch('/api/growing/public', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ farmerId }),
    })
      .then((res) => res.json())
      .then((json) => setCrops(json.crops || []))
      .catch(() => setCrops([]));
  }, [farmerId]);

  if (crops.length === 0) return null;
  return (
    <section className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm mb-8 space-y-3">
      <div>
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <Sprout className="w-5 h-5 text-emerald-600" /> What {farmName} is growing
        </h2>
        <p className="text-xs text-gray-500">Coming soon. Times are the farm&apos;s best guess; favorite the farm to keep an eye on it.</p>
      </div>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {crops.map((crop) => (
          <li key={crop.id} className="flex items-start gap-3 p-3 rounded-xl border border-emerald-100 bg-emerald-50/40">
            <span className="text-2xl leading-none" aria-hidden="true">
              {EMOJI[crop.category] || '🧺'}
            </span>
            <div className="min-w-0 text-sm">
              <p className="font-bold text-gray-900">
                {crop.name}
                {crop.variety && <span className="font-normal text-gray-600"> · {crop.variety}</span>}
              </p>
              <p className="text-xs font-semibold text-emerald-800">{crop.expected}</p>
              {crop.note && <p className="text-xs text-gray-600 mt-0.5">{crop.note}</p>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
