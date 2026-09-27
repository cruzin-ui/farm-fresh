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

  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchOrder() {
      if (!orderId) {
        setLoading(false);
        return;
      }
      try {
        const { data, error } = await supabase
          .from('orders')
          .select('*')
          .eq('id', orderId)
          .single();

        if (error) throw error;
        setOrder(data);
      } catch (err) {
        console.error('Error fetching order:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchOrder();
  }, [orderId]);

  const pickupCode = code || order?.pickup_code || 'FFD-0000';
  const totalPaid = order?.total_price ?? 0.00;

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
        <h1 className="text-2xl font-extrabold text-emerald-950">Payment Successful & Reserved!</h1>
        <p className="text-sm text-emerald-800">Your produce is fully pre-paid and locked in with the grower.</p>
      </div>

      {/* Pickup Code Display */}
      <div className="bg-white border-2 border-dashed border-emerald-300 rounded-2xl p-6 text-center space-y-2 shadow-sm bg-gradient-to-b from-emerald-50/30 to-white">
        <span className="text-xs font-bold uppercase tracking-widest text-emerald-800">Pickup Verification Code</span>
        <div className="text-4xl font-black text-emerald-900 tracking-wider font-mono">{pickupCode}</div>
        <p className="text-xs text-gray-500">Show this verification code or give your name when collecting your harvest.</p>
      </div>

      {/* Payment & Status Summary */}
      <div className="bg-white border rounded-2xl p-5 shadow-sm space-y-3 text-sm">
        <h2 className="font-bold text-gray-900 border-b pb-2 flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-emerald-600" /> Payment & Status Summary
        </h2>

        <div className="flex justify-between items-center bg-emerald-50 text-emerald-950 font-bold px-3 py-2.5 rounded-xl">
          <span>Total Paid Online (Square):</span>
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
          href="/browse"
          className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 text-center shadow-md"
        >
          Return to Marketplace
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