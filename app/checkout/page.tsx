'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ShoppingBag, CreditCard, Lock, ArrowRight, ArrowLeft, ShieldCheck, AlertCircle } from 'lucide-react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { supabase } from '@/lib/supabaseClient';
import { postWithAuth } from '@/lib/authedFetch';
import { calculateOrderTotals, BUYER_FEE_LABEL, MIN_CHARGE_CENTS } from '@/lib/pricing';

const stripePublishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const stripePromise = stripePublishableKey ? loadStripe(stripePublishableKey) : null;

function PaymentForm({
  listingId,
  quantity,
  maxQty,
  unitType,
  grandTotal,
  signedIn,
  loginHref,
}: {
  signedIn: boolean;
  loginHref: string;
  listingId: string;
  quantity: number;
  maxQty: number;
  unitType: string;
  grandTotal: number;
}) {
  const router = useRouter();
  const stripe = useStripe();
  const elements = useElements();

  const [loadingPayment, setLoadingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [guestEmail, setGuestEmail] = useState('');

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    if (quantity > maxQty) {
      setPaymentError(`Cannot reserve more than the available ${maxQty} ${unitType}.`);
      return;
    }

    setLoadingPayment(true);
    setPaymentError(null);

    try {
      // Validate the card form before creating anything server-side.
      const { error: submitError } = await elements.submit();
      if (submitError) throw new Error(submitError.message || 'Please check your card details.');

      const intentRes = await postWithAuth('/api/checkout', {
        listingId,
        quantity,
        ...(signedIn ? {} : { guestEmail }),
      });
      const intentData = await intentRes.json();
      if (!intentRes.ok) throw new Error(intentData.error || 'Could not start payment.');

      const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
        elements,
        clientSecret: intentData.clientSecret,
        confirmParams: { return_url: window.location.href },
        redirect: 'if_required',
      });

      if (confirmError) throw new Error(confirmError.message || 'Payment failed.');
      if (paymentIntent?.status !== 'succeeded') throw new Error('Payment was not completed.');

      // Guests have no session, so the payment's client secret is what proves
      // to the server that this browser made the payment.
      const completeRes = await postWithAuth('/api/checkout/complete', {
        paymentIntentId: paymentIntent.id,
        clientSecret: intentData.clientSecret,
      });
      const completeData = await completeRes.json();
      if (!completeRes.ok) {
        throw new Error(
          `Your payment went through, but we couldn't record your order. Please contact support with reference ${paymentIntent.id}.`
        );
      }

      router.push(
        `/orders/confirmation?orderId=${completeData.orderId}&code=${completeData.code}` +
          (completeData.guestToken ? `&token=${completeData.guestToken}` : '')
      );
    } catch (err: any) {
      setPaymentError(err.message || 'Payment processing failed.');
    } finally {
      setLoadingPayment(false);
    }
  };

  return (
    <form onSubmit={handlePayment} className="bg-white border rounded-xl p-5 shadow-sm space-y-4 sticky top-6">
      <h2 className="font-bold text-gray-900 text-base flex items-center gap-1.5">
        <CreditCard className="w-5 h-5 text-emerald-600" />
        Payment Details
      </h2>

      {!signedIn && (
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Email for your confirmation *</label>
          <input
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            value={guestEmail}
            onChange={(e) => setGuestEmail(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg text-sm"
          />
          <p className="text-[11px] text-gray-500 mt-1">
            Checking out as a guest. Your pickup code is sent here, so double-check the spelling.{' '}
            <Link href={loginHref} className="font-semibold text-emerald-700 hover:underline">
              Sign in instead
            </Link>
          </p>
        </div>
      )}

      <div className="min-h-[100px]">
        <PaymentElement />
      </div>

      {paymentError && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 p-2 rounded-lg">{paymentError}</p>
      )}

      <button
        type="submit"
        disabled={loadingPayment || !stripe || !elements || maxQty === 0}
        className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white font-bold rounded-xl shadow-md transition-colors flex items-center justify-center gap-2 text-sm"
      >
        {loadingPayment ? 'Processing Payment...' : `Pay $${grandTotal.toFixed(2)} Now`}
        <ArrowRight className="w-4 h-4" />
      </button>

      <div className="flex items-center justify-center gap-1 text-xs text-gray-400">
        <Lock className="w-3.5 h-3.5" />
        <span>Secure checkout powered by Stripe</span>
      </div>
    </form>
  );
}

function CheckoutContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const listingId = searchParams.get('id');

  const [listing, setListing] = useState<any>(null);
  const [loadingListing, setLoadingListing] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [authChecked, setAuthChecked] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    async function checkAuth() {
      // Signing in is optional — buyers without an account check out as a
      // guest with just an email address.
      const { data: { user } } = await supabase.auth.getUser();
      setSignedIn(Boolean(user));
      setAuthChecked(true);
    }
    checkAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const itemPrice = listing ? Number(listing.price_per_unit ?? 0) : 0;
  const maxQty = listing ? Math.max(0, Number(listing.available_quantity ?? 0)) : 0;
  const unitType = listing?.unit_type || 'lbs';

  const { subtotalCents, feeCents, totalCents } = calculateOrderTotals(itemPrice, quantity);
  const subtotal = subtotalCents / 100;
  const buyerFee = feeCents / 100;
  const grandTotal = totalCents / 100;

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

  if (!authChecked || loadingListing) {
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
    <div className="max-w-3xl mx-auto px-4 py-8">
      <Link href="/browse" className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-emerald-600 mb-4 font-medium">
        <ArrowLeft className="w-3.5 h-3.5" /> Back to Produce
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
        <ShoppingBag className="w-6 h-6 text-emerald-600" />
        Checkout & Complete Reservation
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-8">
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

          <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-5 space-y-3 text-sm">
            <div className="flex justify-between items-center text-gray-700">
              <span>Produce Subtotal:</span>
              <span className="font-semibold">${subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center text-gray-700">
              <span>Platform & Processing Fee ({BUYER_FEE_LABEL}):</span>
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

        <div className="md:col-span-2">
          {!stripePromise ? (
            <p className="bg-white border rounded-xl p-5 shadow-sm text-xs text-red-500 text-center">
              Payment configuration is missing. Please contact support.
            </p>
          ) : totalCents < MIN_CHARGE_CENTS ? (
            <p className="bg-white border rounded-xl p-5 shadow-sm text-xs text-gray-500 text-center">
              Order total must be at least $0.50 to check out online.
            </p>
          ) : (
            <Elements
              stripe={stripePromise}
              options={{
                mode: 'payment',
                amount: totalCents,
                currency: 'usd',
                allowedPaymentMethodTypes: ['card'],
              }}
            >
              <PaymentForm
                signedIn={signedIn}
                loginHref={`/login?redirect=${encodeURIComponent(`/checkout?id=${listing.id}`)}`}
                listingId={listing.id}
                quantity={quantity}
                maxQty={maxQty}
                unitType={unitType}
                grandTotal={grandTotal}
              />
            </Elements>
          )}
        </div>
      </div>
    </div>
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
