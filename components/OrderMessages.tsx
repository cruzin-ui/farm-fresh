'use client';

import { useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { postWithAuth } from '@/lib/authedFetch';

type Message = { id: string; sender: 'buyer' | 'seller'; body: string; created_at: string };

// The conversation between a buyer and a farmer about an order, opened from a
// button. Messages are relayed by the site — neither side sees the other's
// email address. `role` is who is looking; `token` is the secret from a
// guest's order link.
export default function OrderMessages({
  orderId,
  role,
  token,
}: {
  orderId: string;
  role: 'buyer' | 'seller';
  token?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [canSend, setCanSend] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const other = role === 'buyer' ? 'the farmer' : 'the buyer';
  const inputId = `message-${orderId}`;

  const call = async (body?: string) => {
    const res = await postWithAuth('/api/orders/messages', {
      orderId,
      ...(token ? { token } : {}),
      ...(body ? { body } : {}),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Messages are not available right now.');
    setMessages(data.messages);
    setCanSend(data.canSend);
  };

  const toggle = async () => {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    setLoading(true);
    setError(null);
    try {
      await call();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    setSending(true);
    setError(null);
    try {
      await call(draft.trim());
      setDraft('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="print:hidden">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="inline-flex items-center justify-center gap-1.5 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 text-xs font-bold px-3.5 py-2 rounded-xl"
      >
        <MessageCircle className="w-4 h-4" aria-hidden="true" />
        {open ? 'Hide Messages' : role === 'buyer' ? 'Message the Farmer' : 'Message Buyer'}
      </button>

      {open && (
        <div className="mt-2 bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-3 text-sm">
          {loading ? (
            <p className="text-xs text-gray-500">Loading messages...</p>
          ) : messages.length === 0 ? (
            <p className="text-xs text-gray-600">
              No messages yet. Use this for things like running late or finding the right gate.
            </p>
          ) : (
            <ul className="space-y-2" aria-live="polite">
              {messages.map((message) => {
                const mine = message.sender === role;
                return (
                  <li key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[85%] rounded-xl px-3 py-2 ${
                        mine ? 'bg-emerald-700 text-white' : 'bg-white border border-gray-200 text-gray-900'
                      }`}
                    >
                      <p className={`text-[11px] font-bold ${mine ? 'text-emerald-100' : 'text-gray-500'}`}>
                        {mine ? 'You' : role === 'buyer' ? 'Farmer' : 'Buyer'} ·{' '}
                        {new Date(message.created_at).toLocaleString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </p>
                      <p className="whitespace-pre-wrap break-words">{message.body}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {error && (
            <p role="alert" className="text-xs font-semibold text-red-700">
              {error}
            </p>
          )}

          {canSend ? (
            <form onSubmit={send} className="space-y-2">
              <label htmlFor={inputId} className="sr-only">
                Message to {other}
              </label>
              <textarea
                id={inputId}
                rows={2}
                maxLength={1000}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={`Write a message to ${other}...`}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
              />
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="text-[11px] text-gray-500">
                  We email {other} your message. Keep payment on Farm Fresh Direct — never pay or accept cash.
                </p>
                <button
                  type="submit"
                  disabled={sending || !draft.trim()}
                  className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-400 text-white text-xs font-bold px-3.5 py-2 rounded-xl"
                >
                  {sending ? 'Sending...' : 'Send'}
                </button>
              </div>
            </form>
          ) : (
            !loading && <p className="text-xs text-gray-600">This order is closed, so messages are off.</p>
          )}
        </div>
      )}
    </div>
  );
}
