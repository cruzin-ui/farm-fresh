'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Mail, CheckCircle2, AlertCircle } from 'lucide-react';
import TurnstileBox from '@/components/TurnstileBox';
import { TURNSTILE_SITE_KEY } from '@/lib/turnstile';

// For someone who checked out without an account and has lost their
// confirmation email: they enter the address they ordered with and are emailed
// the links to their orders again. Nothing is shown here, so only the owner of
// that inbox can get to an order.
export default function FindMyOrderPage() {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaResetKey, setCaptchaResetKey] = useState(0);
  const [captchaUnavailable, setCaptchaUnavailable] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/orders/find', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, captchaToken }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
      setSentTo(email.trim());
    } catch (err: any) {
      setErrorMsg(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSending(false);
      // Each proof works once.
      setCaptchaToken('');
      setCaptchaResetKey((key) => key + 1);
    }
  };

  return (
    <div className="max-w-md mx-auto px-2 py-8">
      <Link href="/browse" className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-emerald-600 mb-4 font-medium">
        <ArrowLeft className="w-3.5 h-3.5" /> Back to Produce
      </Link>

      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
        <h1 className="text-2xl font-bold text-gray-900">Find my order</h1>

        {sentTo ? (
          <div role="status" className="mt-4 space-y-3">
            <p className="flex items-start gap-2 text-sm text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0" aria-hidden="true" />
              <span>
                If we have orders for <strong className="break-all">{sentTo}</strong>, we've emailed the links to that
                address.
              </span>
            </p>
            <p className="text-sm text-gray-600">
              It can take a minute to arrive. Check your spam or junk folder too. Nothing arrived? You may have ordered
              with a different address, or mistyped it at checkout.{' '}
              <Link href="/contact" className="font-semibold text-emerald-800 underline">
                Contact us
              </Link>{' '}
              and we'll help.
            </p>
            <button
              type="button"
              onClick={() => setSentTo(null)}
              className="text-sm font-semibold text-emerald-800 underline"
            >
              Try a different address
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-2 space-y-4">
            <p className="text-sm text-gray-600">
              Ordered without an account and can't find your confirmation email? Enter the email address you ordered
              with and we'll send the links to your orders, with your pickup codes, to that address.
            </p>

            <div>
              <label htmlFor="find-email" className="block text-xs font-semibold text-gray-700 mb-1">
                Email address you ordered with
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                <input
                  id="find-email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 border rounded-xl text-sm"
                />
              </div>
            </div>

            {TURNSTILE_SITE_KEY && (
              <TurnstileBox
                siteKey={TURNSTILE_SITE_KEY}
                onToken={setCaptchaToken}
                onUnavailable={() => setCaptchaUnavailable(true)}
                resetKey={captchaResetKey}
              />
            )}

            {errorMsg && (
              <p role="alert" className="flex items-start gap-2 text-sm text-red-800 bg-red-50 border border-red-200 rounded-xl p-3">
                <AlertCircle className="w-5 h-5 shrink-0" aria-hidden="true" /> {errorMsg}
              </p>
            )}

            <button
              type="submit"
              disabled={sending || Boolean(TURNSTILE_SITE_KEY && !captchaToken && !captchaUnavailable)}
              className="w-full inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white font-bold py-3 rounded-xl text-sm transition-colors"
            >
              {sending ? 'Sending...' : 'Email Me My Order Links'}
            </button>

            <p className="text-xs text-gray-500">
              Have an account?{' '}
              <Link href="/login?redirect=/orders" className="font-semibold text-emerald-800 underline">
                Sign in
              </Link>{' '}
              to see your orders under My Orders.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
