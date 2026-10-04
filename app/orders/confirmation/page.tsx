'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, MapPin, Store, ArrowLeft, Printer, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';

function ConfirmationContent() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get('orderId');
  const code = searchParams.get('code');
  // Present for guest orders: stands in for being signed in.
  const guestToken = searchParams.get('token');

  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchOrder() {
      if (!orderId) {
        setLoading(false);
        return;
      }
      try {
        if (guestToken) {
          const res = await fetch('/api/orders/guest-view', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderId, token: guestToken }),
          });
          const guestData = await res.json();
          if (!res.ok) throw new Error(guestData.error || 'Order not found.');
          setOrder(guestData.order);
          return;
        }

        const { data, error } = await supabase
          .from('orders')
          .select('*')
          .eq('id', orderId)
          .single();

        if (error) throw error;

        // The pickup code is stored separately so only the buyer can read it.
        const { data: codeRow } = await supabase
          .from('order_pickup_codes')
          .select('code')
          .eq('order_id', orderId)
          .maybeSingle();

        setOrder({ ...data, pickup_code: codeRow?.code || data.pickup_code });
      } catch (err) {
        console.error('Error fetching order:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchOrder();
  }, [orderId, guestToken]);

  const status: string = order?.status || 'pending_pickup';
  const isOpen = status === 'pending_pickup' || status === 'ready_for_pickup';
  const pickupCode = order?.pickup_code || code || 'FFD-0000';
  const totalPaid = order?.total_price ?? 0.00;
  const refunded = Number(order?.refunded_amount || 0);

  if (loading) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center space-y-3">
        <div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-sm font-medium text-gray-600">Loading order receipt...</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      {/* Success Banner */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-center space-y-2">
        <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
        <h1 className="text-2xl font-extrabold text-emerald-950">
          {status === 'completed'
            ? 'Order Picked Up'
            : status === 'cancelled'
              ? 'Order Cancelled'
              : status === 'ready_for_pickup'
                ? 'Ready for Pickup!'
                : 'Payment Successful & Reserved!'}
        </h1>
        <p className="text-sm text-emerald-800">
          {status === 'completed'
            ? 'This order has been collected. Thank you for buying local!'
            : status === 'cancelled'
              ? refunded > 0
                ? `This order was cancelled and ${refunded.toFixed(2)} was refunded to your payment method.`
                : 'This order was cancelled.'
              : status === 'ready_for_pickup'
                ? 'The farmer has your order ready — pickup details are below.'
                : 'Your produce is fully pre-paid and locked in with the grower.'}
        </p>
        {order?.listing_title && (
          <p className="text-sm font-semibold text-emerald-950">
            {order.quantity} {order.listing_unit_type} of {order.listing_title}
          </p>
        )}
      </div>

      {status === 'ready_for_pickup' && order?.pickup_details && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 text-sm text-blue-900">
          <p className="font-bold mb-1">Pickup details from the farmer</p>
          <p className="whitespace-pre-wrap">{order.pickup_details}</p>
        </div>
      )}

      {/* Pickup Code Display */}
      {(isOpen || order?.pickup_code) && (
      <div className="bg-white border-2 border-dashed border-emerald-300 rounded-2xl p-6 text-center space-y-2 shadow-sm bg-gradient-to-b from-emerald-50/30 to-white">
        <span className="text-xs font-bold uppercase tracking-widest text-emerald-800">
          {isOpen
            ? 'Pickup Verification Code'
            : status === 'completed'
              ? 'Pickup Code (used at pickup)'
              : 'Pickup Code (order cancelled)'}
        </span>
        <div className="text-4xl font-black text-emerald-900 tracking-wider font-mono">{pickupCode}</div>
        {isOpen && <p className="text-xs text-gray-500">Give this code to the farmer only when you collect your harvest — it confirms you received your order and releases their payment.</p>}
      </div>
      )}

      {guestToken && isOpen && (
        <p className="text-xs text-gray-500 text-center">
          You checked out as a guest. We've emailed you a link to this page — keep that email or bookmark this
          page to get back to your order and pickup code.
        </p>
      )}

      {/* Payment & Status Summary */}
      <div className="bg-white border rounded-2xl p-5 shadow-sm space-y-3 text-sm">
        <h2 className="font-bold text-gray-900 border-b pb-2 flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-emerald-600" /> Payment & Status Summary
        </h2>

        <div className="flex justify-between items-center bg-emerald-50 text-emerald-950 font-bold px-3 py-2.5 rounded-xl">
          <span>Total Paid Online:</span>
          <span className="text-lg">${Number(totalPaid).toFixed(2)}</span>
        </div>

        <div className="flex justify-between items-center bg-gray-50 border text-gray-700 px-3 py-2 rounded-xl font-semibold">
          <span>Balance Due at Farm Stand Pickup:</span>
          <span className="text-emerald-700">$0.00 (Fully Pre-Paid)</span>
        </div>
      </div>

      {/* Navigation Actions */}
      <div className="flex gap-3">
        <button
          onClick={() => window.print()}
          className="flex-1 py-3 border bg-white hover:bg-gray-50 text-gray-700 font-semibold rounded-xl text-sm flex items-center justify-center gap-2 shadow-sm"
        >
          <Printer className="w-4 h-4 text-gray-500" /> Print Receipt
        </button>
        <Link
          href={guestToken ? '/browse' : '/orders'}
          className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 text-center shadow-md"
        >
          {guestToken ? 'Back to Marketplace' : 'View My Orders'}
        </Link>
      </div>
    </div>
  );
}

export default function OrderConfirmationPage() {
  return (
    <Suspense fallback={
      <div className="min-h-[50vh] flex flex-col items-center justify-center space-y-3">
        <div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-sm font-medium text-gray-600">Loading order receipt...</p>
      </div>
    }>
      <ConfirmationContent />
    </Suspense>
  );
}