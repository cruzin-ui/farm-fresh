'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Sprout, MapPin, Calendar, Search, ShoppingBag, User } from 'lucide-react';
import Link from 'next/link';

export default function BrowsePage() {
  const [listings, setListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  useEffect(() => {
    fetchListings();
  }, []);

  const fetchListings = async () => {
    setLoading(true);

    // Using left join syntax on seller_profiles so listings appear even before profile setup
    const { data, error } = await supabase
      .from('produce_listings')
      .select('*, seller_profiles!left(id, farm_name, location)')
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setListings(data);
    }
    setLoading(false);
  };

  const filteredListings = listings.filter((item) => {
    const matchesSearch =
      item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.location_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.zip_code?.includes(searchTerm);
    const matchesCategory = selectedCategory === 'All' || item.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header & Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 flex items-center gap-2">
            <Sprout className="w-8 h-8 text-green-600" /> Browse Local Harvests
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Connect directly with growers in your neighborhood for farm-fresh produce.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search crop or zip code..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Category Filter Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-4 mb-6">
        {['All', 'Vegetables', 'Fruits & Berries', 'Herbs & Spices', 'Honey & Jam'].map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
              selectedCategory === cat
                ? 'bg-green-600 text-white shadow-sm'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Listings Grid */}
      {loading ? (
        <div className="text-center py-20 text-gray-500">Loading available fresh produce...</div>
      ) : filteredListings.length === 0 ? (
        <div className="text-center py-20 bg-gray-50 rounded-2xl border border-dashed border-gray-200 text-gray-500">
          <ShoppingBag className="mx-auto h-12 w-12 text-gray-400 mb-2" />
          <p className="font-semibold text-gray-700">No produce listings found matching your search.</p>
          <p className="text-xs text-gray-400 mt-1">Try searching a different keyword or category.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {filteredListings.map((item) => (
            <div
              key={item.id}
              className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col justify-between hover:shadow-md transition-shadow"
            >
              <div>
                {item.image_url ? (
                  <img src={item.image_url} alt={item.title} className="w-full h-48 object-cover" />
                ) : (
                  <div className="w-full h-48 bg-green-50 flex items-center justify-center text-green-700">
                    <Sprout className="w-12 h-12 opacity-50" />
                  </div>
                )}
                <div className="p-5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-green-800 bg-green-100 px-2.5 py-0.5 rounded-full">
                      {item.category}
                    </span>
                    <span className="text-xs font-semibold text-gray-500 flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-green-600" /> {item.location_name}
                    </span>
                  </div>

                  <h3 className="text-lg font-bold text-gray-900">{item.title}</h3>

                  {item.seller_profiles?.farm_name ? (
                    <Link
                      href={`/sellers/${item.seller_profiles.id}`}
                      className="text-xs text-green-700 font-semibold hover:underline flex items-center gap-1 mt-0.5 mb-2"
                    >
                      <User className="w-3 h-3" /> {item.seller_profiles.farm_name}
                    </Link>
                  ) : (
                    <p className="text-xs text-gray-400 mt-0.5 mb-2">Local Grower</p>
                  )}

                  <div className="flex items-baseline justify-between mt-4">
                    <span className="text-xl font-extrabold text-gray-900">
                      ${item.price_per_unit.toFixed(2)}
                      <span className="text-xs font-normal text-gray-500"> / {item.unit_type}</span>
                    </span>
                    <span className="text-xs font-semibold text-gray-600 bg-gray-100 px-2.5 py-1 rounded-lg">
                      {item.available_quantity} {item.unit_type} left
                    </span>
                  </div>

                  <p className="text-xs text-gray-500 flex items-center gap-1 mt-3">
                    <Calendar className="w-3.5 h-3.5" /> Ready: {item.harvest_ready_date}
                  </p>
                </div>
              </div>

              <div className="p-5 pt-0">
                <Link
                  href={`/checkout?item=${item.id}`}
                  className="w-full inline-block text-center bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-4 rounded-xl text-xs transition-colors shadow-sm"
                >
                  Buy Produce
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}