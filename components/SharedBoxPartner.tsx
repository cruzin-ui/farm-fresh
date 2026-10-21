'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Handshake, AlertCircle, CheckCircle2, MapPin, Egg } from 'lucide-react';
import { postWithAuth } from '@/lib/authedFetch';
import { boxKindName, CHARGE_DAYS_BEFORE } from '@/lib/csaSchedule';
import {
  EGG_NOTICE_SELLER,
  HOST_PACKING_LABEL,
  MIN_SHARE_CENTS,
  SHARED_BOX_STEPS,
  farmKeepsCents,
  sharedBoxAgreementText,
} from '@/lib/sharedBoxTerms';

type PartnerBox = {
  planId: string;
  name: string;
  description: string;
  boxType: string;
  planStatus: 'forming' | 'open' | 'closed' | 'ended';
  myStatus: 'invited' | 'accepted';
  inviteMessage: string;
  host: { name: string; slug: string | null };
  schedule: string;
  season: string;
  dropoffNote: string;
  hostSubstitutes: boolean;
  hostAddress: string | null;
  myPart: { contribution: string; priceDollars: string; includesEggs: boolean; keepsDollars: string | null };
  otherFarms: { name: string; role: string; status: string; contribution: string; priceDollars: string }[];
  earnedDollars: string;
  weeks: {
    date: string;
    label: string;
    confirmByLabel: string;
    canAnswer: boolean;
    answer: string | null;
    calledOff: string | null;
    boxes: number;
  }[];
};

const ANSWER_TEXT: Record<string, string> = {
  confirmed: 'Confirmed',
  cant: "You said you can't",
  no_reply: 'Left out: not confirmed in time',
  missing: 'Reported missing by the host',
  asked: 'Waiting for your answer',
};

// The partner side of shared Farm Boxes in the Seller Dashboard: invitations
// from nearby farms, and for each box this farm is part of, what to bring and
// when, with a confirm button for each week.
export default function SharedBoxPartner({ sellerTermsAccepted }: { sellerTermsAccepted: boolean }) {
  const [boxes, setBoxes] = useState<PartnerBox[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // The join form for each invitation.
  const [forms, setForms] = useState<Record<string, { contribution: string; price: string; eggs: boolean; agreed: boolean; terms: boolean }>>({});
  const [reasonFor, setReasonFor] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [editing, setEditing] = useState<string | null>(null);

  const call = async (body: Record<string, unknown>, key: string, successText?: string) => {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      const res = await postWithAuth('/api/csa/partner', body);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Something went wrong.');
      setBoxes(json.boxes);
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

  if (!boxes || boxes.length === 0) return null;

  const formFor = (box: PartnerBox) =>
    forms[box.planId] || {
      contribution: box.myPart.contribution,
      price: box.myPart.priceDollars,
      eggs: box.myPart.includesEggs,
      agreed: false,
      terms: false,
    };
  const setForm = (planId: string, patch: Partial<ReturnType<typeof formFor>>, box: PartnerBox) =>
    setForms((current) => ({ ...current, [planId]: { ...formFor(box), ...current[planId], ...patch } }));

  const partForm = (box: PartnerBox, mode: 'accept' | 'update_part') => {
    const form = formFor(box);
    const shareCents = Math.round(Number(form.price || 0) * 100);
    const kind = boxKindName(box.boxType);
    const agreement = sharedBoxAgreementText({
      role: 'partner',
      planName: box.name,
      hostFarmName: box.host.name,
      contribution: form.contribution,
      shareCents: shareCents || 0,
      boxType: box.boxType,
      includesEggs: form.eggs,
      hostSubstitutes: box.hostSubstitutes,
    });
    return (
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const json = await call(
            {
              action: mode,
              planId: box.planId,
              contribution: form.contribution,
              shareDollars: form.price,
              includesEggs: form.eggs,
              agreed: form.agreed,
              acceptTerms: form.terms,
            },
            `${mode}${box.planId}`,
            mode === 'accept'
              ? `You've joined ${box.name}. ${box.host.name} will open it to buyers once every farm has answered.`
              : 'Your part has been updated.'
          );
          if (json) setEditing(null);
        }}
        className="space-y-3 border-t pt-3"
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <label htmlFor={`part-${box.planId}`} className="block text-xs font-semibold text-gray-700 mb-1">
              What you put in each box *
            </label>
            <input
              id={`part-${box.planId}`}
              required
              maxLength={200}
              value={form.contribution}
              onChange={(e) => setForm(box.planId, { contribution: e.target.value }, box)}
              placeholder={box.boxType === 'flowers' ? 'e.g., a bunch of 10 sunflowers' : 'e.g., a dozen eggs, or 2 lbs of citrus'}
              className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
            />
          </div>
          <div>
            <label htmlFor={`price-${box.planId}`} className="block text-xs font-semibold text-gray-700 mb-1">
              Your price per box ($) *
            </label>
            <input
              id={`price-${box.planId}`}
              required
              type="number"
              min={MIN_SHARE_CENTS / 100}
              max="500"
              step="0.01"
              inputMode="decimal"
              value={form.price}
              onChange={(e) => setForm(box.planId, { price: e.target.value }, box)}
              className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
            />
          </div>
        </div>
        {shareCents > 0 && (
          <p className="text-xs text-gray-600">
            You keep ${(farmKeepsCents(shareCents, 'partner') / 100).toFixed(2)} a box, after the seller fee and the{' '}
            {HOST_PACKING_LABEL} packing fee to {box.host.name}.
          </p>
        )}
        {box.boxType !== 'flowers' && (
          <div className="space-y-2">
            <label className="flex items-start gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.eggs}
                onChange={(e) => setForm(box.planId, { eggs: e.target.checked }, box)}
                className="mt-0.5 w-4 h-4"
              />
              <span>My part includes eggs</span>
            </label>
            {form.eggs && (
              <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-2">
                <Egg className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" /> {EGG_NOTICE_SELLER}
              </p>
            )}
          </div>
        )}
        <label className="flex items-start gap-2 text-sm text-gray-700 bg-gray-50 border rounded-lg p-3">
          <input
            type="checkbox"
            required
            checked={form.agreed}
            onChange={(e) => setForm(box.planId, { agreed: e.target.checked }, box)}
            className="mt-0.5 w-4 h-4 shrink-0"
          />
          <span>
            <strong className="text-gray-900">I agree to the shared {kind} terms.</strong> {agreement}{' '}
            <Link href="/seller-terms#shared" target="_blank" className="font-semibold text-emerald-800 underline">
              Read section 7
            </Link>
          </span>
        </label>
        {mode === 'accept' && !sellerTermsAccepted && (
          <label className="flex items-start gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              required
              checked={form.terms}
              onChange={(e) => setForm(box.planId, { terms: e.target.checked }, box)}
              className="mt-0.5 w-4 h-4"
            />
            <span>
              I agree to the{' '}
              <Link href="/seller-terms" target="_blank" className="font-semibold text-emerald-800 underline">
                Seller Terms
              </Link>
              .
            </span>
          </label>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={busy !== null} className="px-4 py-2.5 bg-emerald-600 text-white font-bold rounded-xl text-sm disabled:opacity-50">
            {busy === `${mode}${box.planId}` ? 'Saving…' : mode === 'accept' ? `Join ${box.name}` : 'Save my part'}
          </button>
          {mode === 'update_part' && (
            <button type="button" onClick={() => setEditing(null)} className="px-3 py-2 text-sm font-semibold text-gray-700">
              Cancel
            </button>
          )}
        </div>
      </form>
    );
  };

  return (
    <section className="border-2 border-emerald-200 rounded-2xl p-5 space-y-4 bg-emerald-50/30">
      <div>
        <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <Handshake className="w-5 h-5 text-emerald-600" /> Shared boxes with other farms
        </h3>
        <p className="text-sm text-gray-600">Boxes you've been invited to, or that you help fill as a partner farm.</p>
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

      {boxes.map((box) => {
        const kind = boxKindName(box.boxType);
        const invited = box.myStatus === 'invited';
        const live = box.myStatus === 'accepted' && (box.planStatus === 'open' || box.planStatus === 'closed');
        return (
          <article key={box.planId} className="bg-white border rounded-2xl p-4 space-y-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">
                {invited ? 'Invitation' : live ? `Shared ${kind}` : `Shared ${kind} · not open to buyers yet`}
              </p>
              <h4 className="text-base font-bold text-gray-900">{box.name}</h4>
              <p className="text-sm text-gray-600">
                Hosted by{' '}
                {box.host.slug ? (
                  <Link href={`/${box.host.slug}`} target="_blank" className="font-semibold text-emerald-800 underline">
                    {box.host.name}
                  </Link>
                ) : (
                  <strong>{box.host.name}</strong>
                )}{' '}
                · {box.schedule} · {box.season}
              </p>
            </div>

            {invited && (
              <>
                {box.inviteMessage && (
                  <p className="text-sm text-gray-800 bg-emerald-50 border border-emerald-100 rounded-lg p-3 whitespace-pre-line">
                    {box.inviteMessage}
                  </p>
                )}
                <p className="text-sm text-gray-700">{box.description}</p>
                {box.otherFarms.length > 0 && (
                  <ul className="text-xs text-gray-600 space-y-0.5">
                    {box.otherFarms.map((f) => (
                      <li key={f.name}>
                        <strong className="text-gray-800">{f.name}</strong>
                        {f.role === 'host' ? ' (host)' : f.status === 'invited' ? ' (invited)' : ''}
                        {f.contribution ? `: ${f.contribution}, $${f.priceDollars}/box` : ''}
                      </li>
                    ))}
                  </ul>
                )}
                <details className="text-sm text-gray-700 bg-gray-50 border rounded-lg p-3">
                  <summary className="font-semibold text-gray-900 cursor-pointer">How a shared box works</summary>
                  <ol className="list-decimal pl-5 mt-2 space-y-1">
                    {SHARED_BOX_STEPS.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                </details>
                {partForm(box, 'accept')}
                {reasonFor === `decline${box.planId}` ? (
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      aria-label="Why you're declining (optional)"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      maxLength={300}
                      placeholder="Optional note to the host"
                      className="flex-1 px-3 py-2 border rounded-lg text-sm"
                    />
                    <button
                      disabled={busy !== null}
                      onClick={async () => {
                        const json = await call({ action: 'decline', planId: box.planId, reason }, `decline${box.planId}`, 'Invitation declined. The host has been told.');
                        if (json) setReasonFor(null);
                      }}
                      className="px-3 py-2 text-xs font-bold bg-gray-700 text-white rounded-lg disabled:opacity-50"
                    >
                      Decline invitation
                    </button>
                    <button onClick={() => setReasonFor(null)} className="text-xs font-semibold text-gray-600">
                      Never mind
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setReasonFor(`decline${box.planId}`);
                      setReason('');
                    }}
                    className="text-xs font-semibold text-gray-600 underline"
                  >
                    No thanks, decline
                  </button>
                )}
              </>
            )}

            {!invited && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div className="border rounded-lg p-3">
                    <p className="text-xs font-semibold text-gray-500">Your part of each box</p>
                    <p className="font-semibold text-gray-900">
                      {box.myPart.contribution} · ${box.myPart.priceDollars}
                    </p>
                    {box.myPart.keepsDollars && <p className="text-xs text-gray-600">You keep ${box.myPart.keepsDollars} a box.</p>}
                    {box.myPart.includesEggs && <p className="text-xs text-amber-900 mt-1">Includes eggs: keep them at 45°F or below.</p>}
                    {box.planStatus === 'forming' && editing !== box.planId && (
                      <button onClick={() => setEditing(box.planId)} className="mt-1 text-xs font-semibold text-emerald-800 underline">
                        Change my part
                      </button>
                    )}
                  </div>
                  <div className="border rounded-lg p-3">
                    <p className="text-xs font-semibold text-gray-500 flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5" /> Bring your part to {box.host.name}
                    </p>
                    {box.hostAddress && <p className="font-semibold text-gray-900">{box.hostAddress}</p>}
                    <p className="text-xs text-gray-600">{box.dropoffNote || 'By the day before pickup, unless the host says otherwise.'}</p>
                  </div>
                </div>
                {editing === box.planId && partForm(box, 'update_part')}

                {box.planStatus === 'forming' && (
                  <p className="text-sm text-gray-600">
                    {box.host.name} will open the box to buyers once every invited farm has answered. You'll get an email when
                    it opens.
                  </p>
                )}

                {live && (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h5 className="text-sm font-bold text-gray-900">Coming up</h5>
                      <span className="text-xs text-gray-600">Paid to you so far: ${box.earnedDollars}</span>
                    </div>
                    <ul className="divide-y border rounded-xl">
                      {box.weeks.length === 0 && <li className="p-3 text-sm text-gray-500">No more pickups this season.</li>}
                      {box.weeks.map((week) => {
                        const key = `${box.planId}|${week.date}`;
                        return (
                          <li key={week.date} className="p-3 space-y-1.5">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-sm font-semibold text-gray-900">{week.label}</span>
                              {week.calledOff ? (
                                <span className="text-xs font-bold text-amber-900 bg-amber-100 rounded-full px-2 py-0.5">Called off</span>
                              ) : (
                                <span className="text-xs text-gray-700">
                                  <strong>{week.boxes}</strong> box{week.boxes === 1 ? '' : 'es'} so far
                                </span>
                              )}
                            </div>
                            {week.calledOff ? (
                              <p className="text-xs text-amber-900">{week.calledOff} Nothing to bring.</p>
                            ) : (
                              <>
                                <p className={`text-xs ${week.answer === 'confirmed' ? 'text-emerald-800' : 'text-gray-600'}`}>
                                  {week.answer ? ANSWER_TEXT[week.answer] || week.answer : 'Not answered yet'}
                                  {week.canAnswer ? ` · answer by ${week.confirmByLabel}` : ''}
                                </p>
                                {week.canAnswer && (
                                  <div className="flex flex-wrap gap-2">
                                    <button
                                      disabled={busy !== null || week.answer === 'confirmed'}
                                      onClick={() => call({ action: 'answer', planId: box.planId, boxDate: week.date, answer: 'confirmed' }, key, `Confirmed for ${week.label}.`)}
                                      className={`px-3 py-1.5 text-xs font-bold rounded-lg ${
                                        week.answer === 'confirmed' ? 'bg-gray-100 text-gray-500' : 'bg-emerald-600 text-white'
                                      } disabled:opacity-60`}
                                    >
                                      {week.answer === 'confirmed' ? '✓ Confirmed' : 'Confirm'}
                                    </button>
                                    <button
                                      disabled={busy !== null || week.answer === 'cant'}
                                      onClick={() =>
                                        call(
                                          { action: 'answer', planId: box.planId, boxDate: week.date, answer: 'cant' },
                                          key,
                                          `Noted: you're out for ${week.label}. The host has been told and buyers will pay less.`
                                        )
                                      }
                                      className="px-3 py-1.5 text-xs font-semibold border border-amber-300 text-amber-900 rounded-lg disabled:opacity-60"
                                    >
                                      {week.answer === 'cant' ? "✓ Can't this week" : "Can't this week"}
                                    </button>
                                  </div>
                                )}
                              </>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                    {box.weeks.some((w) => w.canAnswer && !w.answer) && (
                      <button
                        disabled={busy !== null}
                        onClick={() => call({ action: 'confirm_upcoming', planId: box.planId }, `all${box.planId}`, 'Every open week is confirmed.')}
                        className="text-xs font-semibold text-emerald-800 underline"
                      >
                        Confirm every week shown
                      </button>
                    )}
                    <p className="text-xs text-gray-500">
                      The box count is final once buyers are charged, {CHARGE_DAYS_BEFORE} days before pickup. Bring your part for
                      that many boxes by the drop-off time. If it doesn't arrive, buyers are refunded your part and it counts as a
                      cancellation by your farm.
                    </p>
                  </div>
                )}

                <div className="border-t pt-3">
                  {reasonFor === `leave${box.planId}` ? (
                    <div className="space-y-2">
                      <p className="text-sm text-red-900">
                        Leaving takes your part out of every box not yet paid for, and lowers its price for members. Boxes already
                        paid for still include your part, so please still bring it.
                      </p>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          aria-label="Why you're leaving"
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          maxLength={300}
                          placeholder="Message to the host and members"
                          className="flex-1 px-3 py-2 border border-red-200 rounded-lg text-sm"
                        />
                        <button
                          disabled={busy !== null || (!reason.trim() && box.planStatus !== 'forming')}
                          onClick={async () => {
                            const json = await call({ action: 'leave', planId: box.planId, reason }, `leave${box.planId}`, `You've left ${box.name}.`);
                            if (json) setReasonFor(null);
                          }}
                          className="px-3 py-2 text-xs font-bold bg-red-600 text-white rounded-lg disabled:opacity-50"
                        >
                          Leave this box
                        </button>
                        <button onClick={() => setReasonFor(null)} className="text-xs font-semibold text-gray-600">
                          Never mind
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setReasonFor(`leave${box.planId}`);
                        setReason('');
                      }}
                      className="text-xs font-semibold text-red-700 underline"
                    >
                      Leave this box
                    </button>
                  )}
                </div>
              </>
            )}
          </article>
        );
      })}
    </section>
  );
}
