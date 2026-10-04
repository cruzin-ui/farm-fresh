'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Search, MapPin, Calendar, ShoppingBag, Sprout, User } from 'lucide-react';
import Link from 'next/link';

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
  { name: 'Pickles', emoji: '🥒', keywords: ['pickle'] },
  { name: 'Salsa & Sauces', emoji: '🌶️', keywords: ['salsa', 'sauce'] },
];

// Which tiles to show under each category button. "All" shows none — the
// entry here is only a fallback so lookups always succeed.
const TILE_GROUPS: Record<string, { heading: string; types: typeof VEGETABLE_TYPES }> = {
  All: { heading: 'Shop by Vegetable', types: VEGETABLE_TYPES },
  Vegetables: { heading: 'Shop by Vegetable', types: VEGETABLE_TYPES },
  'Fruits & Berries': { heading: 'Shop by Fruit', types: FRUIT_TYPES },
  'Herbs & Spices': { heading: 'Shop by Herb', types: HERB_TYPES },
  'Honey & Jam': { heading: 'Shop Honey, Jam & More', types: PANTRY_TYPES },
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
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedType, setSelectedType] = useState<string | null>(null);

  useEffect(() => {
    fetchListings();
  }, []);

  const fetchListings = async () => {
    setLoading(true);

    // Only fetch listings that still have stock, so sold-out posts
    // disappear from Browse entirely rather than showing a "Sold Out" badge.
    const { data: listingsData, error: listingsError } = await supabase
      .from('produce_listings')
      .select('*')
      .gt('available_quantity', 0)
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
        .select('id, farm_name, avatar_url, location')
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

    const merged = (listingsData || []).map((item) => ({
      ...item,
      seller_profiles: item.farmer_id ? sellerMap[item.farmer_id] || null : null,
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

    return matchesSearch && matchesCategory && matchesVegetable;
  });

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

        <div className="flex gap-2 overflow-x-auto pb-1">
          {['All', 'Vegetables', 'Fruits & Berries', 'Herbs & Spices', 'Honey & Jam'].map(
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
        <div className="text-center py-16 text-gray-400 text-sm">
          Loading harvest listings...
        </div>
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
          {filteredListings.map((item) => {
            const availableQty = Number(item.available_quantity ?? 0);

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
                    <img
                      src={item.image_url}
                      alt={item.title}
                      loading="lazy"
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
                        <img
                          src={item.seller_profiles.avatar_url}
                          alt={item.seller_profiles?.farm_name || 'Farm'}
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
                        {item.tags.slice(0, 3).map((tag: string) => (
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
                      <span>{item.location_name || item.seller_profiles?.location || 'Phoenix, AZ'}</span>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                      <Calendar className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                      <span>
                        Harvest date: {item.harvest_ready_date || 'Available Now'}
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

                    <Link
                      href={`/checkout?id=${item.id}`}
                      className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-3 md:py-2.5 rounded-xl shadow-sm transition-colors"
                    >
                      <ShoppingBag className="w-3.5 h-3.5" /> Reserve
                    </Link>
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