'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Sprout, ShieldCheck, MapPin, ArrowLeft, Calendar, User, Clock } from 'lucide-react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';

function CheckoutContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const listingId = searchParams.get('item');

  const [listing, setListing] = useState<any>(null);
  const [user, setUser] = useState<any>(null);
  const [quantity, setQuantity] = useState(1);
  const [pickupDate, setPickupDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    checkAuthAndFetchListing();
  }, [listingId]);

  const checkAuthAndFetchListing = async () => {
    if (!listingId) {
      setLoading(false);
      return;
    }

    // 1. Ensure user is logged in; if not, pass this item's URL to login
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      router.push(`/login?redirectTo=${encodeURIComponent(`/checkout?item=${listingId}`)}`);
      return;
    }

    setUser(session.user);

    // 2. Fetch Item & Seller Details
    const { data } = await supabase
      .from('produce_listings')
      .select('*, seller_profiles(farm_name, growing_practices)')
      .eq('id', listingId)
      .single();

    if (data) {
      setListing(data);
      // Default pickup date to the harvest ready date
      if (data.harvest_ready_date) {
        setPickupDate(data.harvest_ready_date);
      }
    }
    setLoading(false);
  };

  const handleConfirmPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    if (!user || !listing) return;

    const totalAmount = quantity * listing.price_per_unit;

    // 1. Create Purchase Order
    const { data: order, error } = await supabase
      .from('orders')
      .insert([
        {
          buyer_id: user.id,
          produce_id: listing.id,
          reserved_quantity: quantity,
          authorized_amount: totalAmount,
          status: 'pending_pickup',
        },
      ])
      .select()
      .single();

    if (!error && order) {
      // 2. Decrement Remaining Stock
      const newStock = listing.available_quantity - quantity;
      await supabase
        .from('produce_listings')
        .update({
          available_quantity: newStock,
          status: newStock <= 0 ? 'sold_out' : 'active',
        })
        .eq('id', listing.id);

      // Redirect to Confirmation Screen
      router.push(`/checkout/confirmation?orderId=${order.id}`);
    } else {
      alert(`Could not process reservation: ${error?.message || 'Please try again.'}`);
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="p-12 text-center text-gray-500">Checking item details & session...</div>;
  }

  if (!listing) {
    return (
      <div className="p-12 text-center text-gray-500">
        Listing not found or expired. <Link href="/browse" className="text-green-600 underline">Return to Browse</Link>
      </div>
    );
  }

  const totalPrice = (quantity * listing.price_per_unit).toFixed(2);

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <Link href="/browse" className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-gray-900 mb-6 transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" /> Back to Fresh Produce
      </Link>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden grid grid-cols-1 md:grid-cols-2">
        {/* Left Column: Item & Grower Summary */}
        <div className="p-6 sm:p-8 bg-gray-50 border-r border-gray-200 flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-green-800 bg-green-100 px-2.5 py-1 rounded-full">
              {listing.category}
            </span>

            <h1 className="text-2xl font-bold text-gray-900 mt-3">{listing.title}</h1>
            <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
              <User className="w-3.5 h-3.5 text-green-600" /> Grown by <span className="font-semibold text-gray-700">{listing.seller_profiles?.farm_name || 'Local Farm'}</span>
            </p>

            {listing.image_url && (
              <img src={listing.image_url} alt={listing.title} className="w-full h-40 object-cover rounded-xl mt-4 border border-gray-200" />
            )}

            <div className="mt-6 space-y-3 text-xs sm:text-sm">
              <div className="flex justify-between border-b border-gray-200 pb-2">
                <span className="text-gray-500">Price per Unit</span>
                <span className="font-semibold text-gray-900">${listing.price_per_unit.toFixed(2)} / {listing.unit_type}</span>
              </div>
              <div className="flex justify-between border-b border-gray-200 pb-2">
                <span className="text-gray-500">Stock Available</span>
                <span className="font-semibold text-gray-900">{listing.available_quantity} {listing.unit_type}</span>
              </div>
              <div className="flex justify-between border-b border-gray-200 pb-2">
                <span className="text-gray-500">Pickup Location</span>
                <span className="font-semibold text-gray-900 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-green-600" /> {listing.location_name} ({listing.zip_code})
                </span>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-gray-200 text-xs text-gray-500">
            <p className="font-semibold text-gray-700 mb-1">Pickup Instructions:</p>
            <p className="italic">{listing.pickup_instructions}</p>
          </div>
        </div>

        {/* Right Column: Quantity & Date Inputs */}
        <form onSubmit={handleConfirmPurchase} className="p-6 sm:p-8 flex flex-col justify-between">
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Purchase Details</h2>
              <p className="text-xs text-gray-500 mt-0.5">Specify your order quantity and preferred pickup date.</p>
            </div>

            {/* Input 1: Quantity */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="block text-xs font-bold text-gray-700">
                  How many {listing.unit_type} would you like? *
                </label>
                <span className="text-[10px] text-gray-400">Max: {listing.available_quantity} {listing.unit_type}</span>
              </div>
              <div className="relative">
                <input
                  type="number"
                  min="1"
                  max={listing.available_quantity}
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, Math.min(listing.available_quantity, Number(e.target.value))))}
                  className="w-full px-4 py-2.5 border rounded-xl focus:ring-2 focus:ring-green-500 font-bold text-gray-900 text-base"
                />
                <span className="absolute right-3 top-3 text-xs font-semibold text-gray-400 uppercase">
                  {listing.unit_type}
                </span>
              </div>
            </div>

            {/* Input 2: Pickup Date */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">
                Select Preferred Pickup Date *
              </label>
              <div className="relative">
                <input
                  type="date"
                  required
                  min={listing.harvest_ready_date || undefined}
                  max={listing.harvest_end_date || undefined}
                  value={pickupDate}
                  onChange={(e) => setPickupDate(e.target.value)}
                  className="w-full px-4 py-2.5 border rounded-xl focus:ring-2 focus:ring-green-500 text-sm font-semibold text-gray-900"
                />
              </div>
              <p className="text-[10px] text-gray-400 mt-1 flex items-center gap-1">
                <Clock className="w-3 h-3 text-green-600" /> Available starting: {listing.harvest_ready_date}
              </p>
            </div>

            {/* Live Pricing Summary */}
            <div className="p-4 bg-green-50 rounded-xl border border-green-200">
              <div className="flex justify-between items-center text-green-900">
                <span className="text-xs font-semibold">Total ({quantity} {listing.unit_type}):</span>
                <span className="text-2xl font-extrabold">${totalPrice}</span>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-gray-500">
              <ShieldCheck className="w-4 h-4 text-green-600 shrink-0" />
              <span>Pay at pickup after verifying produce freshness.</span>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full mt-6 bg-green-600 hover:bg-green-700 text-white font-bold py-3.5 px-6 rounded-xl transition-colors shadow-md disabled:bg-gray-400 text-sm"
          >
            {submitting ? 'Confirming Order...' : `Reserve ${quantity} ${listing.unit_type} ($${totalPrice})`}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-gray-500">Loading order parameters...</div>}>
      <CheckoutContent />
    </Suspense>
  );
}