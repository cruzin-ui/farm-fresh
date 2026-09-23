'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Search, MapPin, Calendar, ShoppingBag, Sprout, User } from 'lucide-react';
import Link from 'next/link';

export default function BrowsePage() {
  const [listings, setListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  useEffect(() => {
    fetchListings();
  }, []);

  const fetchListings = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from('produce_listings')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Supabase Fetch Error:', error.message);
    } else {
      setListings(data || []);
    }

    setLoading(false);
  };

  const filteredListings = listings.filter((item) => {
    const matchesSearch =
      item.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.location_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.farm_name?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory =
      selectedCategory === 'All' || item.category === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-6">
      {/* SEARCH AND CATEGORY BAR */}
      <div className="bg-white p-4 sm:p-6 rounded-2xl border border-emerald-100 shadow-sm space-y-4">
        <div className="relative">
          <Search className="absolute left-4 top-3.5 w-5 h-5 text-gray-400" />
          <input
            type="text"
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
                onClick={() => setSelectedCategory(cat)}
                className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
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
          {filteredListings.map((item) => (
            <div
              key={item.id}
              className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col"
            >
              <div className="h-44 bg-emerald-50 relative flex items-center justify-center overflow-hidden">
                {item.image_url ? (
                  <img
                    src={item.image_url}
                    alt={item.title}
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
              </div>

              <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                <div>
                  {/* FARMER BRANDING BADGE */}
                  <div className="flex items-center gap-2 mb-2 pb-2 border-b border-gray-100">
                    {item.farmer_avatar_url ? (
                      <img
                        src={item.farmer_avatar_url}
                        alt={item.farm_name}
                        className="w-6 h-6 rounded-full object-cover border border-emerald-300"
                      />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[10px] font-bold">
                        <User className="w-3.5 h-3.5" />
                      </div>
                    )}
                    <span className="text-xs font-bold text-gray-700 truncate">
                      {item.farm_name || 'Local Farm'}
                    </span>
                  </div>

                  <h3 className="font-extrabold text-gray-900 text-lg leading-snug">
                    {item.title}
                  </h3>

                  <div className="flex items-center gap-2 text-xs text-gray-500 mt-2">
                    <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>{item.location_name || 'Phoenix, AZ'}</span>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                    <Calendar className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    <span>
                      Ready: {item.harvest_ready_date || 'Available Now'}
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
                    className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-sm transition-colors"
                  >
                    <ShoppingBag className="w-3.5 h-3.5" /> Reserve
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}