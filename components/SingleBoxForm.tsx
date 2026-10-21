'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { Lock } from 'lucide-react';
import TurnstileBox from '@/components/TurnstileBox';
import { TURNSTILE_SITE_KEY } from '@/lib/turnstile';
import { BUYER_FEE_LABEL } from '@/lib/pricing';
import { postWithAuth } from '@/lib/authedFetch';

const stripePublishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const stripePromise = stripePublishableKey
  ? loadStripe(stripePublishableKey, { developerTools: { assistant: { enabled: false } } })
  : null;

type Quote = {
  boxDate: string;
  boxLabel: string;
  priceCents: number;
  feeCents: number;
  taxCents: number;
  totalCents: number;
  // A shared box: a farm whose part isn't in that week's box.
  leftOut?: string;
};

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

// Buying a single Farm Box, with no sign-up and no saved card: a one-off
// payment for the next box, recorded as an ordinary order. Guests can buy one
// with an email address, as at checkout.
export default function SingleBoxForm({
  planId,
  pickupWindow,
  signedIn,
}: {
  planId: string;
  pickupWindow: string;
  signedIn: boolean;
}) {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    postWithAuth('/api/csa/single', { action: 'quote', planId })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) setProblem(json.error || 'This box can’t be bought right now.');
        else setQuote(json);
      })
      .catch(() => setProblem('This box can’t be bought right now.'));
  }, [planId]);

  if (problem) return <p className="text-sm text-gray-700 text-center">{problem}</p>;
  if (!quote) return <p className="text-sm text-gray-500">Working out the price…</p>;

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-700">
        One box for <strong>{quote.boxLabel}</strong>
        {pickupWindow ? `, ${pickupWindow}` : ''}. Paid now; no sign-up and nothing charged again.
      </p>
      {quote.leftOut && <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-2">{quote.leftOut}</p>}
      <div className="text-sm space-y-1 border rounded-lg p-3">
        <div className="flex justify-between text-gray-700">
          <span>Box</span>
          <span>{dollars(quote.priceCents)}</span>
        </div>
        <div className="flex justify-between text-gray-700">
          <span>Service fee ({BUYER_FEE_LABEL})</span>
          <span>{dollars(quote.feeCents)}</span>
        </div>
        {quote.taxCents > 0 && (
          <div className="flex justify-between text-gray-700">
            <span>Sales tax</span>
            <span>{dollars(quote.taxCents)}</span>
          </div>
        )}
        <div className="flex justify-between font-bold text-gray-900">
          <span>Total</span>
          <span>{dollars(quote.totalCents)}</span>
        </div>
      </div>
      <Elements
        stripe={stripePromise}
        options={{ mode: 'payment', amount: quote.totalCents, currency: 'usd', allowedPaymentMethodTypes: ['card'] }}
      >
        <PayForm planId={planId} totalCents={quote.totalCents} signedIn={signedIn} />
      </Elements>
    </div>
  );
}

function PayForm({ planId, totalCents, signedIn }: { planId: string; totalCents: number; signedIn: boolean }) {
  const router = useRouter();
  const stripe = useStripe();
  const elements = useElements();
  const [guestEmail, setGuestEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaResetKey, setCaptchaResetKey] = useState(0);
  const [captchaUnavailable, setCaptchaUnavailable] = useState(false);
  const needsCaptcha = Boolean(TURNSTILE_SITE_KEY);

  const pay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    setError(null);
    try {
      const { error: submitError } = await elements.submit();
      if (submitError) throw new Error(submitError.message || 'Please check your card details.');

      const res = await postWithAuth('/api/csa/single', {
        action: 'pay',
        planId,
        captchaToken,
        ...(signedIn ? {} : { guestEmail }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not start payment.');

      const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
        elements,
        clientSecret: json.clientSecret,
        confirmParams: { return_url: window.location.href },
        redirect: 'if_required',
      });
      if (confirmError) throw new Error(confirmError.message || 'Payment failed.');
      if (paymentIntent?.status !== 'succeeded') throw new Error('Payment was not completed.');

      // Recorded exactly like a checkout.
      const completeRes = await postWithAuth('/api/checkout/complete', {
        paymentIntentId: paymentIntent.id,
        clientSecret: json.clientSecret,
      });
      const completeData = await completeRes.json();
      if (!completeRes.ok) {
        throw new Error(
          `Your payment went through, but we couldn't record your order. Please contact us with reference ${paymentIntent.id}.`
        );
      }
      router.push(
        `/orders/confirmation?orderId=${completeData.orderId}` +
          (completeData.guestToken ? `&token=${completeData.guestToken}` : '')
      );
    } catch (err: any) {
      setError(err.message || 'Payment failed.');
      setCaptchaResetKey((key) => key + 1);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={pay} className="space-y-4">
      {!signedIn && (
        <div>
          <label htmlFor="single-box-email" className="block text-xs font-semibold text-gray-700 mb-1">
            Email for your confirmation and pickup code *
          </label>
          <input
            id="single-box-email"
            type="email"
            required
            autoComplete="email"
            value={guestEmail}
            onChange={(e) => setGuestEmail(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg text-sm"
          />
        </div>
      )}
      <div className="min-h-[100px]">
        <PaymentElement />
      </div>
      <label className="flex items-start gap-2 text-sm text-gray-700">
        <input type="checkbox" required className="mt-0.5 w-4 h-4 shrink-0" />
        <span>
          I won&apos;t give my pickup code to the farmer until I have my box. I agree to the{' '}
          <Link href="/terms" target="_blank" className="font-semibold text-emerald-800 underline">
            Terms of Use
          </Link>
          .
        </span>
      </label>
      {needsCaptcha && (
        <TurnstileBox
          siteKey={TURNSTILE_SITE_KEY}
          onToken={(token) => {
            setCaptchaToken(token);
            if (token) setCaptchaUnavailable(false);
          }}
          onUnavailable={() => setCaptchaUnavailable(true)}
          resetKey={captchaResetKey}
        />
      )}
      {error && (
        <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-200 p-2 rounded-lg">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy || !stripe || !elements || (needsCaptcha && !captchaToken && !captchaUnavailable)}
        className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white font-bold rounded-xl shadow-md text-sm"
      >
        {busy ? 'Processing payment…' : `Pay ${dollars(totalCents)} for one box`}
      </button>
      <p className="flex items-center justify-center gap-1 text-xs text-gray-400">
        <Lock className="w-3.5 h-3.5" /> Secure checkout powered by Stripe
      </p>
    </form>
  );
}
