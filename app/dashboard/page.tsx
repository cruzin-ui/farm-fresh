'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Sprout, ShoppingBag, Package, Calendar, Tag, CheckCircle2, Clock } from 'lucide-react';
import Link from 'next/link';

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<'buyer' | 'seller'>('buyer');
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

    // Fetch Seller's Listings
    const { data: listings } = await supabase
      .from('produce_listings')
      .select('*')
      .eq('farmer_id', user.id)
      .order('created_at', { ascending: false });

    // Fetch Buyer's Orders
    const { data: orders } = await supabase
      .from('orders')
      .select('*, produce_listings(title, price_per_unit, unit_type, pickup_instructions)')
      .eq('buyer_id', user.id)
      .order('created_at', { ascending: false });

    setMyListings(listings || []);
    setMyOrders(orders || []);
    setLoading(false);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 pb-6 border-b border-gray-200">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900">User Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">Logged in as {user?.email}</p>
        </div>
        <Link
          href="/sell"
          className="inline-flex items-center gap-2 bg-green-600 text-white px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-green-700 transition-colors shadow-sm"
        >
          <Sprout className="w-4 h-4" /> Post New Produce
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-6">
        <button
          onClick={() => setActiveTab('buyer')}
          className={`pb-3 px-4 font-semibold text-sm border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === 'buyer'
              ? 'border-green-600 text-green-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <ShoppingBag className="w-4 h-4" /> My Produce Reservations ({myOrders.length})
        </button>
        <button
          onClick={() => setActiveTab('seller')}
          className={`pb-3 px-4 font-semibold text-sm border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === 'seller'
              ? 'border-green-600 text-green-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Sprout className="w-4 h-4" /> My Harvest Listings ({myListings.length})
        </button>
      </div>

      {loading && (
        <div className="py-12 text-center text-gray-400">Loading dashboard...</div>
      )}

      {/* Buyer Tab Content */}
      {!loading && activeTab === 'buyer' && (
        <div>
          {myOrders.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-dashed border-gray-300">
              <ShoppingBag className="mx-auto h-12 w-12 text-gray-400 mb-3" />
              <h3 className="text-base font-semibold text-gray-900">No Reservations Yet</h3>
              <p className="text-xs text-gray-500 mt-1 mb-4">You haven't reserved any local produce items yet.</p>
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
                      Reserved Quantity: {order.reserved_quantity} {order.produce_listings?.unit_type} | Pickup Code: <strong className="text-gray-900 font-mono bg-gray-100 px-2 py-0.5 rounded">{order.verification_code}</strong>
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-extrabold text-gray-900">${order.authorized_amount}</span>
                    <p className="text-xs text-gray-400">Pre-authorized hold</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Seller Tab Content */}
      {!loading && activeTab === 'seller' && (
        <div>
          {myListings.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-dashed border-gray-300">
              <Sprout className="mx-auto h-12 w-12 text-gray-400 mb-3" />
              <h3 className="text-base font-semibold text-gray-900">No Listings Created</h3>
              <p className="text-xs text-gray-500 mt-1 mb-4">Start selling surplus harvest from your garden or farm.</p>
              <Link href="/sell" className="text-sm text-green-600 font-semibold hover:underline">
                Create First Produce Listing &rarr;
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {myListings.map((item) => (
                <div key={item.id} className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex justify-between items-start">
                  <div>
                    <span className="text-xs font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded">
                      {item.category}
                    </span>
                    <h3 className="text-base font-bold text-gray-900 mt-1">{item.title}</h3>
                    <p className="text-xs text-gray-500 mt-1">
                      ${item.price_per_unit} / {item.unit_type} | {item.available_quantity} left
                    </p>
                    <p className="text-xs text-gray-400 mt-2 flex items-center gap-1">
                      <Calendar className="w-3 h-3" /> Ready: {item.harvest_ready_date}
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-green-700 bg-green-100 px-2.5 py-1 rounded-full">
                    {item.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}