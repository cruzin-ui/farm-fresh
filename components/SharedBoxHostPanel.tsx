'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Handshake, Search, MapPin, Egg } from 'lucide-react';
import { postWithAuth } from '@/lib/authedFetch';
import { SHARED_BOX_MAX_PARTNERS, SHARED_BOX_MILES } from '@/lib/sharedBoxTerms';

export type HostFarm = {
  farmerId: string;
  role: 'host' | 'partner';
  name: string;
  slug: string | null;
  status: 'invited' | 'accepted' | 'declined' | 'left' | 'removed';
  contribution: string;
  priceDollars: string;
  includesEggs: boolean;
  leftReason: string;
};

type Suggestion = {
  farmerId: string;
  farmName: string;
  slug: string | null;
  location: string;
  miles: number;
  categories: string[];
  adds: string[];
};

const STATUS_TEXT: Record<HostFarm['status'], string> = {
  invited: 'Invited, waiting for an answer',
  accepted: 'In the box',
  declined: 'Declined',
  left: 'Left the box',
  removed: 'Taken out',
};

// The farms in a shared box the farm hosts: who's in, inviting nearby farms
// while the box is forming, and opening it to buyers.
export default function SharedBoxHostPanel({
  planId,
  planStatus,
  dropoffNote,
  farms,
  busy,
  call,
}: {
  planId: string;
  planStatus: string;
  dropoffNote: string;
  farms: HostFarm[];
  busy: string | null;
  call: (body: Record<string, unknown>, key: string, successText?: string) => Promise<any>;
}) {
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [finding, setFinding] = useState(false);
  const [findError, setFindError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [reasonFor, setReasonFor] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const forming = planStatus === 'forming';
  const partners = farms.filter((f) => f.role === 'partner');
  const inBox = farms.filter((f) => f.status === 'accepted');
  const waiting = partners.filter((f) => f.status === 'invited');
  const taken = partners.filter((f) => f.status === 'invited' || f.status === 'accepted').length;
  const boxCents = inBox.reduce((sum, f) => sum + Math.round(Number(f.priceDollars) * 100), 0);
  const acceptedPartners = partners.filter((f) => f.status === 'accepted').length;

  const findPartners = async () => {
    setFinding(true);
    setFindError(null);
    try {
      const res = await postWithAuth('/api/csa/farm', { action: 'suggest', planId });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not look for farms.');
      setSuggestions(json.suggestions || []);
    } catch (err: any) {
      setFindError(err.message);
    } finally {
      setFinding(false);
    }
  };

  return (
    <div className="border border-emerald-200 rounded-xl p-4 space-y-3 bg-emerald-50/40">
      <h4 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
        <Handshake className="w-4 h-4 text-emerald-600" /> Farms in this box
      </h4>

      <ul className="divide-y border rounded-xl bg-white">
        {farms
          .filter((f) => f.role === 'host' || f.status !== 'declined' || forming)
          .map((farm) => {
            const key = `partner|${farm.farmerId}`;
            const canRemove = farm.role === 'partner' && (farm.status === 'invited' || farm.status === 'accepted');
            return (
              <li key={farm.farmerId} className="p-3 space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm">
                    <strong className={farm.status === 'accepted' || farm.role === 'host' ? 'text-gray-900' : 'text-gray-500'}>{farm.name}</strong>
                    {farm.role === 'host' && <span className="text-xs text-gray-500"> (you, the host)</span>}
                    {farm.contribution && (
                      <span className="text-xs text-gray-600">
                        {' '}
                        · {farm.contribution} · ${farm.priceDollars}/box
                      </span>
                    )}
                    {farm.includesEggs && (
                      <span className="ml-1 inline-flex items-center gap-0.5 text-[11px] font-semibold text-amber-900">
                        <Egg className="w-3 h-3" aria-hidden="true" /> eggs
                      </span>
                    )}
                  </span>
                  {farm.role === 'partner' && (
                    <span className="flex items-center gap-2">
                      <span className={`text-xs font-semibold ${farm.status === 'accepted' ? 'text-emerald-800' : 'text-gray-500'}`}>
                        {STATUS_TEXT[farm.status]}
                      </span>
                      {canRemove && reasonFor !== key && (
                        <button
                          onClick={() => {
                            setReasonFor(key);
                            setReason('');
                          }}
                          className="text-xs font-semibold text-red-700 underline"
                        >
                          {farm.status === 'invited' ? 'Withdraw' : 'Take out'}
                        </button>
                      )}
                    </span>
                  )}
                </div>
                {farm.leftReason && (farm.status === 'left' || farm.status === 'removed' || farm.status === 'declined') && (
                  <p className="text-xs text-gray-500">“{farm.leftReason}”</p>
                )}
                {reasonFor === key && (
                  <div className="flex flex-col sm:flex-row gap-2">
                    {farm.status === 'accepted' && !forming && (
                      <input
                        aria-label="Why the farm is being taken out"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        maxLength={300}
                        placeholder="Why? (the farm and your members see this)"
                        className="flex-1 px-3 py-2 border border-red-200 rounded-lg text-sm"
                      />
                    )}
                    <button
                      disabled={busy !== null || (farm.status === 'accepted' && !forming && !reason.trim())}
                      onClick={async () => {
                        const json = await call(
                          { action: 'remove_partner', planId, farmerId: farm.farmerId, reason },
                          key,
                          farm.status === 'invited'
                            ? 'Invitation withdrawn.'
                            : forming
                              ? `${farm.name} is out of the box.`
                              : `${farm.name} is out of the box. Members have been told, and their price comes down by that farm's part.`
                        );
                        if (json) setReasonFor(null);
                      }}
                      className="px-3 py-2 text-xs font-bold bg-red-600 text-white rounded-lg disabled:opacity-50"
                    >
                      {farm.status === 'invited' ? 'Withdraw invitation' : 'Take out of the box'}
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

      <p className="text-sm text-gray-700">
        Box price: <strong>${(boxCents / 100).toFixed(2)}</strong>, each farm's part added together.
      </p>
      <p className="text-xs text-gray-600">
        <MapPin className="w-3.5 h-3.5 inline -mt-0.5" aria-hidden="true" /> Partners bring their part to your pickup address:{' '}
        {dropoffNote || 'by the day before pickup'}. They see your address once they've joined.
      </p>

      {forming && (
        <div className="space-y-3 border-t pt-3">
          <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-3">
            <strong>Not shown to buyers yet.</strong> Invite up to {SHARED_BOX_MAX_PARTNERS} farms within {SHARED_BOX_MILES} miles.
            Once every invited farm has answered and at least one has joined, open the box to buyers. After that, its farms and
            prices are fixed.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              disabled={busy !== null || waiting.length > 0 || acceptedPartners === 0}
              onClick={() => call({ action: 'open_shared', planId }, `open${planId}`, 'Your shared box is open to buyers. Partners have been told.')}
              className="px-4 py-2 bg-emerald-600 text-white font-bold rounded-xl text-sm disabled:opacity-50"
            >
              {busy === `open${planId}` ? 'Opening…' : 'Open to buyers'}
            </button>
            {taken < SHARED_BOX_MAX_PARTNERS && (
              <button
                disabled={finding}
                onClick={findPartners}
                className="inline-flex items-center gap-1.5 px-4 py-2 border border-emerald-300 bg-white text-emerald-900 font-semibold rounded-xl text-sm disabled:opacity-50"
              >
                <Search className="w-4 h-4" /> {finding ? 'Looking…' : 'Find nearby farms'}
              </button>
            )}
          </div>
          {(waiting.length > 0 || acceptedPartners === 0) && (
            <p className="text-xs text-gray-600">
              {waiting.length > 0
                ? `Waiting for ${waiting.map((f) => f.name).join(' and ')} to answer.`
                : 'Invite at least one farm to open the box.'}
            </p>
          )}
          {findError && <p className="text-sm text-red-700">{findError}</p>}
          {suggestions && (
            <div className="space-y-2">
              {suggestions.length === 0 ? (
                <p className="text-sm text-gray-600">
                  No farms that could join are within {SHARED_BOX_MILES} miles yet. As more growers join Farm Fresh Direct nearby,
                  they'll show up here.
                </p>
              ) : (
                <>
                  <p className="text-xs text-gray-600">
                    Farms that grow what you don't come first. Only farms in good standing are shown.
                  </p>
                  <label htmlFor={`invite-msg-${planId}`} className="block text-xs font-semibold text-gray-700">
                    A note with your invitation (optional)
                  </label>
                  <textarea
                    id={`invite-msg-${planId}`}
                    rows={2}
                    maxLength={500}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="e.g., Hi! We'd love your eggs in our weekly box. Pickup is Thursdays at our farm."
                    className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
                  />
                  <ul className="space-y-2">
                    {suggestions.map((s) => (
                      <li key={s.farmerId} className="bg-white border rounded-xl p-3 flex flex-wrap items-center justify-between gap-3">
                        <div className="text-sm">
                          <p className="font-bold text-gray-900">
                            {s.slug ? (
                              <Link href={`/${s.slug}`} target="_blank" className="hover:underline">
                                {s.farmName}
                              </Link>
                            ) : (
                              s.farmName
                            )}
                          </p>
                          <p className="text-xs text-gray-600">
                            {s.location ? `${s.location} · ` : ''}about {s.miles} mile{s.miles === 1 ? '' : 's'} away · grows{' '}
                            {s.categories.join(', ')}
                          </p>
                          {s.adds.length > 0 && (
                            <p className="text-xs font-semibold text-emerald-800">Adds what you don't grow: {s.adds.join(', ')}</p>
                          )}
                        </div>
                        <button
                          disabled={busy !== null || taken >= SHARED_BOX_MAX_PARTNERS}
                          onClick={async () => {
                            const json = await call(
                              { action: 'invite', planId, farmerId: s.farmerId, message },
                              `invite${s.farmerId}`,
                              `${s.farmName} has been invited. We've emailed them.`
                            );
                            if (json) setSuggestions((current) => (current || []).filter((x) => x.farmerId !== s.farmerId));
                          }}
                          className="px-3 py-2 text-xs font-bold bg-emerald-600 text-white rounded-lg disabled:opacity-50"
                        >
                          {busy === `invite${s.farmerId}` ? 'Inviting…' : 'Invite'}
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
