'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Sprout, ShoppingBag, Calendar, PlusCircle, LogOut } from 'lucide-react';
import Link from 'next/link';

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<'seller' | 'buyer'>('seller');
  const [user, setUser] = useState<any>(null);
  const [myListings, setMyListings] = useState<any[]>([]);
  const [myOrders, setMyOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      window.location.href = '/login?redirectTo=/dashboard';
      return;
    }

    setUser(user);

    // Fetch Seller Listings
    const { data: listings } = await supabase
      .from('produce_listings')
      .select('*')
      .eq('farmer_id', user.id)
      .order('created_at', { ascending: false });

    // Fetch Buyer Orders
    const { data: orders } = await supabase
      .from('orders')
      .select('*, produce_listings(title, price_per_unit, unit_type, pickup_instructions)')
      .eq('buyer_id', user.id)
      .order('created_at', { ascending: false });

    setMyListings(listings || []);
    setMyOrders(orders || []);
    setLoading(false);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = '/';
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Dashboard Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 pb-6 border-b border-gray-200">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900">Seller Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">
            Welcome back, <span className="font-semibold text-gray-800">{user?.email}</span>
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/sell"
            className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors shadow-sm"
          >
            <PlusCircle className="w-4 h-4" /> Post Harvest Listing
          </Link>
          <button
            onClick={handleSignOut}
            className="inline-flex items-center gap-1.5 border border-gray-300 hover:bg-gray-50 text-gray-700 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            <LogOut className="w-4 h-4" /> Sign Out
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-6">
        <button
          onClick={() => setActiveTab('seller')}
          className={`pb-3 px-4 font-semibold text-sm border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === 'seller'
              ? 'border-green-600 text-green-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Sprout className="w-4 h-4" /> My Active Harvest Listings ({myListings.length})
        </button>
        <button
          onClick={() => setActiveTab('buyer')}
          className={`pb-3 px-4 font-semibold text-sm border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === 'buyer'
              ? 'border-green-600 text-green-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <ShoppingBag className="w-4 h-4" /> My Produce Purchases ({myOrders.length})
        </button>
      </div>

      {loading && (
        <div className="py-12 text-center text-gray-400">Loading dashboard...</div>
      )}

      {/* Seller Tab Content */}
      {!loading && activeTab === 'seller' && (
        <div>
          {myListings.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-xl border border-dashed border-gray-300">
              <Sprout className="mx-auto h-12 w-12 text-gray-400 mb-3" />
              <h3 className="text-base font-semibold text-gray-900">No Harvest Listings Posted Yet</h3>
              <p className="text-xs text-gray-500 mt-1 mb-6">
                Turn your extra garden yields or farm crop harvest into income.
              </p>
              <Link
                href="/sell"
                className="inline-flex items-center gap-2 bg-green-600 text-white font-semibold py-2.5 px-5 rounded-lg text-sm shadow-sm hover:bg-green-700"
              >
                <PlusCircle className="w-4 h-4" /> Create Your First Produce Listing
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {myListings.map((item) => (
                <div key={item.id} className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-xs font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded">
                        {item.category}
                      </span>
                      <span className="text-xs font-semibold text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full">
                        {item.status}
                      </span>
                    </div>

                    <h3 className="text-lg font-bold text-gray-900">{item.title}</h3>
                    
                    <p className="text-sm font-semibold text-gray-800 mt-1">
                      ${item.price_per_unit.toFixed(2)} / {item.unit_type}
                    </p>

                    <p className="text-xs text-gray-500 mt-2 line-clamp-2">
                      {item.description || 'No description provided.'}
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" /> Ready: {item.harvest_ready_date}
                    </span>
                    <span>{item.available_quantity} {item.unit_type} left</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Buyer Tab Content */}
      {!loading && activeTab === 'buyer' && (
        <div>
          {myOrders.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-xl border border-dashed border-gray-300">
              <ShoppingBag className="mx-auto h-12 w-12 text-gray-400 mb-3" />
              <h3 className="text-base font-semibold text-gray-900">No Purchases Found</h3>
              <p className="text-xs text-gray-500 mt-1 mb-4">You haven't reserved produce from any local growers yet.</p>
              <Link href="/browse" className="text-sm text-green-600 font-semibold hover:underline">
                Browse Fresh Produce Nearby &rarr;
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {myOrders.map((order) => (
                <div key={order.id} className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <span className="text-xs font-bold text-amber-800 bg-amber-100 px-2.5 py-1 rounded-full uppercase tracking-wider">
                      {order.status}
                    </span>
                    <h3 className="text-lg font-bold text-gray-900 mt-2">{order.produce_listings?.title}</h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Reserved Quantity: {order.reserved_quantity} {order.produce_listings?.unit_type}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-extrabold text-gray-900">${order.authorized_amount}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}