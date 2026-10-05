'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ShoppingBag, CreditCard, Lock, ArrowRight, ArrowLeft, ShieldCheck, AlertCircle, Mail } from 'lucide-react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { supabase } from '@/lib/supabaseClient';
import { postWithAuth } from '@/lib/authedFetch';
import BuyerGuidance from '@/components/BuyerGuidance';
import { calculateOrderTotals, BUYER_FEE_LABEL, MIN_CHARGE_CENTS } from '@/lib/pricing';

const stripePublishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const stripePromise = stripePublishableKey ? loadStripe(stripePublishableKey) : null;

// The guest email box sits in its own card above the payment form, and is tied
// back to the form by this id so the browser still insists on it before paying.
const PAYMENT_FORM_ID = 'checkout-payment-form';

function PaymentForm({
  listingId,
  quantity,
  maxQty,
  unitType,
  grandTotal,
  signedIn,
  guestEmail,
}: {
  signedIn: boolean;
  guestEmail: string;
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
    <form id={PAYMENT_FORM_ID} onSubmit={handlePayment} className="bg-white border rounded-xl p-5 shadow-sm space-y-4">
      <h2 className="font-bold text-gray-900 text-base flex items-center gap-1.5">
        <CreditCard className="w-5 h-5 text-emerald-600" />
        Payment Details
      </h2>

      <div className="min-h-[100px]">
        <PaymentElement />
      </div>

      <label className="flex items-start gap-2 text-sm text-gray-700">
        <input type="checkbox" required className="mt-0.5 w-4 h-4 shrink-0" />
        <span>
          I understand how pickup works, and I won't give my pickup code to the farmer until I have my
          produce. I agree to the{' '}
          <Link href="/terms" target="_blank" className="font-semibold text-emerald-800 underline">
            Terms of Use
          </Link>{' '}
          and{' '}
          <Link href="/privacy" target="_blank" className="font-semibold text-emerald-800 underline">
            Privacy Policy
          </Link>
          .
        </span>
      </label>

      {paymentError && (
        <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-200 p-2 rounded-lg">{paymentError}</p>
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
  const [quantityText, setQuantityText] = useState('1');
  const [guestEmail, setGuestEmail] = useState('');

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
  // Rounded down: orders are whole units, so a leftover fraction can't be bought.
  const maxQty = listing ? Math.max(0, Math.floor(Number(listing.available_quantity ?? 0))) : 0;
  const unitType = listing?.unit_type || 'lbs';

  const { subtotalCents, feeCents, totalCents: preTaxTotalCents } = calculateOrderTotals(itemPrice, quantity);

  // Sales tax comes from the server, since it depends on the pickup location.
  // `quote` is the answer for the quantity it was asked about; until it
  // arrives (or while tax collection is off) the tax is zero.
  const [quote, setQuote] = useState<{ quantity: number; taxCents: number; taxEnabled: boolean } | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const listingIdForQuote = listing?.id;

  useEffect(() => {
    if (!listingIdForQuote) return;
    let cancelled = false;

    // A short pause so typing a quantity doesn't ask for a price on every keystroke.
    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/checkout/quote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ listingId: listingIdForQuote, quantity }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error || 'Could not price this order.');
        setQuote({ quantity, taxCents: data.taxCents, taxEnabled: data.taxEnabled });
        setQuoteError(null);
      } catch (err: any) {
        if (!cancelled) setQuoteError(err.message || 'Could not price this order.');
      }
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [listingIdForQuote, quantity]);

  // Payment waits until the price for the current quantity has come back.
  const quoteReady = quote !== null && quote.quantity === quantity;
  const taxCents = quoteReady ? quote.taxCents : 0;
  const totalCents = preTaxTotalCents + taxCents;

  const subtotal = subtotalCents / 100;
  const buyerFee = feeCents / 100;
  const grandTotal = totalCents / 100;

  const handleQuantityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // The box keeps exactly what was typed — including nothing at all — so the
    // old number can be cleared before a new one goes in. The order quantity
    // only changes once there is a real number to change it to.
    const digits = e.target.value.replace(/\D/g, '');
    const val = parseInt(digits, 10);
    if (isNaN(val) || val < 1) {
      setQuantityText(digits === '' ? '' : digits);
      return;
    }
    const capped = maxQty > 0 && val > maxQty ? maxQty : val;
    setQuantity(capped);
    setQuantityText(String(capped));
  };

  // Leaving the box empty (or at zero) puts the current quantity back.
  const handleQuantityBlur = () => setQuantityText(String(quantity));

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
    <div className="max-w-2xl mx-auto px-4 py-8">
      <Link href="/browse" className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-emerald-600 mb-4 font-medium">
        <ArrowLeft className="w-3.5 h-3.5" /> Back to Produce
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
        <ShoppingBag className="w-6 h-6 text-emerald-600" />
        Checkout & Complete Reservation
      </h1>

      <div className="space-y-6">
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
              <label htmlFor="checkout-qty" className="text-xs text-gray-600 font-semibold">Qty:</label>
              <input id="checkout-qty"
                type="number"
                min="1"
                max={maxQty}
                value={quantityText}
                onChange={handleQuantityChange}
                onBlur={handleQuantityBlur}
                onFocus={(e) => e.target.select()}
                form={PAYMENT_FORM_ID}
                required
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
          {quote?.taxEnabled && (
            <div className="flex justify-between items-center text-gray-700">
              <span>Sales Tax:</span>
              <span className="font-semibold">{quoteReady ? `$${(taxCents / 100).toFixed(2)}` : 'Calculating...'}</span>
            </div>
          )}
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

        <BuyerGuidance />

        {!signedIn && (
          <div className="bg-white border-2 border-emerald-600 rounded-xl p-5 shadow-sm">
            <h2 className="font-bold text-gray-900 text-base flex items-center gap-1.5">
              <Mail className="w-5 h-5 text-emerald-600" aria-hidden="true" />
              <label htmlFor="checkout-guest-email">Your email address *</label>
            </h2>
            <p className="text-sm text-gray-600 mt-1 mb-3">
              No account needed. We send your receipt and pickup code here, so double-check the spelling.
            </p>
            <input
              id="checkout-guest-email"
              form={PAYMENT_FORM_ID}
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              value={guestEmail}
              onChange={(e) => setGuestEmail(e.target.value)}
              className="w-full px-3 py-3 border border-gray-400 rounded-lg text-base focus:ring-2 focus:ring-emerald-500 outline-none"
            />
            <p className="text-sm text-gray-600 mt-3">
              Already have an account?{' '}
              <Link
                href={`/login?redirect=${encodeURIComponent(`/checkout?id=${listing.id}`)}`}
                className="font-semibold text-emerald-700 underline"
              >
                Sign in instead
              </Link>
            </p>
          </div>
        )}

        {!stripePromise ? (
          <p className="bg-white border rounded-xl p-5 shadow-sm text-xs text-red-500 text-center">
            Payment configuration is missing. Please contact support.
          </p>
        ) : quoteError ? (
          <p role="alert" className="bg-white border rounded-xl p-5 shadow-sm text-xs text-red-600 text-center">
            {quoteError}
          </p>
        ) : !quoteReady ? (
          <p className="bg-white border rounded-xl p-5 shadow-sm text-xs text-gray-500 text-center">
            Calculating your total...
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
              guestEmail={guestEmail}
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
