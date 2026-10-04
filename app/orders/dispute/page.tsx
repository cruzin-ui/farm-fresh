'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { NO_SHOW_REVIEW_HOURS } from '@/lib/noShow';

// Where the "this isn't right" link in a buyer's no-show email lands. The
// buyer confirms with a button (rather than the link acting by itself) so that
// email programs that open links automatically can't respond on their behalf.
function DisputeContent() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get('orderId');
  const sig = searchParams.get('sig');

  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/orders/dispute-no-show', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, sig, message }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not record your response.');
      setDone(true);
    } catch (err: any) {
      setErrorMsg(err.message || 'Could not record your response.');
    } finally {
      setSending(false);
    }
  };

  if (!orderId || !sig) {
    return (
      <div className="max-w-md mx-auto my-12 p-6 bg-white border rounded-2xl text-center text-sm text-gray-600 shadow-sm">
        This link is incomplete. Please use the link from your email, or{' '}
        <Link href="/contact" className="font-semibold text-emerald-800 underline">
          contact us
        </Link>
        .
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-8 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">About your missed pickup</h1>

      {done ? (
        <div role="status" className="p-5 bg-emerald-50 border border-emerald-200 rounded-2xl text-sm text-emerald-900 space-y-2">
          <p className="flex items-center gap-2 font-bold">
            <CheckCircle2 className="w-5 h-5 text-emerald-700" aria-hidden="true" /> Thanks — we've got your response
          </p>
          <p>
            Your order won't be closed automatically. We'll look into it and email you. If you still want to
            collect it, get in touch with us so we can arrange it with the farmer.
          </p>
          <Link href="/contact" className="inline-block font-semibold text-emerald-800 underline">
            Contact us
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="bg-white border rounded-2xl p-5 shadow-sm space-y-4">
          <p className="text-sm text-gray-700">
            The farmer told us your order wasn't picked up. If that's not right, or you still want your order,
            tell us here. Otherwise the order is closed {NO_SHOW_REVIEW_HOURS} hours after the farmer's report.
          </p>

          {errorMsg && (
            <div role="alert" className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-center gap-2 text-sm">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0" aria-hidden="true" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div>
            <label htmlFor="dispute-message" className="block text-xs font-semibold text-gray-700 mb-1">
              What happened? (optional)
            </label>
            <textarea
              id="dispute-message"
              rows={4}
              maxLength={1000}
              placeholder="e.g., I came at the time the farmer gave me and nobody was there."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg text-sm"
            />
          </div>

          <button
            type="submit"
            disabled={sending}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 px-6 rounded-xl text-sm transition-colors shadow-md disabled:bg-gray-400"
          >
            {sending ? 'Sending...' : "This isn't right — please review my order"}
          </button>
        </form>
      )}
    </div>
  );
}

export default function DisputeNoShowPage() {
  return (
    <Suspense fallback={<div className="max-w-xl mx-auto my-20 p-8 text-center text-gray-500 text-sm">Loading...</div>}>
      <DisputeContent />
    </Suspense>
  );
}
