'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Sprout, Pause, Play } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';

const MAX_LISTINGS = 12;

// One listing per farm first, then each farm's second, and so on — the same
// take-turns idea as Browse, so one farm can't fill the whole strip.
function takeTurns(listings: any[]) {
  const byFarm = new Map<string, any[]>();
  for (const item of listings) {
    const farmerId = item.farmer_id || 'unknown';
    byFarm.set(farmerId, [...(byFarm.get(farmerId) || []), item]);
  }

  const farms = [...byFarm.values()];
  const ordered: any[] = [];
  for (let round = 0; farms.some((items) => round < items.length); round++) {
    for (const items of farms) {
      if (round < items.length) ordered.push(items[round]);
    }
  }
  return ordered.slice(0, MAX_LISTINGS);
}

// A strip of current listings on the home page that drifts from right to left
// in a continuous loop. It pauses on hover, on keyboard focus and with the
// pause button, and doesn't move at all for visitors who have asked their
// device to reduce motion (they get a row they can scroll themselves).
export default function FreshListingsWheel() {
  const [listings, setListings] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    async function fetchListings() {
      const { data: listingsData } = await supabase
        .from('produce_listings')
        .select('id, title, variety, price_per_unit, unit_type, image_url, farmer_id, location_name')
        .gte('available_quantity', 1)
        .order('created_at', { ascending: false })
        .limit(60);

      const chosen = takeTurns(listingsData || []);
      const farmerIds = [...new Set(chosen.map((l) => l.farmer_id).filter(Boolean))];

      const { data: sellers } = farmerIds.length
        ? await supabase.from('seller_profiles').select('id, farm_name').in('id', farmerIds)
        : { data: [] as any[] };

      const farmNameById = new Map((sellers || []).map((s) => [s.id, s.farm_name]));

      setListings(chosen.map((l) => ({ ...l, farm_name: farmNameById.get(l.farmer_id) || 'Local Farm' })));
      setLoaded(true);
    }

    fetchListings();
  }, []);

  // Nothing on sale yet: leave the section out rather than show an empty strip.
  if (loaded && listings.length === 0) return null;

  // Repeat the listings until there are enough cards to fill a wide screen,
  // then render that set twice so the loop has no visible seam.
  const filled: any[] = [];
  while (listings.length > 0 && filled.length < 8) filled.push(...listings);

  const renderCard = (item: any, key: string, hidden: boolean) => (
    <Link
      key={key}
      href={`/listings/${item.id}`}
      // The second copy exists only to make the loop seamless.
      aria-hidden={hidden || undefined}
      tabIndex={hidden ? -1 : undefined}
      className="mr-4 w-56 shrink-0 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden text-left hover:shadow-md transition-shadow"
    >
      <div className="h-36 bg-emerald-50 flex items-center justify-center overflow-hidden">
        {item.image_url ? (
          <img src={item.image_url} alt="" loading="lazy" className="w-full h-full object-cover" />
        ) : (
          <Sprout className="w-10 h-10 text-emerald-700/40" aria-hidden="true" />
        )}
      </div>
      <div className="p-3">
        <p className="text-sm font-bold text-gray-900 truncate">
          {item.title}
          {item.variety ? ` · ${item.variety}` : ''}
        </p>
        <p className="text-xs text-gray-600 truncate">{item.farm_name}</p>
        <p className="text-sm font-black text-emerald-800 mt-1">
          ${Number(item.price_per_unit || 0).toFixed(2)}
          <span className="text-xs font-medium text-gray-500"> / {item.unit_type || 'lb'}</span>
        </p>
      </div>
    </Link>
  );

  return (
    <section aria-label="Fresh listings this week" className="mt-12">
      <div className="flex items-center justify-between gap-3 mb-4 max-w-5xl mx-auto px-6">
        <h2 className="text-xl sm:text-3xl font-bold text-gray-900 whitespace-nowrap">Fresh This Week</h2>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setPaused((current) => !current)}
            aria-pressed={paused}
            className="wheel-pause inline-flex items-center gap-1.5 text-xs font-semibold text-gray-600 hover:text-emerald-800"
          >
            {paused ? <Play className="w-3.5 h-3.5" aria-hidden="true" /> : <Pause className="w-3.5 h-3.5" aria-hidden="true" />}
            {paused ? 'Play' : 'Pause'}
          </button>
          <Link href="/browse" className="text-sm font-semibold text-emerald-800 underline whitespace-nowrap">
            See all
          </Link>
        </div>
      </div>

      {!loaded ? (
        <div className="h-60" aria-hidden="true" />
      ) : (
        <div className="wheel" data-paused={paused}>
          <div
            className="wheel-track"
            // Slower when there are more cards, so the speed across the screen stays the same.
            style={{ ['--wheel-duration' as string]: `${filled.length * 5}s` }}
          >
            {filled.map((item, index) => renderCard(item, `a-${index}`, index >= listings.length))}
            {filled.map((item, index) => renderCard(item, `b-${index}`, true))}
          </div>
        </div>
      )}
    </section>
  );
}
