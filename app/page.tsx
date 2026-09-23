'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Search, Filter, Calendar, Tag, Sprout, ChevronRight, AlertCircle } from 'lucide-react';

interface ProduceListing {
  id: string;
  farmer_id: string;
  title: string;
  category: string;
  description: string;
  unit_type: string;
  price_per_unit: number;
  available_quantity: number;
  harvest_ready_date: string;
  harvest_end_date?: string;
  pickup_instructions: string;
  image_url?: string;
  status: string;
  created_at: string;
}

export default function BuyerFeed() {
  const [listings, setListings] = useState<ProduceListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [maxPrice, setMaxPrice] = useState<string>('');
  const [readyFilter, setReadyFilter] = useState<'all' | 'today' | 'upcoming'>('all');

  const categories = [
    'All',
    'Vegetables',
    'Fruits & Berries',
    'Herbs & Spices',
    'Microgreens',
    'Honey & Jam',
    'Eggs & Dairy',
  ];

  useEffect(() => {
    fetchListings();
  }, []);

  const fetchListings = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: supabaseError } = await supabase
        .from('produce_listings')
        .select('*')
        .eq('status', 'active')
        .order('harvest_ready_date', { ascending: true });

      if (supabaseError) throw supabaseError;

      setListings(data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load produce listings.');
    } finally {
      setLoading(false);
    }
  };

  const getHarvestBadge = (readyDateStr: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const readyDate = new Date(readyDateStr + 'T00:00:00');

    if (readyDate.getTime() === today.getTime()) {
      return (
        <span className="bg-emerald-100 text-emerald-800 text-xs font-semibold px-2.5 py-1 rounded-full border border-emerald-200">
          Ready Today
        </span>
      );
    } else if (readyDate < today) {
      return (
        <span className="bg-green-100 text-green-800 text-xs font-semibold px-2.5 py-1 rounded-full border border-green-200">
          Freshly Harvested
        </span>
      );
    } else {
      return (
        <span className="bg-amber-100 text-amber-800 text-xs font-semibold px-2.5 py-1 rounded-full border border-amber-200">
          Ready {readyDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </span>
      );
    }
  };

  const filteredListings = listings.filter((item) => {
    const matchesSearch = 
      item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.description && item.description.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesCategory = selectedCategory === 'All' || item.category === selectedCategory;
    const matchesPrice = maxPrice === '' || item.price_per_unit <= parseFloat(maxPrice);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const itemReadyDate = new Date(item.harvest_ready_date + 'T00:00:00');

    let matchesReady = true;
    if (readyFilter === 'today') {
      matchesReady = itemReadyDate <= today;
    } else if (readyFilter === 'upcoming') {
      matchesReady = itemReadyDate > today;
    }

    return matchesSearch && matchesCategory && matchesPrice && matchesReady;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-8 text-center md:text-left">
        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
          Farm Fresh Direct Marketplace
        </h1>
        <p className="mt-2 text-gray-600">
          Discover locally grown produce harvested straight from neighbor gardens and small farms.
        </p>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-8 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="md:col-span-2 relative">
            <Search className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search heirloom tomatoes, honey, berries..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 focus:outline-none"
            />
          </div>

          <div className="relative">
            <span className="absolute left-3 top-2.5 text-gray-400">$</span>
            <input
              type="number"
              placeholder="Max price per unit"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              className="w-full pl-8 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 focus:outline-none"
            />
          </div>

          <div>
            <select
              value={readyFilter}
              onChange={(e: any) => setReadyFilter(e.target.value)}
              className="w-full py-2 px-3 border rounded-lg focus:ring-2 focus:ring-green-500 focus:outline-none bg-white text-gray-700"
            >
              <option value="all">All Harvest Dates</option>
              <option value="today">Ready Now / Today</option>
              <option value="upcoming">Pre-Orders (Upcoming Harvest)</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-2">
          <Filter className="w-4 h-4 text-gray-400 shrink-0 mr-1" />
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors whitespace-nowrap ${
                selectedCategory === cat
                  ? 'bg-green-700 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="p-4 mb-6 bg-red-50 border border-red-200 text-red-700 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-red-500" />
          <span>{error}</span>
        </div>
      )}

      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div key={n} className="bg-gray-100 animate-pulse h-80 rounded-xl"></div>
          ))}
        </div>
      )}

      {!loading && filteredListings.length === 0 && (
        <div className="text-center py-16 bg-white rounded-xl border border-dashed border-gray-300">
          <Sprout className="mx-auto h-12 w-12 text-gray-400 mb-3" />
          <h3 className="text-lg font-semibold text-gray-900">No Produce Listings Found</h3>
          <p className="text-sm text-gray-500 mt-1">
            Try adjusting your category, price range, or search keywords.
          </p>
        </div>
      )}

      {!loading && filteredListings.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredListings.map((item) => (
            <div
              key={item.id}
              className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow overflow-hidden flex flex-col justify-between"
            >
              <div>
                <div className="relative h-48 bg-gray-100 w-full overflow-hidden">
                  {item.image_url ? (
                    <img
                      src={item.image_url}
                      alt={item.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-gray-400">
                      <Sprout className="w-10 h-10 mb-1" />
                      <span className="text-xs">No Photo Available</span>
                    </div>
                  )}
                  <div className="absolute top-3 left-3">
                    {getHarvestBadge(item.harvest_ready_date)}
                  </div>
                </div>

                <div className="p-4">
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-xs font-semibold text-green-700 uppercase tracking-wider">
                      {item.category}
                    </span>
                    <span className="text-xs text-gray-500 flex items-center gap-1">
                      <Tag className="w-3 h-3" /> {item.available_quantity} {item.unit_type} left
                    </span>
                  </div>

                  <h2 className="text-lg font-bold text-gray-900 line-clamp-1">{item.title}</h2>

                  <p className="text-sm text-gray-600 mt-1 line-clamp-2 min-h-[2.5rem]">
                    {item.description || 'Freshly grown produce available for local pickup.'}
                  </p>

                  <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
                    <div>
                      <span className="text-xl font-extrabold text-gray-900">
                        ${item.price_per_unit.toFixed(2)}
                      </span>
                      <span className="text-xs text-gray-500"> / {item.unit_type}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-gray-500 block flex items-center gap-1 justify-end">
                        <Calendar className="w-3 h-3" /> Ready
                      </span>
                      <span className="text-xs font-medium text-gray-700">
                        {new Date(item.harvest_ready_date + 'T00:00:00').toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 pt-0">
                <a
                  href={`/sell`}
                  className="w-full mt-2 inline-flex items-center justify-center gap-1 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold py-2.5 px-4 rounded-lg transition-colors"
                >
                  Reserve Produce
                  <ChevronRight className="w-4 h-4" />
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}