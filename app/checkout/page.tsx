'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { supabase } from '@/lib/supabaseClient';
import {
  ShoppingCart,
  CreditCard,
  Lock,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  AlertCircle,
  Mail,
  Store,
  Trash2,
  Clock,
} from 'lucide-react';
import Link from 'next/link';
import { postWithAuth } from '@/lib/authedFetch';
import BuyerGuidance from '@/components/BuyerGuidance';
import TurnstileBox from '@/components/TurnstileBox';
import { TURNSTILE_SITE_KEY } from '@/lib/turnstile';
import { BUYER_FEE_LABEL, MIN_CHARGE_CENTS } from '@/lib/pricing';
import { useCart, addToCart, setCartQuantity, removeFromCart, clearCart, type CartItem } from '@/lib/cart';

const stripePublishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
// With test keys Stripe adds a floating helper button to the corner of the
// screen, which covers the bottom tab bar on phones. It is switched off here;
// it never appears with live keys.
const stripePromise = stripePublishableKey
  ? loadStripe(stripePublishableKey, { developerTools: { assistant: { enabled: false } } })
  : null;

// The guest email box sits in its own card above the payment form, and is tied
// back to the form by this id so the browser still insists on it before paying.
const PAYMENT_FORM_ID = 'checkout-payment-form';

// The "I'm human" check shown above the Pay button.
const captchaSiteKey = TURNSTILE_SITE_KEY;

// One item of the cart as priced by /api/checkout/quote.
type QuoteLine = {
  listingId: string;
  title: string;
  unitType: string;
  pricePerUnit: number;
  quantity: number;
  available: number;
  farmerId: string | null;
  farmName: string;
  locationName: string;
  usualPickup: string;
  problem: string | null;
};

type Quote = {
  // The cart this quote was worked out for.
  key: string;
  lines: QuoteLine[];
  subtotalCents: number;
  feeCents: number;
  taxCents: number;
  totalCents: number;
  ok: boolean;
  taxEnabled: boolean;
};

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

// A quantity box that keeps exactly what was typed — including nothing at
// all — so the old number can be cleared before a new one goes in. The cart
// only changes once there is a real number to change it to.
function QuantityInput({
  id,
  value,
  max,
  onChange,
}: {
  id: string;
  value: number;
  max: number;
  onChange: (quantity: number) => void;
}) {
  const [text, setText] = useState(String(value));

  useEffect(() => {
    setText(String(value));
  }, [value]);

  return (
    <input
      id={id}
      type="number"
      inputMode="numeric"
      min="1"
      max={max > 0 ? max : undefined}
      value={text}
      form={PAYMENT_FORM_ID}
      required
      onFocus={(e) => e.target.select()}
      onBlur={() => setText(String(value))}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, '');
        const typed = parseInt(digits, 10);
        if (isNaN(typed) || typed < 1) {
          setText(digits);
          return;
        }
        const capped = max > 0 && typed > max ? max : typed;
        setText(String(capped));
        onChange(capped);
      }}
      className="w-16 text-center text-sm font-bold bg-white border rounded p-1 focus:ring-2 focus:ring-emerald-500 outline-none"
    />
  );
}

function PaymentForm({
  items,
  grandTotal,
  signedIn,
  guestEmail,
  onCartRejected,
}: {
  items: CartItem[];
  grandTotal: number;
  signedIn: boolean;
  guestEmail: string;
  // Called when the server turns the cart down (something sold out in the
  // meantime), so the page can look the cart up again and show what changed.
  onCartRejected: () => void;
}) {
  const router = useRouter();
  const stripe = useStripe();
  const elements = useElements();

  const [loadingPayment, setLoadingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  // Proof from the "I'm human" check. Each one works for a single attempt.
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaResetKey, setCaptchaResetKey] = useState(0);
  // True if the check itself couldn't run. The buyer isn't held up waiting
  // for it; the server makes the final decision.
  const [captchaUnavailable, setCaptchaUnavailable] = useState(false);

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setLoadingPayment(true);
    setPaymentError(null);

    try {
      // Validate the card form before creating anything server-side.
      const { error: submitError } = await elements.submit();
      if (submitError) throw new Error(submitError.message || 'Please check your card details.');

      const intentRes = await postWithAuth('/api/checkout', {
        items,
        ...(signedIn ? {} : { guestEmail }),
        ...(captchaSiteKey ? { captchaToken } : {}),
      });
      const intentData = await intentRes.json();
      if (!intentRes.ok) {
        if (intentRes.status === 409) onCartRejected();
        throw new Error(intentData.error || 'Could not start payment.');
      }

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
        `/orders/confirmation?orderId=${completeData.orderId}` +
          (completeData.guestToken ? `&token=${completeData.guestToken}` : '')
      );
      clearCart();
    } catch (err: any) {
      setPaymentError(err.message || 'Payment processing failed.');
      // The proof has been used up; get a new one for the next try.
      setCaptchaResetKey((key) => key + 1);
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
          <strong className="font-bold text-gray-900">
            I understand how pickup works, and I won't give a pickup code to a farmer until I have my produce
            from them.
          </strong>{' '}
          I agree to the{' '}
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

      {captchaSiteKey && (
        <TurnstileBox
          siteKey={captchaSiteKey}
          onToken={(token) => {
            setCaptchaToken(token);
            if (token) setCaptchaUnavailable(false);
          }}
          onUnavailable={() => setCaptchaUnavailable(true)}
          resetKey={captchaResetKey}
        />
      )}

      {paymentError && (
        <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-200 p-2 rounded-lg">{paymentError}</p>
      )}

      <button
        type="submit"
        disabled={loadingPayment || !stripe || !elements || Boolean(captchaSiteKey && !captchaToken && !captchaUnavailable)}
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
  // "Reserve" links arrive as /checkout?id=<listing>: that listing is put in
  // the cart, and the buyer checks out with whatever else is already in it.
  const listingIdToAdd = searchParams.get('id');

  const { items, ready } = useCart();
  const cartKey = JSON.stringify(items);

  const [authChecked, setAuthChecked] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
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
  }, []);

  useEffect(() => {
    if (!ready || !listingIdToAdd) return;
    if (!items.some((item) => item.listingId === listingIdToAdd)) addToCart(listingIdToAdd, 1);
    router.replace('/checkout');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, listingIdToAdd]);

  // What is in the cart and what it costs — names, prices, availability, the
  // fee and any sales tax — all come from the server. `quote` is the answer
  // for the cart it was asked about; payment waits until it matches the cart
  // on screen.
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [refreshCount, setRefreshCount] = useState(0);

  useEffect(() => {
    if (!ready || items.length === 0) return;
    let cancelled = false;

    // A short pause so typing a quantity doesn't ask for a price on every keystroke.
    const timer = setTimeout(async () => {
      try {
        // Sent with the sign-in, if there is one, so the server can spot a
        // seller trying to buy their own listing.
        const res = await postWithAuth('/api/checkout/quote', { items });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error || 'Could not price this order.');
        setQuote({ ...data, key: cartKey });
        setQuoteError(null);
      } catch (err: any) {
        if (!cancelled) setQuoteError(err.message || 'Could not price this order.');
      }
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, cartKey, refreshCount]);

  if (!authChecked || !ready || (listingIdToAdd && items.length === 0)) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center space-y-3">
        <div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-sm font-medium text-gray-600">Loading your cart...</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="max-w-md mx-auto my-12 p-6 bg-white border rounded-2xl text-center space-y-4 shadow-sm">
        <ShoppingCart className="w-10 h-10 text-gray-400 mx-auto" aria-hidden="true" />
        <h1 className="text-lg font-bold text-gray-900">Your cart is empty</h1>
        <p className="text-sm text-gray-600">Add produce from one farm or several, then pay for it all at once.</p>
        <Link
          href="/browse"
          className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white font-medium rounded-xl text-sm"
        >
          <ArrowLeft className="w-4 h-4" /> Browse Produce
        </Link>
      </div>
    );
  }

  const quoteReady = quote !== null && quote.key === cartKey;

  // The items to show: the server's description of each one, with the
  // quantity currently in the cart (which may be a keystroke ahead of it).
  const quantityById = new Map(items.map((item) => [item.listingId, item.quantity]));
  const lines = (quote?.lines || [])
    .filter((line) => quantityById.has(line.listingId))
    .map((line) => ({ ...line, quantity: quantityById.get(line.listingId)! }));

  // Grouped by farm, since each farm is a separate pickup with its own code.
  const farms: {
    key: string;
    farmerId: string | null;
    farmName: string;
    locationName: string;
    usualPickup: string;
    lines: typeof lines;
  }[] = [];
  for (const line of lines) {
    const key = line.farmerId || line.listingId;
    const farm = farms.find((f) => f.key === key);
    if (farm) farm.lines.push(line);
    else {
      farms.push({
        key,
        farmerId: line.farmerId,
        farmName: line.farmName,
        locationName: line.locationName,
        usualPickup: line.usualPickup,
        lines: [line],
      });
    }
  }

  const totalCents = quote?.totalCents ?? 0;
  const pending = 'Updating...';

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <Link href="/browse" className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-emerald-600 mb-4 font-medium">
        <ArrowLeft className="w-3.5 h-3.5" /> Keep Shopping
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
        <ShoppingCart className="w-6 h-6 text-emerald-600" />
        Your Cart & Checkout
      </h1>

      <div className="space-y-6">
        {!quote && !quoteError && (
          <p className="bg-white border rounded-xl p-5 shadow-sm text-sm text-gray-500 text-center">Loading your cart...</p>
        )}

        {farms.length > 1 && (
          <p className="text-sm text-gray-700 bg-amber-50 border border-amber-300 rounded-xl p-3">
            Your cart has produce from <strong>{farms.length} farms</strong>. You pay once, but each farm is a
            separate pickup at its own address, with its own pickup code.
          </p>
        )}

        {farms.map((farm) => (
          <div key={farm.key} className="bg-white border rounded-xl p-4 shadow-sm space-y-3">
            <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <Store className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
              {farm.farmName}
              {farm.locationName && <span className="text-xs font-medium text-gray-500">· Pickup in {farm.locationName}</span>}
            </h2>
            {farm.usualPickup && (
              <p className="text-xs text-gray-700 flex items-start gap-1.5">
                <Clock className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
                <span>
                  Usual pickup times: <span className="font-semibold">{farm.usualPickup}</span>. The farmer confirms
                  the exact days when your order is ready.
                </span>
              </p>
            )}

            <ul className="divide-y divide-gray-100">
              {farm.lines.map((line) => (
                <li key={line.listingId} className="py-3 first:pt-0 last:pb-0 space-y-2">
                  <div className="flex justify-between items-start gap-3">
                    <div className="min-w-0">
                      <Link href={`/listings/${line.listingId}`} className="font-bold text-gray-900 hover:underline break-words">
                        {line.title}
                      </Link>
                      <p className="text-xs text-gray-500 mt-0.5">
                        ${line.pricePerUnit.toFixed(2)} per {line.unitType} · {line.available} available
                      </p>
                    </div>
                    <p className="text-sm font-bold text-gray-900 shrink-0">
                      ${(line.pricePerUnit * line.quantity).toFixed(2)}
                    </p>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 bg-gray-50 border px-3 py-1.5 rounded-lg">
                      <label htmlFor={`qty-${line.listingId}`} className="text-xs text-gray-600 font-semibold">
                        Qty<span className="sr-only"> of {line.title}</span>:
                      </label>
                      <QuantityInput
                        id={`qty-${line.listingId}`}
                        value={line.quantity}
                        max={line.available}
                        onChange={(quantity) => setCartQuantity(line.listingId, quantity)}
                      />
                      <span className="text-xs text-gray-600">{line.unitType}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFromCart(line.listingId)}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600 hover:underline px-2 py-2"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" /> Remove
                      <span className="sr-only"> {line.title}</span>
                    </button>
                  </div>

                  {line.problem && quoteReady && (
                    <p role="alert" className="text-xs text-red-700 bg-red-50 border border-red-200 p-2 rounded-lg flex items-center gap-1.5 font-medium">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /> {line.problem}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}

        <Link
          href="/browse"
          className="w-full inline-flex items-center justify-center gap-2 bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-50 font-bold py-3 rounded-xl text-sm"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Back to Browsing — Add More Produce
        </Link>

        {quote && (
          <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-5 space-y-3 text-sm">
            <div className="flex justify-between items-center text-gray-700">
              <span>Produce Subtotal:</span>
              <span className="font-semibold">{quoteReady ? dollars(quote.subtotalCents) : pending}</span>
            </div>
            <div className="flex justify-between items-center text-gray-700">
              <span>Platform & Processing Fee ({BUYER_FEE_LABEL}, once per checkout):</span>
              <span className="font-semibold">{quoteReady ? dollars(quote.feeCents) : pending}</span>
            </div>
            {quote.taxEnabled && (
              <div className="flex justify-between items-center text-gray-700">
                <span>Sales Tax:</span>
                <span className="font-semibold">{quoteReady ? dollars(quote.taxCents) : pending}</span>
              </div>
            )}
            <div className="flex justify-between items-center font-bold text-lg text-emerald-950 border-t border-emerald-200 pt-2">
              <span>Total Due Today (100% Online):</span>
              <span>{quoteReady ? dollars(totalCents) : pending}</span>
            </div>
            <div className="flex justify-between items-center text-xs font-semibold text-emerald-800 bg-white border px-3 py-2 rounded-lg">
              <span className="flex items-center gap-1">
                <ShieldCheck className="w-4 h-4 text-emerald-600" /> Balance Due at Farm Stand:
              </span>
              <span>$0.00 (Pre-Paid)</span>
            </div>
          </div>
        )}

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
              <Link href="/login?redirect=%2Fcheckout" className="font-semibold text-emerald-700 underline">
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
        ) : !quote.ok ? (
          <p role="alert" className="bg-white border border-red-200 rounded-xl p-5 shadow-sm text-sm text-red-700 text-center">
            Some items in your cart can't be bought as they are. Fix the ones marked in red above to continue.
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
              items={items}
              signedIn={signedIn}
              guestEmail={guestEmail}
              grandTotal={totalCents / 100}
              onCartRejected={() => setRefreshCount((count) => count + 1)}
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
        <p className="text-sm font-medium text-gray-600">Loading your cart...</p>
      </div>
    }>
      <CheckoutContent />
    </Suspense>
  );
}
