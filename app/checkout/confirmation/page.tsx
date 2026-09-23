'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { CheckCircle2, MapPin, Calendar, Sprout, ArrowRight } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

function ConfirmationContent() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get('orderId');
  const [order, setOrder] = useState<any>(null);

  useEffect(() => {
    if (orderId) {
      supabase
        .from('orders')
        .select('*, produce_listings(*)')
        .eq('id', orderId)
        .single()
        .then(({ data }) => setOrder(data));
    }
  }, [orderId]);

  if (!order) {
    return <div className="p-12 text-center text-gray-500">Loading order confirmation...</div>;
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-12 text-center">
      <div className="w-16 h-16 bg-green-100 text-green-700 rounded-full flex items-center justify-center mx-auto mb-4">
        <CheckCircle2 className="w-10 h-10" />
      </div>

      <h1 className="text-3xl font-extrabold text-gray-900">Reservation Confirmed!</h1>
      <p className="text-sm text-gray-600 mt-2">
        Your produce reservation has been sent to the grower. Below are your pickup details.
      </p>

      <div className="mt-8 bg-white p-6 rounded-2xl border border-gray-200 shadow-sm text-left space-y-4">
        <div className="border-b border-gray-100 pb-4">
          <span className="text-xs text-gray-400 uppercase">Order ID: {order.id.slice(0, 8)}</span>
          <h2 className="text-xl font-bold text-gray-900 mt-1">{order.produce_listings?.title}</h2>
          <p className="text-sm font-semibold text-green-700 mt-0.5">
            {order.reserved_quantity} {order.produce_listings?.unit_type} — Total Paid/Reserved: ${order.authorized_amount}
          </p>
        </div>

        <div className="space-y-2 text-sm text-gray-700">
          <p className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-green-600 shrink-0" />
            <span><strong>Pickup Location:</strong> {order.produce_listings?.location_name} ({order.produce_listings?.zip_code})</span>
          </p>
          <p className="flex items-start gap-2">
            <Sprout className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
            <span><strong>Pickup Instructions:</strong> {order.produce_listings?.pickup_instructions}</span>
          </p>
        </div>
      </div>

      <div className="mt-8 flex justify-center gap-4">
        <Link
          href="/browse"
          className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-6 rounded-xl text-sm transition-colors shadow-sm"
        >
          Browse More Produce
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}

export default function ConfirmationPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-gray-500">Loading order summary...</div>}>
      <ConfirmationContent />
    </Suspense>
  );
}