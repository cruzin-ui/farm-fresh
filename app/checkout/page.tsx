'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Script from 'next/script';
import Link from 'next/link';
import { ShoppingBag, CreditCard, Lock, ArrowRight, ArrowLeft, ShieldCheck, AlertCircle } from 'lucide-react';
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
  const [squareError, setSquareError] = useState<string | null>(null);

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

  // Determine application ID & location ID with fallbacks
  const appId = process.env.NEXT_PUBLIC_SQUARE_APPLICATION_ID || 'sandbox-sq0idb-6B32R6J34y7erO0LdB11dw';
  const locationId = process.env.NEXT_PUBLIC_SQUARE_LOCATION_ID || 'L313A78A0S3BC';

  // Explicitly detect if credentials are sandbox based on key prefix
  const isSandbox = appId.startsWith('sandbox-');
  const squareSdkUrl = isSandbox
    ? 'https://sandbox.web.squarecdn.com/v1/square.js'
    : 'https://web.squarecdn.com/v1/square.js';

  // 2. Initialize Square Web SDK Card Container
  const initializeSquareCard = async () => {
    if (card) return;

    if (!appId || !locationId) {
      setSquareError('Square Application ID or Location ID environment variables are missing.');
      return;
    }

    if (!window.Square) {
      console.warn('Square SDK script not loaded in window yet.');
      return;
    }

    try {
      const payments = window.Square.payments(appId, locationId);
      const cardInstance = await payments.card();
      
      const container = document.getElementById('square-card-container');
      if (container) {
        container.innerHTML = '';
      }

      await cardInstance.attach('#square-card-container');
      setCard(cardInstance);
      setSquareLoaded(true);
      setSquareError(null);
    } catch (e: any) {
      console.error('Failed to attach Square Card element:', e);
      setSquareError(e.message || 'An unexpected error occurred while initializing the payment method.');
    }
  };

  useEffect(() => {
    if (!loadingListing && window.Square && !card) {
      initializeSquareCard();
    }
  }, [loadingListing]);

  // Quantity and Price calculations bounded strictly by available_quantity
  const itemPrice = listing ? Number(listing.price_per_unit ?? listing.price ?? 0) : 0;
  const maxQty = listing ? Math.max(0, Number(listing.available_quantity ?? listing.quantity_available ?? 0)) : 0;
  const unitType = listing?.unit_type || 'lbs';

  const subtotal = itemPrice * quantity;
  const buyerFeeRate = 0.05; // 5% buyer platform fee
  const buyerFee = Number((subtotal * buyerFeeRate).toFixed(2));
  const grandTotal = Number((subtotal + buyerFee).toFixed(2));

  // Handler for quantity input with min and max validation
  const handleQuantityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    if (isNaN(val) || val < 1) {
      setQuantity(1);
    } else if (maxQty > 0 && val > maxQty) {
      setQuantity(maxQty);
    } else {
      setQuantity(val);
    }
  };

  // 3. Handle Square Payment submission
  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!card) return;

    if (quantity > maxQty) {
      alert(`Cannot reserve more than the available ${maxQty} ${unitType}.`);
      return;
    }

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
        src={squareSdkUrl}
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
              <div className="flex justify-between items-center">
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Produce Selection</h2>
                <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
                  {maxQty} {unitType} available
                </span>
              </div>

              <div className="flex justify-between items-start pt-1">
                <div>
                  <h3 className="font-bold text-gray-900 text-lg">{listing.title}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">${itemPrice.toFixed(2)} per {unitType}</p>
                </div>
                <div className="flex items-center gap-2 bg-gray-50 border px-3 py-1.5 rounded-lg">
                  <label className="text-xs text-gray-600 font-semibold">Qty:</label>
                  <input
                    type="number"
                    min="1"
                    max={maxQty}
                    value={quantity}
                    onChange={handleQuantityChange}
                    className="w-16 text-center text-sm font-bold bg-white border rounded p-1 focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
              </div>

              {quantity === maxQty && (
                <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 p-2 rounded-lg flex items-center gap-1.5 font-medium">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 text-amber-600" /> Max available limit reached ({maxQty} {unitType}).
                </p>
              )}
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
                {!squareLoaded && !squareError && (
                  <p className="text-xs text-gray-400 text-center py-4">Loading secure Square card form...</p>
                )}
                {squareError && (
                  <p className="text-xs text-red-500 text-center py-4 p-2">{squareError}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={loadingPayment || !squareLoaded || maxQty === 0}
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