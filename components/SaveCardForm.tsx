'use client';

import React, { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { Lock } from 'lucide-react';
import TurnstileBox from '@/components/TurnstileBox';
import { TURNSTILE_SITE_KEY } from '@/lib/turnstile';

const stripePublishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
// The test-mode helper button is switched off, as at checkout.
const stripePromise = stripePublishableKey
  ? loadStripe(stripePublishableKey, { developerTools: { assistant: { enabled: false } } })
  : null;

// Details shown in Apple Pay's sheet for a card saved for repeat charges.
export type RecurringInfo = {
  description: string;
  amountCents: number;
  label: string;
  everyDays: number;
  startDate?: string;
  endDate?: string;
  managementUrl: string;
};

type Props = {
  // Asks our server to start saving a card; returns Stripe's client secret.
  start: (captchaToken: string) => Promise<string>;
  // Called once Stripe has saved the card.
  onSaved: (setupIntentId: string) => Promise<void>;
  submitLabel: string;
  // Shown above the button, e.g. the agreement to tick.
  children?: React.ReactNode;
  recurring?: RecurringInfo;
  // Ask for the "I'm human" check (for joining; not needed to change a card).
  captcha?: boolean;
};

// Saves a card with Stripe for later charges, without charging it now. The
// card details go straight from the browser to Stripe.
export default function SaveCardForm(props: Props) {
  const { recurring } = props;
  return (
    <Elements
      stripe={stripePromise}
      options={{ mode: 'setup', currency: 'usd', allowedPaymentMethodTypes: ['card'] }}
    >
      <Inner {...props} recurring={recurring} />
    </Elements>
  );
}

function Inner({ start, onSaved, submitLabel, children, recurring, captcha }: Props) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaResetKey, setCaptchaResetKey] = useState(0);
  const [captchaUnavailable, setCaptchaUnavailable] = useState(false);
  const needsCaptcha = Boolean(captcha && TURNSTILE_SITE_KEY);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    setError(null);
    try {
      const { error: submitError } = await elements.submit();
      if (submitError) throw new Error(submitError.message || 'Please check your card details.');

      const clientSecret = await start(captchaToken);
      const { error: confirmError, setupIntent } = await stripe.confirmSetup({
        elements,
        clientSecret,
        confirmParams: { return_url: window.location.href },
        redirect: 'if_required',
      });
      if (confirmError) throw new Error(confirmError.message || 'Your card could not be saved.');
      if (setupIntent?.status !== 'succeeded') throw new Error('Your card could not be saved.');

      await onSaved(setupIntent.id);
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
      setCaptchaResetKey((key) => key + 1);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="min-h-[100px]">
        <PaymentElement
          options={
            recurring
              ? {
                  applePay: {
                    recurringPaymentRequest: {
                      paymentDescription: recurring.description,
                      managementURL: recurring.managementUrl,
                      regularBilling: {
                        amount: recurring.amountCents,
                        label: recurring.label,
                        recurringPaymentIntervalUnit: 'day',
                        recurringPaymentIntervalCount: recurring.everyDays,
                        ...(recurring.startDate ? { recurringPaymentStartDate: new Date(`${recurring.startDate}T12:00:00`) } : {}),
                        ...(recurring.endDate ? { recurringPaymentEndDate: new Date(`${recurring.endDate}T12:00:00`) } : {}),
                      },
                    },
                  },
                }
              : undefined
          }
        />
      </div>

      {children}

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
        className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white font-bold rounded-xl shadow-md transition-colors text-sm"
      >
        {busy ? 'Saving…' : submitLabel}
      </button>

      <p className="flex items-center justify-center gap-1 text-xs text-gray-400">
        <Lock className="w-3.5 h-3.5" /> Your card is saved securely by Stripe, never on our servers.
      </p>
    </form>
  );
}
