'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Sprout, CreditCard, ShieldCheck, MapPin, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';

function CheckoutContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const listingId = searchParams.get('item');

  const [listing, setListing] = useState<any>(null);
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (listingId) {
      fetchListingDetails();
    }
  }, [listingId]);

  const fetchListingDetails = async () => {
    const { data } = await supabase
      .from('produce_listings')
      .select('*, seller_profiles(farm_name)')
      .eq('id', listingId)
      .single();

    if (data) setListing(data);
    setLoading(false);
  };

  const handleConfirmPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      router.push(`/login?redirectTo=/checkout?item=${listingId}`);
      return;
    }

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
      // 2. Decrement remaining stock
      const newStock = listing.available_quantity - quantity;
      await supabase
        .from('produce_listings')
        .update({
          available_quantity: newStock,
          status: newStock <= 0 ? 'sold_out' : 'active',
        })
        .eq('id', listing.id);

      // Redirect to Confirmation Page
      router.push(`/checkout/confirmation?orderId=${order.id}`);
    } else {
      alert('Could not process reservation. Please try again.');
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="p-12 text-center text-gray-500">Loading produce checkout...</div>;
  }

  if (!listing) {
    return (
      <div className="p-12 text-center text-gray-500">
        Item not found. <Link href="/browse" className="text-green-600 underline">Return to Browse</Link>
      </div>
    );
  }

  const totalPrice = (quantity * listing.price_per_unit).toFixed(2);

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <Link href="/browse" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:underline mb-6">
        <ArrowLeft className="w-3.5 h-3.5" /> Back to Browse Produce
      </Link>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden grid grid-cols-1 md:grid-cols-2">
        {/* Item Summary */}
        <div className="p-6 bg-gray-50 border-r border-gray-200">
          <span className="text-[10px] font-bold uppercase tracking-wider text-green-700 bg-green-100 px-2 py-0.5 rounded">
            {listing.category}
          </span>
          <h1 className="text-2xl font-bold text-gray-900 mt-2">{listing.title}</h1>
          <p className="text-xs text-gray-500 mt-1">Grown by {listing.seller_profiles?.farm_name || 'Local Farm'}</p>

          <div className="mt-6 space-y-3 text-sm">
            <div className="flex justify-between border-b border-gray-200 pb-2">
              <span className="text-gray-500">Unit Price</span>
              <span className="font-semibold text-gray-800">${listing.price_per_unit.toFixed(2)} / {listing.unit_type}</span>
            </div>
            <div className="flex justify-between border-b border-gray-200 pb-2">
              <span className="text-gray-500">Available Stock</span>
              <span className="font-semibold text-gray-800">{listing.available_quantity} {listing.unit_type}</span>
            </div>
            <div className="flex justify-between border-b border-gray-200 pb-2">
              <span className="text-gray-500">Pickup Area</span>
              <span className="font-semibold text-gray-800 flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-green-600" /> {listing.location_name}
              </span>
            </div>
          </div>
        </div>

        {/* Quantity & Payment Confirmation */}
        <form onSubmit={handleConfirmPurchase} className="p-6 flex flex-col justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900 mb-4">Reserve Your Quantity</h2>

            <div className="mb-6">
              <label className="block text-xs font-semibold text-gray-700 mb-2">
                Quantity to Buy ({listing.unit_type})
              </label>
              <input
                type="number"
                min="1"
                max={listing.available_quantity}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, Math.min(listing.available_quantity, Number(e.target.value))))}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 font-bold text-gray-900"
              />
            </div>

            <div className="p-4 bg-green-50 rounded-xl border border-green-200 mb-6">
              <div className="flex justify-between items-center text-green-900">
                <span className="text-sm font-semibold">Total Amount Due:</span>
                <span className="text-2xl font-extrabold">${totalPrice}</span>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-gray-500 mb-6">
              <ShieldCheck className="w-4 h-4 text-green-600 shrink-0" />
              <span>Inspection Guarantee: Verify quality at pickup before final payment release.</span>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-6 rounded-xl transition-colors shadow-md disabled:bg-gray-400"
          >
            {submitting ? 'Confirming Reservation...' : 'Confirm & Reserve Produce'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-gray-500">Loading checkout screen...</div>}>
      <CheckoutContent />
    </Suspense>
  );
}