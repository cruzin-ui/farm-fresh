'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Package, Plus, AlertCircle, CheckCircle2, Users, ChevronDown } from 'lucide-react';
import { postWithAuth } from '@/lib/authedFetch';
import { boxCostCents } from '@/lib/csaTerms';
import { describeFrequency, formatBoxDate, todayInArizona, WEEKDAYS, CHARGE_DAYS_BEFORE } from '@/lib/csaSchedule';
import { SELLER_FEE_RATE } from '@/lib/pricing';

type Week = {
  date: string;
  label: string;
  chargeLabel: string;
  canChange: boolean;
  note: string;
  skipped: boolean;
  skipReason: string;
  boxes: number;
  paid: number;
  failed: number;
  memberSkips: number;
};

type Plan = {
  id: string;
  name: string;
  description: string;
  priceDollars: string;
  frequency: string;
  pickupWeekday: number;
  pickupWindow: string;
  seasonStart: string;
  seasonEnd: string;
  maxMembers: number | null;
  status: 'open' | 'closed' | 'ended';
  everJoined: boolean;
  counts: { active: number; paused: number; cancelled: number };
  members: { id: string; who: string; status: string; joined: string; priceDollars: string; cancelledAt: string | null }[];
  weeks: Week[];
};

type Form = {
  id?: string;
  name: string;
  description: string;
  priceDollars: string;
  frequency: string;
  pickupWeekday: string;
  pickupWindow: string;
  seasonStart: string;
  seasonEnd: string;
  maxMembers: string;
  status: string;
};

const EMPTY_FORM: Form = {
  name: '',
  description: '',
  priceDollars: '',
  frequency: 'weekly',
  pickupWeekday: '4',
  pickupWindow: '',
  seasonStart: '',
  seasonEnd: '',
  maxMembers: '',
  status: 'open',
};

const STATUS_PILL: Record<Plan['status'], string> = {
  open: 'bg-emerald-100 text-emerald-800',
  closed: 'bg-amber-100 text-amber-900',
  ended: 'bg-gray-100 text-gray-600',
};
const STATUS_TEXT: Record<Plan['status'], string> = {
  open: 'Taking members',
  closed: 'Not taking new members',
  ended: 'Ended',
};

// The CSA section of the Seller Dashboard: set up farm shares, write each
// week's box note, call a week off, and see who is getting a box.
export default function SellerCsa({
  sellerTermsAccepted,
  hasPickupAddress,
  onGoToProfile,
  onGoToSettings,
}: {
  sellerTermsAccepted: boolean;
  hasPickupAddress: boolean;
  onGoToProfile: () => void;
  onGoToSettings: () => void;
}) {
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [payoutsProblem, setPayoutsProblem] = useState<string | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [reasonFor, setReasonFor] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [openMembers, setOpenMembers] = useState<string | null>(null);

  const call = async (body: Record<string, unknown>, key: string, successText?: string) => {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      const res = await postWithAuth('/api/csa/farm', body);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Something went wrong.');
      setPlans(json.plans);
      setPayoutsProblem(json.payoutsProblem || null);
      if (successText) setNotice(successText);
      return json;
    } catch (err: any) {
      setError(err.message);
      return null;
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    call({ action: 'get' }, 'load');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const noteKey = (planId: string, date: string) => `${planId}|${date}`;
  const field = (name: keyof Form) => ({
    value: form?.[name] || '',
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((current) => (current ? { ...current, [name]: e.target.value } : current)),
  });

  const priceCents = Math.round(Number(form?.priceDollars || 0) * 100);
  const cost = priceCents > 0 ? boxCostCents(priceCents) : null;
  const farmKeepsCents = priceCents - Math.round(priceCents * SELLER_FEE_RATE);
  const editingJoined = Boolean(form?.id && plans?.find((p) => p.id === form.id)?.everJoined);
  const running = (plans || []).filter((p) => p.status !== 'ended');
  const ended = (plans || []).filter((p) => p.status === 'ended');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Package className="w-5 h-5 text-emerald-600" /> Farm Shares (CSA)
          </h2>
          <p className="text-sm text-gray-600 max-w-xl">
            Members get a box from you on a set day, all season. Each box is charged to their saved card{' '}
            {CHARGE_DAYS_BEFORE} days before pickup and shows up in your Orders and Pick List like any order. You're paid
            when they collect it, as usual.
          </p>
        </div>
        {!form && (
          <button
            onClick={() => {
              setForm({ ...EMPTY_FORM, seasonStart: todayInArizona() });
              setError(null);
            }}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm"
          >
            <Plus className="w-4 h-4" /> New farm share
          </button>
        )}
      </div>

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

      {payoutsProblem && running.length > 0 && (
        <p className="p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-sm">
          <strong>Not open to members yet:</strong> people can join once you've finished setting up payouts.{' '}
          <button onClick={onGoToSettings} className="font-semibold underline">
            Payouts & Settings
          </button>
        </p>
      )}

      {/* ---------- create / edit ---------- */}
      {form && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const json = await call(
              { action: 'save_plan', plan: form, acceptTerms },
              'save',
              form.id ? 'Farm share updated.' : 'Farm share created. It now shows on your farm page.'
            );
            if (json) setForm(null);
          }}
          className="border border-emerald-200 bg-emerald-50/40 rounded-2xl p-5 space-y-4"
        >
          <h3 className="font-bold text-gray-900">{form.id ? 'Edit farm share' : 'New farm share'}</h3>
          {!hasPickupAddress && (
            <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-3">
              Boxes are picked up at your farm's pickup address.{' '}
              <button type="button" onClick={onGoToProfile} className="font-semibold underline">
                Add it in Farm Profile
              </button>{' '}
              first.
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label htmlFor="csa-name" className="block text-xs font-semibold text-gray-700 mb-1">Name *</label>
              <input id="csa-name" required maxLength={80} placeholder='e.g., "Weekly Veggie Box"' {...field('name')} className="w-full px-3 py-2 border rounded-lg text-sm bg-white" />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="csa-description" className="block text-xs font-semibold text-gray-700 mb-1">
                What's in a typical box? *
              </label>
              <textarea
                id="csa-description"
                required
                rows={4}
                maxLength={1500}
                placeholder="e.g., 6–8 items of whatever is best that week: greens, roots, squash, herbs. Feeds two for a week."
                {...field('description')}
                className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
              />
            </div>
            <div>
              <label htmlFor="csa-price" className="block text-xs font-semibold text-gray-700 mb-1">Price per box ($) *</label>
              <input id="csa-price" required type="number" min="5" max="500" step="0.01" inputMode="decimal" {...field('priceDollars')} className="w-full px-3 py-2 border rounded-lg text-sm bg-white" />
              {cost && (
                <p className="text-xs text-gray-600 mt-1">
                  Members pay ${(cost.totalCents / 100).toFixed(2)} with the service fee. You keep $
                  {(farmKeepsCents / 100).toFixed(2)} a box.
                  {editingJoined && ' A new price applies to new members only.'}
                </p>
              )}
            </div>
            <div>
              <label htmlFor="csa-max" className="block text-xs font-semibold text-gray-700 mb-1">Member limit</label>
              <input id="csa-max" type="number" min="1" max="1000" step="1" placeholder="No limit" {...field('maxMembers')} className="w-full px-3 py-2 border rounded-lg text-sm bg-white" />
            </div>
            <div>
              <label htmlFor="csa-day" className="block text-xs font-semibold text-gray-700 mb-1">Pickup day *</label>
              <select id="csa-day" disabled={editingJoined} {...field('pickupWeekday')} className="w-full px-3 py-2 border rounded-lg text-sm bg-white disabled:bg-gray-100">
                {WEEKDAYS.map((day, i) => (
                  <option key={day} value={i}>{day}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="csa-frequency" className="block text-xs font-semibold text-gray-700 mb-1">How often *</label>
              <select id="csa-frequency" disabled={editingJoined} {...field('frequency')} className="w-full px-3 py-2 border rounded-lg text-sm bg-white disabled:bg-gray-100">
                <option value="weekly">Every week</option>
                <option value="biweekly">Every other week</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="csa-window" className="block text-xs font-semibold text-gray-700 mb-1">Pickup time</label>
              <input id="csa-window" maxLength={80} placeholder="e.g., 4–7 pm" {...field('pickupWindow')} className="w-full px-3 py-2 border rounded-lg text-sm bg-white" />
            </div>
            <div>
              <label htmlFor="csa-start" className="block text-xs font-semibold text-gray-700 mb-1">Season starts *</label>
              <input id="csa-start" type="date" required disabled={editingJoined} {...field('seasonStart')} className="w-full px-3 py-2 border rounded-lg text-sm bg-white disabled:bg-gray-100" />
            </div>
            <div>
              <label htmlFor="csa-end" className="block text-xs font-semibold text-gray-700 mb-1">Season ends *</label>
              <input id="csa-end" type="date" required {...field('seasonEnd')} className="w-full px-3 py-2 border rounded-lg text-sm bg-white" />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="csa-status" className="block text-xs font-semibold text-gray-700 mb-1">New members</label>
              <select id="csa-status" {...field('status')} className="w-full px-3 py-2 border rounded-lg text-sm bg-white">
                <option value="open">Taking new members</option>
                <option value="closed">Not taking new members (boxes carry on for current members)</option>
              </select>
            </div>
          </div>
          {editingJoined && (
            <p className="text-xs text-gray-600">
              The pickup day, how often and the start date are locked because members have signed up for them. To change
              those, end this share and start a new one.
            </p>
          )}

          {!sellerTermsAccepted && (
            <label className="flex items-start gap-2 text-sm text-gray-700">
              <input type="checkbox" required checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)} className="mt-0.5 w-4 h-4" />
              <span>
                I agree to the{' '}
                <Link href="/seller-terms" target="_blank" className="font-semibold text-emerald-800 underline">
                  Seller Terms
                </Link>
                , including the farm share commitments.
              </span>
            </label>
          )}

          <div className="flex gap-2">
            <button type="submit" disabled={busy !== null} className="px-4 py-2.5 bg-emerald-600 text-white font-bold rounded-xl text-sm disabled:opacity-50">
              {busy === 'save' ? 'Saving…' : form.id ? 'Save changes' : 'Create farm share'}
            </button>
            <button type="button" onClick={() => setForm(null)} className="px-4 py-2.5 text-sm font-semibold text-gray-700">
              Cancel
            </button>
          </div>
        </form>
      )}

      {plans === null && <p className="text-sm text-gray-500">Loading…</p>}
      {plans && plans.length === 0 && !form && (
        <div className="border border-dashed rounded-2xl p-6 text-center text-sm text-gray-600">
          You don't run a farm share yet. A farm share gives you regular customers and steady weekly sales you can plan
          your harvest around.
        </div>
      )}

      {/* ---------- each running share ---------- */}
      {running.map((plan) => (
        <section key={plan.id} className="border rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-lg font-bold text-gray-900">{plan.name}</h3>
              <p className="text-sm text-gray-600">
                ${plan.priceDollars} a box ·{' '}
                {describeFrequency({ pickup_weekday: plan.pickupWeekday, frequency: plan.frequency })}
                {plan.pickupWindow ? `, ${plan.pickupWindow}` : ''} · {formatBoxDate(plan.seasonStart)} –{' '}
                {formatBoxDate(plan.seasonEnd)}
              </p>
              <p className="text-sm text-gray-700 mt-1">
                <strong>{plan.counts.active}</strong> active member{plan.counts.active === 1 ? '' : 's'}
                {plan.counts.paused > 0 && `, ${plan.counts.paused} paused`}
                {plan.maxMembers != null && ` · limit ${plan.maxMembers}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-[11px] font-bold rounded-full px-2.5 py-1 ${STATUS_PILL[plan.status]}`}>{STATUS_TEXT[plan.status]}</span>
              <button
                onClick={() =>
                  setForm({
                    id: plan.id,
                    name: plan.name,
                    description: plan.description,
                    priceDollars: plan.priceDollars,
                    frequency: plan.frequency,
                    pickupWeekday: String(plan.pickupWeekday),
                    pickupWindow: plan.pickupWindow,
                    seasonStart: plan.seasonStart,
                    seasonEnd: plan.seasonEnd,
                    maxMembers: plan.maxMembers == null ? '' : String(plan.maxMembers),
                    status: plan.status,
                  })
                }
                className="text-xs font-semibold border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50"
              >
                Edit
              </button>
            </div>
          </div>

          <div>
            <h4 className="text-sm font-bold text-gray-900 mb-2">Coming up</h4>
            <ul className="divide-y border rounded-xl">
              {plan.weeks.length === 0 && <li className="p-3 text-sm text-gray-500">No more pickups this season.</li>}
              {plan.weeks.map((week) => {
                const key = noteKey(plan.id, week.date);
                const draft = notes[key] ?? week.note;
                return (
                  <li key={week.date} className="p-3 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-gray-900">{week.label}</span>
                      {week.skipped ? (
                        <span className="text-xs font-bold text-amber-900 bg-amber-100 rounded-full px-2 py-0.5">Called off</span>
                      ) : (
                        <span className="text-xs text-gray-700">
                          <strong>{week.boxes}</strong> box{week.boxes === 1 ? '' : 'es'}
                          {week.paid > 0 && ` · ${week.paid} paid`}
                          {week.failed > 0 && <span className="text-red-700"> · {week.failed} card declined</span>}
                          {week.memberSkips > 0 && ` · ${week.memberSkips} skipping`}
                        </span>
                      )}
                    </div>
                    {week.skipped ? (
                      <p className="text-xs text-amber-900">
                        {week.skipReason}{' '}
                        {week.canChange && (
                          <button
                            disabled={busy !== null}
                            onClick={() => call({ action: 'skip_week', planId: plan.id, boxDate: week.date, skipped: false }, key, 'That week is back on. Members have been told.')}
                            className="font-semibold underline"
                          >
                            Put it back on
                          </button>
                        )}
                      </p>
                    ) : (
                      <>
                        <p className="text-xs text-gray-500">
                          {week.canChange
                            ? `Members are charged on ${week.chargeLabel}; the reminder email the day before includes your note.`
                            : 'Charged. Paid boxes are in your Orders and Pick List.'}
                        </p>
                        <div className="flex flex-col sm:flex-row gap-2">
                          <input
                            aria-label={`Box note for ${week.label}`}
                            value={draft}
                            maxLength={500}
                            placeholder="What's in the box this week? (members see this)"
                            onChange={(e) => setNotes((current) => ({ ...current, [key]: e.target.value }))}
                            className="flex-1 px-3 py-2 border rounded-lg text-sm"
                          />
                          <button
                            disabled={busy !== null || draft === week.note}
                            onClick={() => call({ action: 'save_week', planId: plan.id, boxDate: week.date, note: draft }, key, 'Box note saved.')}
                            className="px-3 py-2 text-xs font-semibold border border-gray-300 rounded-lg disabled:opacity-50"
                          >
                            Save note
                          </button>
                        </div>
                        {week.canChange &&
                          (reasonFor === key ? (
                            <div className="flex flex-col sm:flex-row gap-2">
                              <input
                                aria-label="Why there's no box that week"
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                maxLength={300}
                                placeholder="Why? e.g., hail damage, farm closed for the holiday"
                                className="flex-1 px-3 py-2 border border-amber-300 rounded-lg text-sm"
                              />
                              <button
                                disabled={busy !== null || !reason.trim()}
                                onClick={async () => {
                                  const json = await call(
                                    { action: 'skip_week', planId: plan.id, boxDate: week.date, skipped: true, reason },
                                    key,
                                    "That week is called off. Members have been told and won't be charged."
                                  );
                                  if (json) setReasonFor(null);
                                }}
                                className="px-3 py-2 text-xs font-bold bg-amber-600 text-white rounded-lg disabled:opacity-50"
                              >
                                Call off this week
                              </button>
                              <button onClick={() => setReasonFor(null)} className="text-xs font-semibold text-gray-600">
                                Never mind
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                setReasonFor(key);
                                setReason('');
                              }}
                              className="text-xs font-semibold text-amber-800 underline"
                            >
                              No box this week?
                            </button>
                          ))}
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>

          <div>
            <button
              onClick={() => setOpenMembers((current) => (current === plan.id ? null : plan.id))}
              aria-expanded={openMembers === plan.id}
              className="flex items-center gap-1.5 text-sm font-bold text-gray-900"
            >
              <Users className="w-4 h-4" /> Members ({plan.members.filter((m) => m.status !== 'cancelled').length})
              <ChevronDown className={`w-4 h-4 transition-transform ${openMembers === plan.id ? 'rotate-180' : ''}`} />
            </button>
            {openMembers === plan.id && (
              <ul className="mt-2 divide-y border rounded-xl text-sm">
                {plan.members.length === 0 && <li className="p-3 text-gray-500">No members yet.</li>}
                {plan.members.map((m) => {
                  const key = `member|${m.id}`;
                  return (
                    <li key={m.id} className="p-3 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className={m.status === 'cancelled' ? 'text-gray-400' : 'text-gray-900'}>
                          {m.who}{' '}
                          <span className="text-xs text-gray-500">
                            · joined {new Date(m.joined).toLocaleDateString()} · ${m.priceDollars}/box
                          </span>
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-gray-600 capitalize">{m.status}</span>
                          {m.status !== 'cancelled' && reasonFor !== key && (
                            <button
                              onClick={() => {
                                setReasonFor(key);
                                setReason('');
                              }}
                              className="text-xs font-semibold text-red-700 underline"
                            >
                              Remove
                            </button>
                          )}
                        </span>
                      </div>
                      {reasonFor === key && (
                        <div className="flex flex-col sm:flex-row gap-2">
                          <input
                            aria-label="Reason for removing this member"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            maxLength={300}
                            placeholder="Reason (the member sees this)"
                            className="flex-1 px-3 py-2 border border-red-200 rounded-lg text-sm"
                          />
                          <button
                            disabled={busy !== null || !reason.trim()}
                            onClick={async () => {
                              const json = await call(
                                { action: 'remove_member', planId: plan.id, memberId: m.id, reason },
                                key,
                                'Member removed. They have been told and won’t be charged again.'
                              );
                              if (json) setReasonFor(null);
                            }}
                            className="px-3 py-2 text-xs font-bold bg-red-600 text-white rounded-lg disabled:opacity-50"
                          >
                            Remove member
                          </button>
                          <button onClick={() => setReasonFor(null)} className="text-xs font-semibold text-gray-600">
                            Never mind
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="border-t pt-3">
            {reasonFor === `end|${plan.id}` ? (
              <div className="space-y-2">
                <p className="text-sm text-red-900">
                  Ending the share cancels every membership. Nobody is charged again; boxes already paid for stay in your
                  Orders.
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    aria-label="Why the share is ending"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    maxLength={300}
                    placeholder="Message to members, e.g., end of the season, thank you!"
                    className="flex-1 px-3 py-2 border border-red-200 rounded-lg text-sm"
                  />
                  <button
                    disabled={busy !== null || !reason.trim()}
                    onClick={async () => {
                      const json = await call({ action: 'end_plan', planId: plan.id, reason }, `end${plan.id}`, 'Farm share ended. Members have been told.');
                      if (json) setReasonFor(null);
                    }}
                    className="px-3 py-2 text-xs font-bold bg-red-600 text-white rounded-lg disabled:opacity-50"
                  >
                    End farm share
                  </button>
                  <button onClick={() => setReasonFor(null)} className="text-xs font-semibold text-gray-600">
                    Never mind
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => {
                  setReasonFor(`end|${plan.id}`);
                  setReason('');
                }}
                className="text-xs font-semibold text-red-700 underline"
              >
                End this farm share
              </button>
            )}
          </div>
        </section>
      ))}

      {ended.length > 0 && (
        <div className="space-y-1">
          <h3 className="text-sm font-bold text-gray-700">Ended</h3>
          {ended.map((plan) => (
            <p key={plan.id} className="text-sm text-gray-500">
              {plan.name} · {formatBoxDate(plan.seasonStart)} – {formatBoxDate(plan.seasonEnd)} ·{' '}
              {plan.counts.active + plan.counts.paused + plan.counts.cancelled} members in all
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
