'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Sprout, Pause, Play } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { fetchSuspendedSellerIds } from '@/lib/suspendedSellers';
import { LISTING_CATEGORIES } from '@/lib/categories';
import Photo from '@/components/Photo';

const MAX_LISTINGS = 12;
// How fast the strip drifts on its own, in pixels per second.
const DRIFT_SPEED = 45;
// How long after the visitor lets go before the strip starts drifting again.
const RESUME_DELAY_MS = 2500;

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
// in a continuous loop. It is a real scrolling row, so visitors can also swipe
// it (touch), drag it (mouse) or scroll it sideways (trackpad) in either
// direction. It stops drifting while someone is interacting with it, with the
// pause button, and for visitors who have asked their device to reduce motion.
export default function FreshListingsWheel() {
  const [listings, setListings] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [paused, setPaused] = useState(false);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(false);
  // True while the visitor is touching, dragging, hovering or tabbing through the strip.
  const holdRef = useRef(false);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragRef = useRef<{ startX: number; startScroll: number; moved: boolean } | null>(null);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    async function fetchListings() {
      const { data: listingsData } = await supabase
        .from('produce_listings')
        .select('id, title, variety, price_per_unit, unit_type, image_url, farmer_id, location_name')
        .gte('available_quantity', 1)
        .in('category', LISTING_CATEGORIES)
        .order('created_at', { ascending: false })
        .limit(60);

      const farmerIds = [...new Set((listingsData || []).map((l) => l.farmer_id).filter(Boolean))];

      const { data: sellers } = farmerIds.length
        ? await supabase
            .from('seller_profiles')
            .select('id, farm_name, stripe_onboarding_complete')
            .in('id', farmerIds)
        : { data: [] as any[] };

      const farmNameById = new Map((sellers || []).map((s) => [s.id, s.farm_name]));
      // Listings stay hidden until their farmer has finished payout setup,
      // since nobody can buy them before then.
      const suspended = await fetchSuspendedSellerIds(supabase, farmerIds);
      const payoutsReady = new Set(
        (sellers || []).filter((s) => s.stripe_onboarding_complete && !suspended.has(s.id)).map((s) => s.id)
      );
      const chosen = takeTurns((listingsData || []).filter((l) => payoutsReady.has(l.farmer_id)));

      setListings(chosen.map((l) => ({ ...l, farm_name: farmNameById.get(l.farmer_id) || 'Local Farm' })));
      setLoaded(true);
    }

    fetchListings();
  }, []);

  // The drift. The row holds the cards twice, so whenever the scroll position
  // passes the halfway point it jumps back by half (and forward by half when
  // swiped past the start) — the two halves look identical, so it's seamless.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || !loaded || listings.length === 0) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let frame = 0;
    let last = performance.now();
    let carry = 0;

    const step = (now: number) => {
      const elapsed = Math.min(now - last, 100);
      last = now;

      const half = scroller.scrollWidth / 2;

      if (!reduceMotion && !pausedRef.current && !holdRef.current) {
        carry += (DRIFT_SPEED * elapsed) / 1000;
        const whole = Math.floor(carry);
        if (whole >= 1) {
          scroller.scrollLeft += whole;
          carry -= whole;
        }
      }

      if (half > 0) {
        if (scroller.scrollLeft >= half) scroller.scrollLeft -= half;
        else if (scroller.scrollLeft <= 0 && holdRef.current) scroller.scrollLeft += half;
      }

      frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [loaded, listings.length]);

  useEffect(() => {
    return () => {
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    };
  }, []);

  const hold = () => {
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    holdRef.current = true;
  };

  const release = () => {
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = setTimeout(() => {
      holdRef.current = false;
    }, RESUME_DELAY_MS);
  };

  // Mouse users can drag the strip. (Touch and trackpads scroll it natively.)
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || !scrollerRef.current) return;
    dragRef.current = { startX: e.clientX, startScroll: scrollerRef.current.scrollLeft, moved: false };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || !scrollerRef.current) return;

    const delta = e.clientX - drag.startX;
    if (Math.abs(delta) > 5) drag.moved = true;
    if (drag.moved) scrollerRef.current.scrollLeft = drag.startScroll - delta;
  };

  const endDrag = () => {
    // Keep `moved` readable for the click that follows a drag, then clear it.
    const drag = dragRef.current;
    if (drag) setTimeout(() => (dragRef.current = null), 0);
  };

  // A drag that ends on a card shouldn't open that card's listing.
  const handleClickCapture = (e: React.MouseEvent<HTMLDivElement>) => {
    if (dragRef.current?.moved) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

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
      draggable={false}
      // The repeated copies exist only to make the loop seamless.
      aria-hidden={hidden || undefined}
      tabIndex={hidden ? -1 : undefined}
      className="mr-4 w-56 shrink-0 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden text-left hover:shadow-md transition-shadow select-none"
    >
      <div className="h-36 bg-emerald-50 flex items-center justify-center overflow-hidden">
        {item.image_url ? (
          <Photo src={item.image_url} alt="" sizes="240px" draggable={false} className="w-full h-full object-cover" />
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
        <div
          ref={scrollerRef}
          className="wheel cursor-grab active:cursor-grabbing"
          onMouseEnter={hold}
          onMouseLeave={() => {
            endDrag();
            release();
          }}
          onTouchStart={hold}
          onTouchEnd={release}
          onTouchCancel={release}
          onFocus={hold}
          onBlur={release}
          onWheel={() => {
            hold();
            release();
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          onClickCapture={handleClickCapture}
        >
          <div className="wheel-track">
            {filled.map((item, index) => renderCard(item, `a-${index}`, index >= listings.length))}
            {filled.map((item, index) => renderCard(item, `b-${index}`, true))}
          </div>
        </div>
      )}
    </section>
  );
}
