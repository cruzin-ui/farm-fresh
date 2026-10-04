'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Mail, CheckCircle2, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { postWithAuth } from '@/lib/authedFetch';

export default function ContactPage() {
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  // Hidden from people; only bots fill it in. See /api/contact.
  const [website, setWebsite] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Save signed-in users from retyping their email.
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user.email) setEmail((current) => current || session.user.email || '');
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setErrorMsg(null);

    try {
      const res = await postWithAuth('/api/contact', { email, subject, message, website });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not send your message.');

      setSent(true);
      setSubject('');
      setMessage('');
    } catch (err: any) {
      setErrorMsg(err.message || 'Could not send your message.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Mail className="w-6 h-6 text-emerald-700" aria-hidden="true" /> Contact Us
        </h1>
        <p className="text-sm text-gray-600 mt-1">
          Questions about an order, a problem at pickup, or anything else — send us a message and we'll
          reply by email.
        </p>
      </div>

      {sent ? (
        <div role="status" className="p-5 bg-emerald-50 border border-emerald-200 rounded-2xl text-sm text-emerald-900 space-y-3">
          <p className="flex items-center gap-2 font-bold">
            <CheckCircle2 className="w-5 h-5 text-emerald-700" aria-hidden="true" /> Message sent
          </p>
          <p>Thanks — we've got your message and will reply to {email}.</p>
          <div className="flex gap-3">
            <button
              onClick={() => setSent(false)}
              className="font-semibold text-emerald-800 underline"
            >
              Send another message
            </button>
            <Link href="/browse" className="font-semibold text-emerald-800 underline">
              Back to Marketplace
            </Link>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="bg-white border rounded-2xl p-5 shadow-sm space-y-4">
          {errorMsg && (
            <div role="alert" className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-center gap-2 text-sm">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0" aria-hidden="true" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div>
            <label htmlFor="contact-email" className="block text-xs font-semibold text-gray-700 mb-1">
              Your email *
            </label>
            <input
              id="contact-email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg text-sm"
            />
          </div>

          <div>
            <label htmlFor="contact-subject" className="block text-xs font-semibold text-gray-700 mb-1">
              Subject *
            </label>
            <input
              id="contact-subject"
              type="text"
              required
              maxLength={150}
              placeholder="e.g., Problem with my order"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg text-sm"
            />
          </div>

          <div>
            <label htmlFor="contact-message" className="block text-xs font-semibold text-gray-700 mb-1">
              Message *
            </label>
            <textarea
              id="contact-message"
              required
              rows={6}
              maxLength={4000}
              placeholder="Tell us what's going on. If it's about an order, include the order number or the email you ordered with."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg text-sm"
            />
          </div>

          {/* Honeypot: kept out of sight and out of the tab order. */}
          <div className="hidden" aria-hidden="true">
            <label htmlFor="contact-website">Website</label>
            <input
              id="contact-website"
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={sending}
            className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-semibold py-3 px-6 rounded-xl text-sm transition-colors shadow-md disabled:bg-gray-400"
          >
            {sending ? 'Sending...' : 'Send Message'}
          </button>
        </form>
      )}
    </div>
  );
}
