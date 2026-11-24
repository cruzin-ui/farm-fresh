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
  Truck,
} from 'lucide-react';
import AddressAutocomplete from '@/components/AddressAutocomplete';
import { DELIVERY_RELEASE_HOURS } from '@/lib/delivery';
import Link from 'next/link';
import { postWithAuth } from '@/lib/authedFetch';
import BuyerGuidance from '@/components/BuyerGuidance';
import TurnstileBox from '@/components/TurnstileBox';
import DistanceFromYou from '@/components/DistanceFromYou';
import { TURNSTILE_SITE_KEY } from '@/lib/turnstile';
import { BUYER_FEE_LABEL, MIN_CHARGE_CENTS } from '@/lib/pricing';
import { WHOLESALE_FEE_LABEL } from '@/lib/wholesale';
import { BUYER_NAME_KEY, BUYER_NAME_MAX } from '@/lib/buyerName';
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
  zipCode?: string;
  usualPickup: string;
  problem: string | null;
  // Set when this item is to be picked up at one of the farm's markets.
  market?: { key: string; label: string } | null;
  // Set when the farm is delivering it.
  delivery?: { key: string; date: string; label: string } | null;
  // Set when bought by the case; the price, quantity and unit are per case.
  wholesale?: { caseSize: number; minCases: number; listingUnit: string } | null;
};

type Quote = {
  // The cart this quote was worked out for.
  key: string;
  lines: QuoteLine[];
  subtotalCents: number;
  feeCents: number;
  // The fee in two parts: retail items, and items bought wholesale.
  retailFeeCents?: number;
  wholesaleFeeCents?: number;
  // True when the wholesale items are tax-free (resale certificate on file).
  taxExempt?: boolean;
  taxCents: number;
  totalCents: number;
  ok: boolean;
  taxEnabled: boolean;
  // The farmers markets each farm's buyers can pick up at, by farm.
  marketOptions?: Record<string, { key: string; label: string }[]>;
  // The farms that deliver: how, and on which dates, by farm.
  deliveryOptions?: Record<string, { summary: string; note: string; options: { key: string; label: string }[] }>;
  // The delivery fees for the address given, in total and by farm.
  deliveryCents?: number;
  deliveries?: { farmerId: string; feeCents: number; miles: number }[];
};

// Where deliveries go, as the buyer typed it.
type DeliveryForm = { address: string; zip: string; note: string };
const zipIn = (address: string) => {
  const matches = address.match(/\b\d{5}\b/g);
  return matches ? matches[matches.length - 1] : '';
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
  pickups,
  grandTotal,
  signedIn,
  guestEmail,
  buyerName,
  onBuyerNameChange,
  delivery,
  onCartRejected,
}: {
  items: CartItem[];
  // Where the buyer picks up from each farm that isn't at the farm itself.
  pickups: Record<string, string>;
  // Where deliveries go, when any farm is delivering.
  delivery: DeliveryForm | null;
  grandTotal: number;
  signedIn: boolean;
  guestEmail: string;
  // A signed-in buyer's name for the farmer (optional).
  buyerName: string;
  onBuyerNameChange: (name: string) => void;
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
        pickups,
        ...(delivery ? { delivery } : {}),
        ...(signedIn ? { buyerName } : { guestEmail }),
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

      {signedIn && (
        <div>
          <label htmlFor="checkout-buyer-name" className="block text-sm font-bold text-gray-900">
            Name for your order <span className="font-normal text-gray-500">(optional, so the farmer can label your bag)</span>
          </label>
          <input
            id="checkout-buyer-name"
            type="text"
            autoComplete="name"
            maxLength={BUYER_NAME_MAX}
            placeholder="e.g., Jane Smith"
            value={buyerName}
            onChange={(e) => onBuyerNameChange(e.target.value)}
            className="mt-1 w-full px-3 py-2.5 border border-gray-300 rounded-lg text-base focus:ring-2 focus:ring-emerald-500 outline-none"
          />
        </div>
      )}

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

type DeliveryChoices = { options: { key: string; label: string }[]; summary: string; note?: string | null };

// "How will you get it?" for one farm: pick up at the farm, at one of its
// markets or drop-off points, or delivery, with the date chosen from a list
// (so a farm delivering six days a week is one option, not eight).
function FulfillmentChoice({
  farmerId,
  locationName,
  markets,
  delivery,
  value,
  onChange,
}: {
  farmerId: string;
  locationName?: string | null;
  markets: { key: string; label: string; kind?: string }[];
  delivery?: DeliveryChoices;
  value: string;
  onChange: (key: string) => void;
}) {
  const dates = delivery?.options || [];
  const delivering = value.startsWith('delivery@');
  const radio = (checked: boolean, onPick: () => void, children: React.ReactNode, key: string) => (
    <label key={key} className="flex items-start gap-2 text-sm text-gray-800">
      <input type="radio" name={`pickup-${farmerId}`} checked={checked} onChange={onPick} className="mt-1" />
      <span>{children}</span>
    </label>
  );

  return (
    <fieldset className="border border-emerald-200 bg-emerald-50/50 rounded-lg p-3 space-y-1.5">
      <legend className="px-1 text-xs font-bold text-gray-900">How will you get it?</legend>
      {radio(value === '', () => onChange(''), <>Pick up at the farm{locationName ? `, in ${locationName}` : ''}</>, 'farm')}
      {markets.map((o) =>
        radio(
          value === o.key,
          () => onChange(o.key),
          <>
            {o.kind === 'dropoff' ? 'Drop-off point: ' : 'Market stand: '}
            <strong>{o.label}</strong>
          </>,
          o.key
        )
      )}
      {dates.length > 0 &&
        radio(
          delivering,
          () => !delivering && onChange(dates[0].key),
          <>
            Deliver to me
            {delivery?.summary && (
              <span className="block text-xs text-gray-600">{delivery.summary.replace(/^Delivers within/, 'Within')}</span>
            )}
          </>,
          'delivery'
        )}
      {delivering && (
        <div className="pl-6 space-y-1">
          <label htmlFor={`delivery-date-${farmerId}`} className="sr-only">
            Delivery date
          </label>
          <select
            id={`delivery-date-${farmerId}`}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full sm:w-auto px-3 py-2 border rounded-lg text-sm bg-white font-semibold"
          >
            {dates.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
          {delivery?.note && <p className="text-xs text-gray-600">{delivery.note}</p>}
        </div>
      )}
      {(markets.length > 0 || dates.length > 0) && (
        <p className="text-[11px] text-gray-500">Orders for a set date close at 6 pm the evening before.</p>
      )}
    </fieldset>
  );
}

function CheckoutContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // "Reserve" links arrive as /checkout?id=<listing>: that listing is put in
  // the cart, and the buyer checks out with whatever else is already in it.
  const listingIdToAdd = searchParams.get('id');

  const { items, ready } = useCart();
  // For each farm with farmers markets, where the buyer chose to pick up:
  // farm id to a market, or nothing for the farm itself.
  const [pickups, setPickups] = useState<Record<string, string>>({});
  // The delivery address, used only when a farm is chosen for delivery. It
  // is sent for pricing once it has a zip code.
  const [deliveryForm, setDeliveryForm] = useState<DeliveryForm>({ address: '', zip: '', note: '' });
  const wantsDelivery = Object.values(pickups).some((key) => key.startsWith('delivery@'));
  const delivery =
    wantsDelivery && deliveryForm.address.trim().length >= 5 && /^\d{5}$/.test(deliveryForm.zip) ? deliveryForm : null;
  const cartKey = JSON.stringify({ items, pickups, delivery });

  const [authChecked, setAuthChecked] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [guestEmail, setGuestEmail] = useState('');
  const [buyerName, setBuyerName] = useState('');

  useEffect(() => {
    async function checkAuth() {
      // Signing in is optional — buyers without an account check out as a
      // guest with just an email address.
      const { data: { user } } = await supabase.auth.getUser();
      setSignedIn(Boolean(user));
      setBuyerName((user?.user_metadata?.[BUYER_NAME_KEY] as string) || '');
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
        const res = await postWithAuth('/api/checkout/quote', { items, pickups, ...(delivery ? { delivery } : {}) });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error || 'Could not price this order.');
        setQuote({ ...data, key: cartKey });
        setQuoteError(null);

        // Counts this visit to checkout, once, now that the shopper has been
        // shown a total. It is a tally for the admin page, not a record of them.
        try {
          if (!sessionStorage.getItem('ffd-checkout-counted')) {
            sessionStorage.setItem('ffd-checkout-counted', '1');
            fetch('/api/track', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ event: 'checkout_opened' }),
              keepalive: true,
            }).catch(() => {});
          }
        } catch {}
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
    zipCode: string;
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
        zipCode: line.zipCode || '',
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

        {/* The whole order in one card: each farm's items and how to get them,
            the delivery address if any, then the totals. */}
        {farms.length > 0 && (
          <div className="bg-white border rounded-xl shadow-sm divide-y">
            {farms.length > 1 && (
              <p className="text-xs text-gray-700 px-4 py-3">
                Produce from <strong>{farms.length} farms</strong>: you pay once, but each farm is a separate pickup
                with its own code.
              </p>
            )}

            {farms.map((farm) => (
              <section key={farm.key} className="p-4 space-y-3">
                <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                  <Store className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
                  {farm.farmName}
                  {farm.locationName && <span className="text-xs font-medium text-gray-500">· {farm.locationName}</span>}
                </h2>

                <ul className="space-y-3">
                  {farm.lines.map((line) => (
                    <li key={line.listingId} className="space-y-1.5">
                      <div className="flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <Link href={`/listings/${line.listingId}`} className="text-sm font-bold text-gray-900 hover:underline break-words">
                            {line.title}
                          </Link>
                          {line.wholesale && (
                            <span className="ml-2 align-middle text-[10px] font-bold uppercase tracking-wide bg-amber-100 text-amber-900 border border-amber-300 rounded px-1.5 py-0.5">
                              Wholesale
                            </span>
                          )}
                          <p className="text-xs text-gray-500">
                            ${line.pricePerUnit.toFixed(2)} {line.wholesale ? 'per case' : line.unitType === 'units' ? 'each' : `per ${line.unitType}`}
                            {line.wholesale && line.wholesale.minCases > 1 && <> · min {line.wholesale.minCases} cases</>}
                          </p>
                        </div>
                        <label htmlFor={`qty-${line.listingId}`} className="sr-only">
                          Quantity of {line.title}
                        </label>
                        <QuantityInput
                          id={`qty-${line.listingId}`}
                          value={line.quantity}
                          max={line.available}
                          onChange={(quantity) => setCartQuantity(line.listingId, quantity)}
                        />
                        <p className="w-16 text-right text-sm font-bold text-gray-900 shrink-0">
                          ${(line.pricePerUnit * line.quantity).toFixed(2)}
                        </p>
                        <button
                          type="button"
                          onClick={() => removeFromCart(line.listingId)}
                          className="p-1.5 -mr-1.5 text-gray-400 hover:text-red-600 rounded-lg"
                          title="Remove"
                        >
                          <Trash2 className="w-4 h-4" aria-hidden="true" />
                          <span className="sr-only">Remove {line.title}</span>
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

                {farm.farmerId &&
                  ((quote?.marketOptions?.[farm.farmerId] || []).length > 0 ||
                    (quote?.deliveryOptions?.[farm.farmerId]?.options || []).length > 0) && (
                  <FulfillmentChoice
                    farmerId={farm.farmerId}
                    locationName={farm.locationName}
                    markets={quote?.marketOptions?.[farm.farmerId] || []}
                    delivery={quote?.deliveryOptions?.[farm.farmerId]}
                    value={pickups[farm.farmerId] || ''}
                    onChange={(key) =>
                      setPickups((current) => {
                        const next = { ...current };
                        if (key) next[farm.farmerId!] = key;
                        else delete next[farm.farmerId!];
                        return next;
                      })
                    }
                  />
                )}
                {!pickups[farm.farmerId || ''] && (
                  <div className="space-y-1.5">
                    {farm.usualPickup && (
                      <p className="text-xs text-gray-600 flex items-start gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
                        <span>Usual pickup: {farm.usualPickup}</span>
                      </p>
                    )}
                    {/* How far the pickup is, before the buyer pays. */}
                    <DistanceFromYou farmZip={farm.zipCode} remindIfFar />
                  </div>
                )}
              </section>
            ))}

            {wantsDelivery && (
              <section className="p-4 space-y-3">
                <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                  <Truck className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" /> Delivery address
                </h2>
                <div>
                  <label htmlFor="delivery-address" className="block text-xs font-semibold text-gray-700 mb-1">
                    Street address *
                  </label>
                  <AddressAutocomplete
                    id="delivery-address"
                    required
                    placeholder="Start typing, then pick your address from the list"
                    value={deliveryForm.address}
                    verified={false}
                    onChange={(text) => setDeliveryForm((f) => ({ ...f, address: text, zip: zipIn(text) || f.zip }))}
                    onSelect={(s) => setDeliveryForm((f) => ({ ...f, address: s.address, zip: (s.zip || '').slice(0, 5) || zipIn(s.address) }))}
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label htmlFor="delivery-zip" className="block text-xs font-semibold text-gray-700 mb-1">
                      Zip code *
                    </label>
                    <input
                      id="delivery-zip"
                      inputMode="numeric"
                      maxLength={5}
                      value={deliveryForm.zip}
                      onChange={(e) => setDeliveryForm((f) => ({ ...f, zip: e.target.value.replace(/\D/g, '').slice(0, 5) }))}
                      className="w-full px-3 py-2 border rounded-lg text-sm"
                    />
                  </div>
                  <div className="col-span-2">
                    <label htmlFor="delivery-note" className="block text-xs font-semibold text-gray-700 mb-1">
                      Note for the farmer (optional)
                    </label>
                    <input
                      id="delivery-note"
                      maxLength={300}
                      value={deliveryForm.note}
                      placeholder="Gate code, apartment, where to leave it"
                      onChange={(e) => setDeliveryForm((f) => ({ ...f, note: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-lg text-sm"
                    />
                  </div>
                </div>
                <p className="text-xs text-gray-500">
                  Only the farm delivering to you sees this. Not home? They leave it with a photo, and you have{' '}
                  {DELIVERY_RELEASE_HOURS} hours to report a problem.
                </p>
              </section>
            )}

            {quote && (
              <div className="p-4 space-y-1.5 text-sm bg-emerald-50/60 rounded-b-xl">
                <div className="flex justify-between gap-3 text-gray-700">
                  <span>Subtotal</span>
                  <span className="font-semibold">{quoteReady ? dollars(quote.subtotalCents) : pending}</span>
                </div>
                {(quote.wholesaleFeeCents || 0) > 0 && (quote.retailFeeCents || 0) > 0 ? (
                  <>
                    <div className="flex justify-between gap-3 text-gray-700">
                      <span>Service fee, retail items ({BUYER_FEE_LABEL})</span>
                      <span className="font-semibold">{quoteReady ? dollars(quote.retailFeeCents!) : pending}</span>
                    </div>
                    <div className="flex justify-between gap-3 text-gray-700">
                      <span>Wholesale fee ({WHOLESALE_FEE_LABEL})</span>
                      <span className="font-semibold">{quoteReady ? dollars(quote.wholesaleFeeCents!) : pending}</span>
                    </div>
                  </>
                ) : (
                  <div className="flex justify-between gap-3 text-gray-700">
                    <span>{(quote.wholesaleFeeCents || 0) > 0 ? `Wholesale fee (${WHOLESALE_FEE_LABEL})` : `Service fee (${BUYER_FEE_LABEL})`}</span>
                    <span className="font-semibold">{quoteReady ? dollars(quote.feeCents) : pending}</span>
                  </div>
                )}
                {wantsDelivery && (
                  <div className="flex justify-between gap-3 text-gray-700">
                    <span>Delivery</span>
                    <span className="font-semibold">{!delivery ? 'Add your address' : quoteReady ? dollars(quote.deliveryCents || 0) : pending}</span>
                  </div>
                )}
                {quote.taxEnabled && (
                  <div className="flex justify-between gap-3 text-gray-700">
                    <span>Sales tax{quote.taxExempt ? ' (wholesale items exempt)' : ''}</span>
                    <span className="font-semibold">{quoteReady ? dollars(quote.taxCents) : pending}</span>
                  </div>
                )}
                <div className="flex justify-between gap-3 font-bold text-lg text-emerald-950 border-t border-emerald-200 pt-2 mt-1">
                  <span>Total</span>
                  <span>{quoteReady ? dollars(totalCents) : pending}</span>
                </div>
                <p className="text-xs text-emerald-800 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /> Paid in full online. Nothing to pay at pickup.
                </p>
              </div>
            )}
          </div>
        )}

        {!signedIn && (
          <div className="bg-white border-2 border-emerald-600 rounded-xl p-5 shadow-sm">
            <h2 className="font-bold text-gray-900 text-base flex items-center gap-1.5">
              <Mail className="w-5 h-5 text-emerald-600" aria-hidden="true" />
              <label htmlFor="checkout-guest-email">Your email address *</label>
            </h2>
            <p className="text-sm text-gray-600 mt-1 mb-3">No account needed. Your receipt and pickup code go here.</p>
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
        ) : wantsDelivery && !delivery ? (
          <p className="bg-white border rounded-xl p-5 shadow-sm text-sm text-gray-700 text-center">
            Add your delivery address and zip code above to continue.
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
              pickups={pickups}
              delivery={delivery}
              signedIn={signedIn}
              guestEmail={guestEmail}
              buyerName={buyerName}
              onBuyerNameChange={setBuyerName}
              grandTotal={totalCents / 100}
              onCartRejected={() => setRefreshCount((count) => count + 1)}
            />
          </Elements>
        )}

        <BuyerGuidance />

        <Link
          href="/browse"
          className="w-full inline-flex items-center justify-center gap-2 bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-50 font-bold py-3 rounded-xl text-sm"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Back to Browsing — Add More Produce
        </Link>
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
