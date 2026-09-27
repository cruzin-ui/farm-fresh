'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Script from 'next/script';
import Link from 'next/link';
import { ShoppingBag, CreditCard, Lock, ArrowRight, ArrowLeft, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';

declare global {
  interface Window {
    Square?: any;
  }
}

function CheckoutContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const listingId = searchParams.get('id');

  const [listing, setListing] = useState<any>(null);
  const [loadingListing, setLoadingListing] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [quantity, setQuantity] = useState(1);
  const [loadingPayment, setLoadingPayment] = useState(false);
  const [card, setCard] = useState<any>(null);
  const [squareLoaded, setSquareLoaded] = useState(false);

  // 1. Fetch listing details from Supabase using 'produce_listings' table
  useEffect(() => {
    async function fetchListing() {
      if (!listingId) {
        setFetchError('No listing specified.');
        setLoadingListing(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('produce_listings')
          .select('*')
          .eq('id', listingId)
          .single();

        if (error) throw error;
        setListing(data);
      } catch (err: any) {
        console.error('Error fetching listing:', err);
        setFetchError(err.message || 'Failed to load produce details.');
      } finally {
        setLoadingListing(false);
      }
    }

    fetchListing();
  }, [listingId]);

  // 2. Initialize Square Web SDK Card Container
  const initializeSquareCard = async () => {
    if (!window.Square) return;

    try {
      const payments = window.Square.payments(
        process.env.NEXT_PUBLIC_SQUARE_APPLICATION_ID!,
        process.env.NEXT_PUBLIC_SQUARE_LOCATION_ID!
      );
      const cardInstance = await payments.card();
      await cardInstance.attach('#square-card-container');
      setCard(cardInstance);
      setSquareLoaded(true);
    } catch (e) {
      console.error('Failed to attach Square Card element:', e);
    }
  };

  useEffect(() => {
    if (!loadingListing && window.Square && !card) {
      initializeSquareCard();
    }
  }, [loadingListing]);

  // Calculations
  const itemPrice = listing?.price ? Number(listing.price) : 0;
  const subtotal = itemPrice * quantity;
  const buyerFeeRate = 0.05; // 5% buyer platform fee
  const buyerFee = Number((subtotal * buyerFeeRate).toFixed(2));
  const grandTotal = Number((subtotal + buyerFee).toFixed(2));

  // 3. Handle Square Payment submission
  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!card) return;

    setLoadingPayment(true);

    try {
      const result = await card.tokenize();
      if (result.status !== 'OK') {
        throw new Error(result.errors?.[0]?.message || 'Card tokenization failed');
      }

      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceId: result.token,
          listingId: listing.id,
          quantity,
          subtotal,
          buyerFee,
          grandTotal,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      router.push(`/orders/confirmation?orderId=${data.orderId}&code=${data.code}`);
    } catch (err: any) {
      alert(err.message || 'Payment processing failed.');
    } finally {
      setLoadingPayment(false);
    }
  };

  if (loadingListing) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center space-y-3">
        <div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-sm font-medium text-gray-600">Loading produce checkout...</p>
      </div>
    );
  }

  if (fetchError || !listing) {
    return (
      <div className="max-w-md mx-auto my-12 p-6 bg-white border rounded-2xl text-center space-y-4 shadow-sm">
        <p className="text-gray-600">{fetchError || 'Produce listing not found.'}</p>
        <Link
          href="/browse"
          className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white font-medium rounded-xl text-sm"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Marketplace
        </Link>
      </div>
    );
  }

  return (
    <>
      <Script
        src={
          process.env.NEXT_PUBLIC_SQUARE_ENVIRONMENT === 'production'
            ? 'https://web.squarecdn.com/v1/square.js'
            : 'https://sandbox.web.squarecdn.com/v1/square.js'
        }
        onLoad={initializeSquareCard}
      />

      <div className="max-w-3xl mx-auto px-4 py-8">
        <Link href="/browse" className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-emerald-600 mb-4 font-medium">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Produce
        </Link>

        <h1 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
          <ShoppingBag className="w-6 h-6 text-emerald-600" />
          Checkout & Complete Reservation
        </h1>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-8">
          {/* Order Details Column */}
          <div className="md:col-span-3 space-y-6">
            <div className="bg-white border rounded-xl p-4 shadow-sm space-y-3">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Produce Selection</h2>
              <div className="flex justify-between items-start pt-1">
                <div>
                  <h3 className="font-bold text-gray-900 text-lg">{listing.title}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">${itemPrice.toFixed(2)} per {listing.unit_type || 'unit'}</p>
                </div>
                <div className="flex items-center gap-2 bg-gray-50 border px-3 py-1.5 rounded-lg">
                  <label className="text-xs text-gray-600 font-semibold">Qty:</label>
                  <input
                    type="number"
                    min="1"
                    max={listing.quantity_available || 99}
                    value={quantity}
                    onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-12 text-center text-sm font-bold bg-white border rounded"
                  />
                </div>
              </div>
            </div>

            {/* Financial Totals */}
            <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-5 space-y-3 text-sm">
              <div className="flex justify-between items-center text-gray-700">
                <span>Produce Subtotal:</span>
                <span className="font-semibold">${subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center text-gray-700">
                <span>Platform & Processing Fee (5%):</span>
                <span className="font-semibold">${buyerFee.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center font-bold text-lg text-emerald-950 border-t border-emerald-200 pt-2">
                <span>Total Due Today (100% Online):</span>
                <span>${grandTotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center text-xs font-semibold text-emerald-800 bg-white border px-3 py-2 rounded-lg">
                <span className="flex items-center gap-1">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" /> Balance Due at Farm Stand:
                </span>
                <span>$0.00 (Pre-Paid)</span>
              </div>
            </div>
          </div>

          {/* Square Card Payment Form */}
          <div className="md:col-span-2">
            <form onSubmit={handlePayment} className="bg-white border rounded-xl p-5 shadow-sm space-y-4 sticky top-6">
              <h2 className="font-bold text-gray-900 text-base flex items-center gap-1.5">
                <CreditCard className="w-5 h-5 text-emerald-600" />
                Payment Details
              </h2>

              <div className="min-h-[100px] border rounded-lg p-2 bg-gray-50">
                <div id="square-card-container"></div>
                {!squareLoaded && (
                  <p className="text-xs text-gray-400 text-center py-4">Loading secure Square card form...</p>
                )}
              </div>

              <button
                type="submit"
                disabled={loadingPayment || !squareLoaded}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white font-bold rounded-xl shadow-md transition-colors flex items-center justify-center gap-2 text-sm"
              >
                {loadingPayment ? 'Processing Payment...' : `Pay $${grandTotal.toFixed(2)} Now`}
                <ArrowRight className="w-4 h-4" />
              </button>

              <div className="flex items-center justify-center gap-1 text-xs text-gray-400">
                <Lock className="w-3.5 h-3.5" />
                <span>Encrypted 256-bit Square Checkout</span>
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={
      <div className="min-h-[50vh] flex flex-col items-center justify-center space-y-3">
        <div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-sm font-medium text-gray-600">Loading produce checkout...</p>
      </div>
    }>
      <CheckoutContent />
    </Suspense>
  );
}