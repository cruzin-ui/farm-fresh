'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CreditCard, Package, AlertCircle, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { postWithAuth } from '@/lib/authedFetch';
import SaveCardForm from '@/components/SaveCardForm';
import { describeFrequency, formatBoxDate } from '@/lib/csaSchedule';

type Box = {
  date: string;
  label: string;
  chargeDate: string;
  state: 'upcoming' | 'skipped' | 'paid' | 'failed' | 'missed' | 'paused' | 'charging' | 'farm_skipped';
  canSkip: boolean;
  orderId: string | null;
  note: string;
  farmReason: string;
  error: string;
};

type Membership = {
  id: string;
  status: 'active' | 'paused' | 'cancelled';
  cardLabel: string;
  cost: { priceCents: number; feeCents: number; totalCents: number };
  joinedAt: string;
  cancelledAt: string | null;
  plan: {
    id: string;
    name: string;
    description: string;
    frequency: string;
    pickupWeekday: number;
    pickupWindow: string;
    seasonEnd: string;
    status: string;
  };
  farm: { id: string; name: string; slug: string | null };
  boxes: Box[];
};

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

const STATE_TEXT: Record<Box['state'], { text: string; className: string }> = {
  upcoming: { text: 'Coming', className: 'bg-emerald-50 text-emerald-800' },
  skipped: { text: 'Skipped', className: 'bg-gray-100 text-gray-600' },
  paid: { text: 'Paid', className: 'bg-emerald-600 text-white' },
  failed: { text: 'Card declined', className: 'bg-red-100 text-red-800' },
  missed: { text: 'Missed (not charged)', className: 'bg-gray-100 text-gray-600' },
  paused: { text: 'Paused', className: 'bg-gray-100 text-gray-600' },
  charging: { text: 'Being charged', className: 'bg-amber-100 text-amber-900' },
  farm_skipped: { text: 'No box this week', className: 'bg-amber-100 text-amber-900' },
};

// A member's Farm Boxes: their upcoming boxes, skipping a week, pausing,
// cancelling, and the card their boxes are charged to.
export default function MyFarmSharesPage() {
  const router = useRouter();
  const [memberships, setMemberships] = useState<Membership[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [changingCard, setChangingCard] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const call = async (body: Record<string, unknown>, key: string) => {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      const res = await postWithAuth('/api/csa/membership', body);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Something went wrong.');
      if (json.memberships) setMemberships(json.memberships);
      return json;
    } catch (err: any) {
      setError(err.message);
      return null;
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.push('/login?redirect=/account/csa');
        return;
      }
      await call({ action: 'list' }, 'load');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const live = (memberships || []).filter((m) => m.status !== 'cancelled' && m.plan.status !== 'ended');
  const past = (memberships || []).filter((m) => m.status === 'cancelled' || m.plan.status === 'ended');
  const cardLabel = live[0]?.cardLabel;
  const hasFailed = live.some((m) => m.boxes.some((b) => b.state === 'failed'));

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <Link href="/account" className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-800">
        <ArrowLeft className="w-4 h-4" /> Account
      </Link>
      <header>
        <h1 className="text-2xl font-extrabold text-gray-900">My Farm Boxes</h1>
        <p className="text-sm text-gray-600">
          Skip a week, pause or cancel any time before a box is charged.
        </p>
      </header>

      {error && (
        <p role="alert" className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm flex gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {error}
        </p>
      )}
      {notice && (
        <p role="status" className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-sm flex gap-2">
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> {notice}
        </p>
      )}

      {memberships === null ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : live.length === 0 && past.length === 0 ? (
        <div className="bg-white border rounded-xl p-6 text-center space-y-2">
          <Package className="w-8 h-8 text-emerald-600 mx-auto" />
          <p className="text-sm text-gray-700">
            You haven't signed up for a Farm Box yet. A Farm Box is a box of whatever a local farm is harvesting
            that week, picked up on a set day. You pay per box and can skip or pause any time, and your regular order
            gives a small grower steady sales they can plan around. Farms that offer one show it on their farm page.
          </p>
          <Link href="/browse" className="text-sm font-semibold text-emerald-800 underline">
            Find local farms
          </Link>
        </div>
      ) : null}

      {live.length > 0 && (
        <section className={`bg-white border rounded-xl p-5 space-y-3 ${hasFailed ? 'border-red-300' : ''}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-gray-800 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-emerald-600" />
              Boxes are charged to <strong>{cardLabel || 'your saved card'}</strong>
            </p>
            {!changingCard && (
              <button
                onClick={() => setChangingCard(true)}
                className="text-xs font-semibold border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50"
              >
                Change card
              </button>
            )}
          </div>
          {hasFailed && !changingCard && (
            <p className="text-xs text-red-700">
              Your card was declined for an upcoming box. Change your card and we'll charge the new one straight away.
            </p>
          )}
          {changingCard && (
            <div className="border-t pt-3 space-y-2">
              <p className="text-xs text-gray-600">The new card is used for all your Farm Boxes.</p>
              <SaveCardForm
                submitLabel="Save this card"
                start={async () => {
                  const res = await postWithAuth('/api/csa/membership', { action: 'card_start' });
                  const json = await res.json();
                  if (!res.ok) throw new Error(json.error || 'Could not start.');
                  return json.clientSecret;
                }}
                onSaved={async (setupIntentId) => {
                  const json = await call({ action: 'card_finish', setupIntentId }, 'card');
                  if (!json) throw new Error('Your new card could not be saved.');
                  setChangingCard(false);
                  await call({ action: 'list' }, 'load');
                  setNotice(
                    `Saved: ${json.cardLabel}.${json.retried ? ` ${json.retried} declined box${json.retried === 1 ? ' has' : 'es have'} now been paid.` : ''}`
                  );
                }}
              />
              <button onClick={() => setChangingCard(false)} className="text-xs font-semibold text-gray-600 underline">
                Keep my current card
              </button>
            </div>
          )}
        </section>
      )}

      {live.map((m) => {
        const farmPath = m.farm.slug ? `/${m.farm.slug}` : `/sellers/${m.farm.id}`;
        return (
          <section key={m.id} className="bg-white border rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-lg font-bold text-gray-900">{m.plan.name}</h2>
                <p className="text-sm text-gray-600">
                  <Link href={farmPath} className="font-semibold text-emerald-800 underline">
                    {m.farm.name}
                  </Link>{' '}
                  · {describeFrequency({ pickup_weekday: m.plan.pickupWeekday, frequency: m.plan.frequency })}
                  {m.plan.pickupWindow ? `, ${m.plan.pickupWindow}` : ''} · until {formatBoxDate(m.plan.seasonEnd)}
                </p>
                <p className="text-sm text-gray-600">
                  {dollars(m.cost.totalCents)} per box, plus any sales tax
                </p>
              </div>
              {m.status === 'paused' && (
                <span className="text-xs font-bold bg-gray-100 text-gray-700 rounded-full px-3 py-1">Paused</span>
              )}
            </div>

            <ul className="divide-y border rounded-lg">
              {m.boxes.length === 0 && <li className="p-3 text-sm text-gray-500">No more pickups this season.</li>}
              {m.boxes.map((b) => (
                <li key={b.date} className="p-3 space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-gray-900">{b.label}</span>
                    <span className="flex items-center gap-2">
                      <span className={`text-[11px] font-bold rounded-full px-2 py-0.5 ${STATE_TEXT[b.state].className}`}>
                        {STATE_TEXT[b.state].text}
                      </span>
                      {b.canSkip && (
                        <button
                          disabled={busy !== null}
                          onClick={() =>
                            call({ action: b.state === 'skipped' ? 'unskip' : 'skip', memberId: m.id, boxDate: b.date }, `${m.id}${b.date}`)
                          }
                          className="text-xs font-semibold border border-gray-300 rounded-lg px-2.5 py-1 hover:bg-gray-50 disabled:opacity-50"
                        >
                          {busy === `${m.id}${b.date}` ? '…' : b.state === 'skipped' ? 'Undo skip' : 'Skip this week'}
                        </button>
                      )}
                      {b.state === 'paid' && (
                        <Link href="/orders" className="text-xs font-semibold text-emerald-800 underline">
                          Pickup code
                        </Link>
                      )}
                    </span>
                  </div>
                  {b.state === 'upcoming' && (
                    <p className="text-xs text-gray-500">Charged {formatBoxDate(b.chargeDate)}. Skip before then and you won't be charged.</p>
                  )}
                  {b.note && <p className="text-xs text-emerald-900 bg-emerald-50 rounded p-2">From the farm: {b.note}</p>}
                  {b.state === 'farm_skipped' && b.farmReason && <p className="text-xs text-amber-900">{b.farmReason}</p>}
                  {b.state === 'failed' && (
                    <p className="text-xs text-red-700">{b.error || 'Your card was declined.'} Change your card above to get this box.</p>
                  )}
                </li>
              ))}
            </ul>

            <div className="flex flex-wrap gap-2">
              {m.status === 'active' ? (
                <button
                  disabled={busy !== null}
                  onClick={() => call({ action: 'pause', memberId: m.id }, `pause${m.id}`)}
                  className="text-xs font-semibold border border-gray-300 rounded-lg px-3 py-2 hover:bg-gray-50 disabled:opacity-50"
                >
                  Pause my boxes
                </button>
              ) : (
                <button
                  disabled={busy !== null}
                  onClick={() => call({ action: 'resume', memberId: m.id }, `resume${m.id}`)}
                  className="text-xs font-bold bg-emerald-600 text-white rounded-lg px-3 py-2 disabled:opacity-50"
                >
                  Resume my boxes
                </button>
              )}
              <button
                onClick={() => {
                  setCancelling(m.id);
                  setCancelReason('');
                }}
                className="text-xs font-semibold text-red-700 border border-red-200 rounded-lg px-3 py-2 hover:bg-red-50"
              >
                Cancel membership
              </button>
            </div>
            {m.status === 'paused' && (
              <p className="text-xs text-gray-500">While paused you aren't charged and get no boxes. Resume whenever you like.</p>
            )}

            {cancelling === m.id && (
              <div className="border border-red-200 bg-red-50 rounded-lg p-3 space-y-2">
                <p className="text-sm text-red-900">
                  Cancel {m.plan.name}? You won't be charged for any more boxes. Boxes already paid for are still yours to
                  collect.
                </p>
                <label className="block text-xs font-semibold text-gray-700" htmlFor={`cancel-${m.id}`}>
                  Anything you'd like the farm to know? (optional)
                </label>
                <input
                  id={`cancel-${m.id}`}
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  maxLength={300}
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
                />
                <div className="flex gap-2">
                  <button
                    disabled={busy !== null}
                    onClick={async () => {
                      const json = await call({ action: 'cancel', memberId: m.id, reason: cancelReason }, `cancel${m.id}`);
                      if (json) {
                        setCancelling(null);
                        setNotice(`Your ${m.plan.name} membership is cancelled.`);
                      }
                    }}
                    className="text-xs font-bold bg-red-600 text-white rounded-lg px-3 py-2 disabled:opacity-50"
                  >
                    Yes, cancel it
                  </button>
                  <button onClick={() => setCancelling(null)} className="text-xs font-semibold text-gray-700 underline">
                    Keep it
                  </button>
                </div>
              </div>
            )}
          </section>
        );
      })}

      {past.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-gray-700">Past Farm Boxes</h2>
          {past.map((m) => (
            <div key={m.id} className="bg-gray-50 border rounded-lg p-3 text-sm text-gray-600">
              {m.plan.name} · {m.farm.name} ·{' '}
              {m.status === 'cancelled' && m.cancelledAt
                ? `cancelled ${new Date(m.cancelledAt).toLocaleDateString()}`
                : 'season ended'}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
