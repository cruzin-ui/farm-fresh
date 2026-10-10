'use client';

import React, { useState, useEffect } from 'react';
import { pickupAvailability } from '@/lib/dates';
import { CARD_LISTING_TAGS } from '@/lib/listingTags';
import { supabase } from '@/lib/supabaseClient';
import { Search, MapPin, Calendar, ShoppingBag, Sprout, User } from 'lucide-react';
import Link from 'next/link';
import AddToCartButton from '@/components/AddToCartButton';
import Photo from '@/components/Photo';
import { ListingGridSkeleton } from '@/components/Skeletons';
import { LISTING_CATEGORIES } from '@/lib/categories';
import { geocodeZip, milesBetween, type Coordinates } from '@/lib/geo';

const RADIUS_OPTIONS = [10, 25, 50, 100];
// Where the buyer's zip code is remembered between visits (this browser only).
const ZIP_STORAGE_KEY = 'ffd-near-zip';

// "Shop by vegetable" tiles. Listings have free-text crop names, so a listing
// belongs to a tile when its title or variety contains one of the keywords (and none of
// the excluded phrases — e.g. sweet potatoes aren't potatoes).
const VEGETABLE_TYPES: { name: string; emoji: string; keywords: string[]; exclude?: string[] }[] = [
  { name: 'Potatoes', emoji: '🥔', keywords: ['potato', 'russet', 'yukon'], exclude: ['sweet potato'] },
  { name: 'Tomatoes', emoji: '🍅', keywords: ['tomato'] },
  { name: 'Onions', emoji: '🧅', keywords: ['onion', 'shallot', 'scallion', 'leek'] },
  { name: 'Carrots', emoji: '🥕', keywords: ['carrot'] },
  { name: 'Lettuce & Greens', emoji: '🥬', keywords: ['lettuce', 'spinach', 'kale', 'greens', 'chard', 'arugula', 'cabbage'] },
  { name: 'Peppers', emoji: '🫑', keywords: ['pepper', 'chile', 'chili', 'jalape'] },
  { name: 'Cucumbers', emoji: '🥒', keywords: ['cucumber'] },
  { name: 'Broccoli & Cauliflower', emoji: '🥦', keywords: ['broccoli', 'cauliflower'] },
  { name: 'Corn', emoji: '🌽', keywords: ['corn'] },
  { name: 'Squash & Pumpkins', emoji: '🎃', keywords: ['squash', 'zucchini', 'pumpkin'] },
  { name: 'Garlic', emoji: '🧄', keywords: ['garlic'] },
  { name: 'Sweet Potatoes', emoji: '🍠', keywords: ['sweet potato', 'yam'] },
];

const FRUIT_TYPES: typeof VEGETABLE_TYPES = [
  { name: 'Apples', emoji: '🍎', keywords: ['apple'], exclude: ['pineapple'] },
  { name: 'Strawberries', emoji: '🍓', keywords: ['strawberr'] },
  { name: 'Berries', emoji: '🫐', keywords: ['blueberr', 'blackberr', 'raspberr', 'mulberr', 'boysenberr'] },
  { name: 'Peaches & Nectarines', emoji: '🍑', keywords: ['peach', 'nectarine', 'apricot', 'plum'] },
  { name: 'Citrus', emoji: '🍊', keywords: ['orange', 'lemon', 'lime', 'grapefruit', 'tangerine', 'mandarin', 'citrus'] },
  { name: 'Grapes', emoji: '🍇', keywords: ['grape'], exclude: ['grapefruit'] },
  { name: 'Melons', emoji: '🍉', keywords: ['melon', 'cantaloupe', 'honeydew'] },
  { name: 'Cherries', emoji: '🍒', keywords: ['cherr'], exclude: ['tomato'] },
  { name: 'Pears', emoji: '🍐', keywords: ['pear'] },
  { name: 'Avocados', emoji: '🥑', keywords: ['avocado'] },
];

// There are no emoji for individual herbs, so most share a generic leaf.
const HERB_TYPES: typeof VEGETABLE_TYPES = [
  { name: 'Basil', emoji: '🌿', keywords: ['basil'] },
  { name: 'Cilantro', emoji: '🌿', keywords: ['cilantro', 'coriander'] },
  { name: 'Mint', emoji: '🍃', keywords: ['mint'] },
  { name: 'Rosemary', emoji: '🌿', keywords: ['rosemary'] },
  { name: 'Parsley', emoji: '🌿', keywords: ['parsley'] },
  { name: 'Thyme', emoji: '🌱', keywords: ['thyme'] },
  { name: 'Oregano', emoji: '🌱', keywords: ['oregano', 'marjoram'] },
  { name: 'Dill', emoji: '🌿', keywords: ['dill'] },
  { name: 'Sage', emoji: '🍃', keywords: ['sage'] },
  { name: 'Lavender', emoji: '🌸', keywords: ['lavender'] },
  { name: 'Chiles & Spices', emoji: '🌶️', keywords: ['chile', 'chili', 'pepper', 'spice', 'paprika', 'cumin'] },
];

const PANTRY_TYPES: typeof VEGETABLE_TYPES = [
  { name: 'Honey', emoji: '🍯', keywords: ['honey'], exclude: ['honeycomb', 'honeydew'] },
  { name: 'Honeycomb & Bee Products', emoji: '🐝', keywords: ['honeycomb', 'beeswax', 'pollen', 'propolis'] },
  { name: 'Jam & Jelly', emoji: '🥫', keywords: ['jam', 'jelly', 'preserve', 'marmalade'] },
  { name: 'Syrup', emoji: '🥞', keywords: ['syrup', 'agave'] },
];

const EGG_TYPES: typeof VEGETABLE_TYPES = [
  // Plain "eggs" are assumed to be chicken eggs unless another bird is named.
  { name: 'Chicken Eggs', emoji: '🐔', keywords: ['chicken', 'hen', 'egg'], exclude: ['duck', 'quail', 'goose', 'turkey'] },
  { name: 'Duck Eggs', emoji: '🦆', keywords: ['duck'] },
  { name: 'Quail Eggs', emoji: '🐦', keywords: ['quail'] },
  { name: 'Other Eggs', emoji: '🥚', keywords: ['goose', 'turkey'] },
];

// Which tiles to show under each category button. "All" shows none — the
// entry here is only a fallback so lookups always succeed.
const TILE_GROUPS: Record<string, { heading: string; types: typeof VEGETABLE_TYPES }> = {
  All: { heading: 'Shop by Vegetable', types: VEGETABLE_TYPES },
  Vegetables: { heading: 'Shop by Vegetable', types: VEGETABLE_TYPES },
  'Fruits & Berries': { heading: 'Shop by Fruit', types: FRUIT_TYPES },
  'Herbs & Spices': { heading: 'Shop by Herb', types: HERB_TYPES },
  'Honey & Jam': { heading: 'Shop Honey, Jam & More', types: PANTRY_TYPES },
  'Fresh Eggs': { heading: 'Shop Fresh Eggs', types: EGG_TYPES },
};

function matchesProduceType(item: { title?: string | null; variety?: string | null }, type: (typeof VEGETABLE_TYPES)[number]) {
  const text = `${item.title || ''} ${item.variety || ''}`.toLowerCase();
  if (type.exclude?.some((phrase) => text.includes(phrase))) return false;
  return type.keywords.some((keyword) => text.includes(keyword));
}

// Orders Browse so no farm can crowd the top of the page. Farms take turns:
// every farm's first listing is shown before any farm's second, and so on.
// The order of the farms themselves is shuffled once a day (the same for
// every visitor that day), so posting — or deleting and reposting — doesn't
// move a farm up. Within a farm, listings keep the order they arrive in
// (newest first).
function orderFairly(listings: any[]) {
  const today = new Date().toISOString().slice(0, 10);

  const dailyRank = (farmerId: string) => {
    let hash = 2166136261;
    for (const char of `${today}:${farmerId}`) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  };

  const byFarm = new Map<string, any[]>();
  for (const item of listings) {
    const farmerId = item.farmer_id || 'unknown';
    byFarm.set(farmerId, [...(byFarm.get(farmerId) || []), item]);
  }

  const farms = [...byFarm.entries()]
    .sort(([a], [b]) => dailyRank(a) - dailyRank(b))
    .map(([, items]) => items);

  const ordered: any[] = [];
  for (let round = 0; farms.some((items) => round < items.length); round++) {
    for (const items of farms) {
      if (round < items.length) ordered.push(items[round]);
    }
  }
  return ordered;
}

export default function BrowsePage() {
  const [listings, setListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // "Near me": the buyer's zip code, how far they'll travel, and where that
  // zip code is. `zipCoords` caches lookups for listing zips that have no
  // stored location (listings posted before locations were saved).
  const [nearZip, setNearZip] = useState('');
  const [radius, setRadius] = useState(25);
  const [origin, setOrigin] = useState<Coordinates | null>(null);
  const [zipNotFound, setZipNotFound] = useState(false);
  const [zipCoords, setZipCoords] = useState<Record<string, Coordinates | null>>({});

  // Start from a zip passed in the link (the home page's search box) or the
  // one this visitor used last time.
  useEffect(() => {
    const fromLink = new URLSearchParams(window.location.search).get('zip') || '';
    let remembered = '';
    try {
      remembered = window.localStorage.getItem(ZIP_STORAGE_KEY) || '';
    } catch {}
    const initial = (fromLink || remembered).replace(/\D/g, '').slice(0, 5);
    if (initial) setNearZip(initial);
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (nearZip.length !== 5) {
      setOrigin(null);
      setZipNotFound(false);
      if (nearZip.length === 0) {
        try {
          window.localStorage.removeItem(ZIP_STORAGE_KEY);
        } catch {}
      }
      return;
    }

    geocodeZip(nearZip).then((coordinates) => {
      if (cancelled) return;
      setOrigin(coordinates);
      setZipNotFound(!coordinates);
      if (coordinates) {
        try {
          window.localStorage.setItem(ZIP_STORAGE_KEY, nearZip);
        } catch {}
      }
    });

    return () => {
      cancelled = true;
    };
  }, [nearZip]);

  // Once the buyer has a location, look up any listing zip codes that don't
  // have a stored location yet.
  useEffect(() => {
    if (!origin) return;

    const missing = [
      ...new Set(
        listings
          .filter((l) => l.latitude == null && /^\d{5}/.test(l.zip_code || ''))
          .map((l) => String(l.zip_code).slice(0, 5))
      ),
    ].filter((zip) => !(zip in zipCoords));

    if (missing.length === 0) return;

    Promise.all(missing.map(async (zip) => [zip, await geocodeZip(zip)] as const)).then((results) => {
      setZipCoords((current) => ({ ...current, ...Object.fromEntries(results) }));
    });
  }, [origin, listings, zipCoords]);

  // Miles from the buyer's zip code to a listing's, or null if either is unknown.
  const distanceTo = (item: any): number | null => {
    if (!origin) return null;
    const coordinates: Coordinates | null =
      item.latitude != null && item.longitude != null
        ? { latitude: Number(item.latitude), longitude: Number(item.longitude) }
        : zipCoords[String(item.zip_code || '').slice(0, 5)] || null;
    return coordinates ? milesBetween(origin, coordinates) : null;
  };
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedType, setSelectedType] = useState<string | null>(null);

  useEffect(() => {
    fetchListings();
  }, []);

  const fetchListings = async () => {
    setLoading(true);

    // Only fetch listings with at least one whole unit left (buyers can't
    // order less than one), so sold-out posts
    // disappear from Browse entirely rather than showing a "Sold Out" badge.
    const { data: listingsData, error: listingsError } = await supabase
      .from('produce_listings')
      .select('*')
      .gte('available_quantity', 1)
      // Leaves out anything in a category that is no longer sold here.
      .in('category', LISTING_CATEGORIES)
      .order('created_at', { ascending: false });

    if (listingsError) {
      console.error('Supabase Fetch Error (listings):', listingsError.message);
      setLoading(false);
      return;
    }

    const farmerIds = Array.from(
      new Set((listingsData || []).map((item) => item.farmer_id).filter(Boolean))
    );

    let sellerMap: Record<string, any> = {};

    if (farmerIds.length > 0) {
      const { data: sellersData, error: sellersError } = await supabase
        .from('seller_profiles')
        .select('id, farm_name, avatar_url, location, stripe_onboarding_complete')
        .in('id', farmerIds);

      if (sellersError) {
        console.error('Supabase Fetch Error (sellers):', sellersError.message);
      } else {
        sellerMap = (sellersData || []).reduce((acc, seller) => {
          acc[seller.id] = seller;
          return acc;
        }, {} as Record<string, any>);
      }
    }

    // A listing can't be bought until its farmer can be paid, so it stays
    // hidden from buyers until their payout setup is finished.
    const merged = (listingsData || [])
      .filter((item) => sellerMap[item.farmer_id]?.stripe_onboarding_complete)
      .map((item) => ({
        ...item,
        seller_profiles: sellerMap[item.farmer_id] || null,
      }));

    setListings(orderFairly(merged));
    setLoading(false);
  };

  // The tiles under the category buttons follow the selected category, and
  // count only that category's listings.
  const tileGroup = TILE_GROUPS[selectedCategory] ?? TILE_GROUPS.All;
  const categoryListings =
    selectedCategory === 'All' ? listings : listings.filter((item) => item.category === selectedCategory);

  const filteredListings = listings.filter((item) => {
    const matchesSearch =
      item.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.variety?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.location_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.seller_profiles?.farm_name?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory =
      selectedCategory === 'All' || item.category === selectedCategory;

    const produceType = tileGroup.types.find((t) => t.name === selectedType);
    const matchesVegetable = !produceType || matchesProduceType(item, produceType);

    // With a zip code entered, keep listings within the chosen distance.
    // Listings whose location isn't known are kept (and shown last) rather
    // than hidden.
    const distance = distanceTo(item);
    const matchesDistance = !origin || radius === 0 || distance === null || distance <= radius;

    return matchesSearch && matchesCategory && matchesVegetable && matchesDistance;
  });

  // Closest first when searching by location; otherwise the take-turns order.
  const displayedListings = origin
    ? [...filteredListings].sort((a, b) => (distanceTo(a) ?? Infinity) - (distanceTo(b) ?? Infinity))
    : filteredListings;

  return (
    <div className="space-y-6">
      {/* SEARCH AND CATEGORY BAR */}
      <div className="bg-white p-4 sm:p-6 rounded-2xl border border-emerald-100 shadow-sm space-y-4">
        <div className="relative">
          <Search className="absolute left-4 top-3.5 w-5 h-5 text-gray-400" />
          <input
            type="text"
            aria-label="Search produce by crop, farm name or location"
            placeholder="Search fresh crops, farm name, or location..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
          />
        </div>

        {/* NEAR ME */}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <MapPin className="w-4 h-4 text-emerald-700 shrink-0" aria-hidden="true" />
          <label htmlFor="browse-near-zip" className="font-semibold text-gray-700">
            Near zip code
          </label>
          <input
            id="browse-near-zip"
            type="text"
            inputMode="numeric"
            autoComplete="postal-code"
            placeholder="85001"
            value={nearZip}
            onChange={(e) => setNearZip(e.target.value.replace(/\D/g, '').slice(0, 5))}
            className="w-24 px-3 py-2 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
          />
          <label htmlFor="browse-radius" className="sr-only">
            Distance
          </label>
          <select
            id="browse-radius"
            value={radius}
            onChange={(e) => setRadius(Number(e.target.value))}
            disabled={!origin}
            className="px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white disabled:bg-gray-100 disabled:text-gray-500"
          >
            {RADIUS_OPTIONS.map((miles) => (
              <option key={miles} value={miles}>
                Within {miles} miles
              </option>
            ))}
            <option value={0}>Any distance</option>
          </select>
          {nearZip && (
            <button
              onClick={() => setNearZip('')}
              className="text-xs font-semibold text-emerald-800 underline"
            >
              Clear
            </button>
          )}
          <span role="status" className="text-xs text-gray-500">
            {zipNotFound
              ? "We couldn't find that zip code."
              : origin
                ? 'Closest listings are shown first.'
                : 'Enter your zip code to see what is closest to you.'}
          </span>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {['All', ...LISTING_CATEGORIES].map(
            (cat) => (
              <button
                key={cat}
                onClick={() => {
                  setSelectedCategory(cat);
                  setSelectedType(null);
                }}
                className={`px-4 py-3 md:py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                  selectedCategory === cat
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {cat}
              </button>
            )
          )}
        </div>
      </div>

      {/* SHOP BY TYPE — only once a category is chosen. With "All" selected the
          page goes straight to the listings. */}
      {selectedCategory !== 'All' && (
      <div>
        <h2 className="text-lg font-extrabold text-gray-900 mb-3">{tileGroup.heading}</h2>
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          {tileGroup.types.map((type) => {
            const count = categoryListings.filter((item) => matchesProduceType(item, type)).length;
            const selected = selectedType === type.name;

            return (
              <button
                key={type.name}
                onClick={() => setSelectedType(selected ? null : type.name)}
                aria-pressed={selected}
                className={`flex flex-col items-center gap-1 p-3 rounded-2xl border text-center transition-all ${
                  selected
                    ? 'bg-emerald-700 border-emerald-700 text-white shadow-md'
                    : count === 0
                      ? 'bg-gray-50 border-dashed border-gray-300 text-gray-600 hover:border-emerald-400'
                      : 'bg-white border-gray-200 text-gray-800 hover:border-emerald-400 hover:shadow-sm'
                }`}
              >
                <span className="text-4xl leading-none" aria-hidden="true">
                  {type.emoji}
                </span>
                <span className="text-xs font-bold leading-tight">{type.name}</span>
                <span className={`text-[10px] font-medium ${selected ? 'text-white' : 'text-gray-500'}`}>
                  {loading ? ' ' : count === 0 ? 'None right now' : `${count} listing${count === 1 ? '' : 's'}`}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-extrabold text-gray-900">
          {selectedType ? `${selectedType} Available Now` : 'Fresh Harvest Available Now'}
        </h2>
        {selectedType && (
          <button
            onClick={() => setSelectedType(null)}
            className="text-xs font-semibold text-emerald-700 hover:underline"
          >
            Show all produce
          </button>
        )}
      </div>

      {/* LISTINGS GRID */}
      {loading ? (
        <ListingGridSkeleton />
      ) : filteredListings.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-gray-200">
          <Sprout className="mx-auto h-12 w-12 text-emerald-400 mb-2" />
          <h3 className="text-base font-bold text-gray-800">No Produce Found</h3>
          <p className="text-xs text-gray-500 mt-1">
            Check back soon or post a harvest listing from your seller dashboard.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {displayedListings.map((item) => {
            const availableQty = Math.floor(Number(item.available_quantity ?? 0));

            return (
              <div
                key={item.id}
                className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col"
              >
                <Link
                  href={`/listings/${item.id}`}
                  className="h-44 bg-emerald-50 relative flex items-center justify-center overflow-hidden"
                >
                  {item.image_url ? (
                    <Photo
                      src={item.image_url}
                      alt={item.title}
                      sizes="(max-width: 767px) 100vw, (max-width: 1023px) 50vw, 33vw"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="text-center text-emerald-700/60 font-semibold text-sm p-4">
                      <Sprout className="w-10 h-10 mx-auto mb-1 opacity-50" />
                      Fresh Local Yield
                    </div>
                  )}
                  <span className="absolute top-3 left-3 bg-white/90 backdrop-blur-md text-emerald-900 text-[10px] font-bold px-2.5 py-1 rounded-full shadow-sm">
                    {item.category || 'Produce'}
                  </span>
                  <span className="absolute top-3 right-3 bg-white/90 backdrop-blur-md text-emerald-900 text-[10px] font-bold px-2.5 py-1 rounded-full shadow-sm">
                    {availableQty} {item.unit_type || 'lbs'} left
                  </span>
                </Link>

                <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                  <div>
                    {/* FARMER BRANDING BADGE */}
                    <Link
                      href={item.farmer_id ? `/sellers/${item.farmer_id}` : '/browse'}
                      className="flex items-center gap-2 mb-2 pb-2 border-b border-gray-100 group"
                    >
                      {item.seller_profiles?.avatar_url ? (
                        <Photo
                          src={item.seller_profiles.avatar_url}
                          alt={item.seller_profiles?.farm_name || 'Farm'}
                          sizes="24px"
                          className="w-6 h-6 rounded-full object-cover border border-emerald-300"
                        />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[10px] font-bold">
                          <User className="w-3.5 h-3.5" />
                        </div>
                      )}
                      <span className="text-xs font-bold text-gray-700 truncate group-hover:text-emerald-700 group-hover:underline">
                        {item.seller_profiles?.farm_name || 'Local Farm'}
                      </span>
                    </Link>

                    <h3 className="font-extrabold text-gray-900 text-lg leading-snug">
                      <Link href={`/listings/${item.id}`} className="hover:text-emerald-700">
                        {item.title}
                      </Link>
                    </h3>
                    {item.variety && (
                      <p className="text-xs font-semibold text-gray-500 mt-0.5">Variety: {item.variety}</p>
                    )}

                    {Array.isArray(item.tags) && item.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {item.tags.slice(0, CARD_LISTING_TAGS).map((tag: string) => (
                          <span
                            key={tag}
                            className="text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center gap-2 text-xs text-gray-500 mt-2">
                      <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>
                        {item.location_name || item.seller_profiles?.location || 'Phoenix, AZ'}
                        {distanceTo(item) !== null && (
                          <span className="font-semibold text-emerald-800">
                            {' '}
                            · {distanceTo(item)! < 1 ? 'under 1' : Math.round(distanceTo(item)!)} mi away
                          </span>
                        )}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-xs mt-1.5">
                      <Calendar className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                      <span
                        className={`font-bold px-2 py-0.5 rounded-md ${pickupAvailability(item.harvest_ready_date).tagClass}`}
                      >
                        {pickupAvailability(item.harvest_ready_date).label}
                      </span>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
                    <div>
                      <span className="text-2xl font-black text-gray-900">
                        ${Number(item.price_per_unit || 0).toFixed(2)}
                      </span>
                      <span className="text-xs text-gray-500 font-medium">
                        {' '}
                        / {item.unit_type || 'lb'}
                      </span>
                    </div>

                    <AddToCartButton listingId={item.id} available={Number(item.available_quantity ?? 0)} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}