'use client';

import { useState } from 'react';
import { Star } from 'lucide-react';
import { postWithAuth } from '@/lib/authedFetch';

// A star rating and optional comment for a picked-up order. `token` is the
// secret from a guest's order link; signed-in buyers don't need one.
export default function ReviewForm({
  orderId,
  token,
  alreadyReviewed = false,
}: {
  orderId: string;
  token?: string | null;
  alreadyReviewed?: boolean;
}) {
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(alreadyReviewed);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (submitted) {
    return (
      <p role="status" className="text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
        Thanks — your review of this order is posted on the farm&apos;s page.
      </p>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating < 1) {
      setErrorMsg('Choose a star rating first.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await postWithAuth('/api/reviews', { orderId, rating, comment, ...(token ? { token } : {}) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save your review.');
      setSubmitted(true);
    } catch (err: any) {
      setErrorMsg(err.message || 'Could not save your review.');
    } finally {
      setSubmitting(false);
    }
  };

  const fieldId = `review-comment-${orderId}`;

  return (
    <form onSubmit={handleSubmit} className="bg-amber-50/60 border border-amber-200 rounded-xl p-4 space-y-3">
      <p id={`review-label-${orderId}`} className="text-sm font-bold text-gray-900">
        How was your order? Leave the farm a review
      </p>

      <div role="radiogroup" aria-labelledby={`review-label-${orderId}`} className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={rating === value}
            aria-label={`${value} star${value === 1 ? '' : 's'}`}
            onClick={() => setRating(value)}
            onMouseEnter={() => setHovered(value)}
            onMouseLeave={() => setHovered(0)}
            className="p-1"
          >
            <Star
              className={`w-7 h-7 ${
                value <= (hovered || rating) ? 'text-amber-500 fill-amber-400' : 'text-gray-300'
              }`}
              aria-hidden="true"
            />
          </button>
        ))}
      </div>

      <div>
        <label htmlFor={fieldId} className="block text-xs font-semibold text-gray-700 mb-1">
          Comments (optional)
        </label>
        <textarea
          id={fieldId}
          rows={2}
          maxLength={1000}
          placeholder="What did you think of the produce and the pickup?"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
        />
      </div>

      {errorMsg && (
        <p role="alert" className="text-xs text-red-700">
          {errorMsg}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="inline-flex items-center bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-400 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-colors"
      >
        {submitting ? 'Posting...' : 'Post Review'}
      </button>
      <p className="text-[11px] text-gray-500">
        Reviews are public and shown on the farm&apos;s page without your name or email.
      </p>
    </form>
  );
}
