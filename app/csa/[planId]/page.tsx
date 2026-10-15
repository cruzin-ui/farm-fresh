'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, CalendarDays, CheckCircle2, Package, Repeat, Store } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { postWithAuth } from '@/lib/authedFetch';
import SaveCardForm from '@/components/SaveCardForm';
import SingleBoxForm from '@/components/SingleBoxForm';
import Photo from '@/components/Photo';
import { csaAgreementText } from '@/lib/csaTerms';
import {
  CHARGE_DAYS_BEFORE,
  chargeDateFor,
  describeFrequency,
  formatBoxDate,
} from '@/lib/csaSchedule';
import { BUYER_FEE_LABEL } from '@/lib/pricing';

type PublicPlan = {
  id: string;
  farmerId: string;
  farmName: string;
  farmSlug: string | null;
  farmLocation: string;
  name: string;
  description: string;
  imageUrl: string | null;
  priceCents: number;
  cost: { priceCents: number; feeCents: number; totalCents: number };
  frequency: string;
  pickupWeekday: number;
  pickupWindow: string;
  seasonStart: string;
  seasonEnd: string;
  firstBox: string | null;
  boxesLeft: number;
  spotsLeft: number | null;
  closedReason: string | null;
};

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export default function JoinCsaPage() {
  const params = useParams<{ planId: string }>();
  const router = useRouter();
  const planId = String(params.planId || '');

  const [plan, setPlan] = useState<PublicPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [joined, setJoined] = useState(false);
  // Signing up for every box, or buying just one. Links ending ?one=1 open
  // on the second.
  const [mode, setMode] = useState<'subscribe' | 'single'>('subscribe');

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('one') === '1') setMode('single');
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      setSignedIn(Boolean(data.session));
      try {
        const res = await fetch('/api/csa/plans', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ planId }),
        });
        const json = await res.json();
        setPlan(json.plans?.[0] || null);
      } finally {
        setLoading(false);
      }
    })();
  }, [planId]);

  if (loading) {
    return <div className="max-w-2xl mx-auto px-4 py-12 text-sm text-gray-500">Loading Farm Box…</div>;
  }

  if (!plan) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center space-y-3">
        <h1 className="text-xl font-bold text-gray-900">Farm Box not found</h1>
        <p className="text-sm text-gray-600">It may have ended for the season.</p>
        <Link href="/browse" className="text-sm font-semibold text-emerald-800 underline">
          Browse local produce
        </Link>
      </div>
    );
  }

  const farmPath = plan.farmSlug ? `/${plan.farmSlug}` : `/sellers/${plan.farmerId}`;
  const schedule = {
    pickup_weekday: plan.pickupWeekday,
    frequency: plan.frequency,
    season_start: plan.seasonStart,
    season_end: plan.seasonEnd,
  };
  const agreement = plan.firstBox
    ? csaAgreementText({
        farmName: plan.farmName,
        planName: plan.name,
        priceCents: plan.priceCents,
        plan: schedule,
        firstBoxDate: plan.firstBox,
      })
    : '';

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-5">
      <Link href={farmPath} className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-800">
        <ArrowLeft className="w-4 h-4" /> {plan.farmName}
      </Link>

      <header className="space-y-1">
        <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Farm Box</p>
        <h1 className="text-2xl font-extrabold text-gray-900">{plan.name}</h1>
        <p className="text-sm text-gray-600 flex items-center gap-1.5">
          <Store className="w-4 h-4" /> {plan.farmName}
          {plan.farmLocation ? ` · ${plan.farmLocation}` : ''}
        </p>
      </header>

      {plan.imageUrl && (
        <Photo
          src={plan.imageUrl}
          alt={plan.name}
          sizes="(max-width: 767px) 100vw, 672px"
          eager
          className="w-full h-56 sm:h-72 object-cover rounded-xl border"
        />
      )}

      <section className="bg-white border rounded-xl p-5 shadow-sm space-y-4">
        <p className="text-sm text-gray-800 whitespace-pre-line">{plan.description}</p>

        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div className="flex gap-2">
            <Repeat className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
            <div>
              <dt className="font-semibold text-gray-900">{describeFrequency(schedule)}</dt>
              <dd className="text-gray-600">{plan.pickupWindow || 'Pickup times are set by the farm'}</dd>
            </div>
          </div>
          <div className="flex gap-2">
            <CalendarDays className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
            <div>
              <dt className="font-semibold text-gray-900">
                Season ends {formatBoxDate(plan.seasonEnd)}
              </dt>
              <dd className="text-gray-600">
                {plan.firstBox
                  ? `Your first box: ${formatBoxDate(plan.firstBox)} · ${plan.boxesLeft} box${plan.boxesLeft === 1 ? '' : 'es'} left`
                  : 'No pickups left this season'}
              </dd>
            </div>
          </div>
        </dl>

        <div className="border-t pt-3 text-sm space-y-1">
          <div className="flex justify-between text-gray-700">
            <span>Box</span>
            <span>{dollars(plan.cost.priceCents)}</span>
          </div>
          <div className="flex justify-between text-gray-700">
            <span>Service fee ({BUYER_FEE_LABEL})</span>
            <span>{dollars(plan.cost.feeCents)}</span>
          </div>
          <div className="flex justify-between font-bold text-gray-900">
            <span>Each box</span>
            <span>{dollars(plan.cost.totalCents)}</span>
          </div>
          <p className="text-xs text-gray-500">Plus sales tax where it applies. You pay per box, only for the boxes you get.</p>
        </div>

        {plan.spotsLeft != null && plan.spotsLeft > 0 && plan.spotsLeft <= 10 && (
          <p className="text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Only {plan.spotsLeft} spot{plan.spotsLeft === 1 ? '' : 's'} left.
          </p>
        )}
      </section>

      <section className="bg-white border rounded-xl p-5 text-sm text-gray-700 space-y-2">
        <h2 className="font-bold text-gray-900">What is a Farm Box?</h2>
        <p>
          A box of whatever {plan.farmName} is harvesting that week, picked up on the same day each time through the
          season. It's the freshest way to eat with the seasons, and you only pay for the boxes you get.
        </p>
        <p>
          It also makes a real difference to a small grower. Knowing ahead of time how many boxes to fill lets them
          plan what to plant, pick only what's needed, and count on steady sales through the season, instead of
          guessing what will sell.
        </p>
      </section>

      <section className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 text-sm text-emerald-950 space-y-2">
        <h2 className="font-bold flex items-center gap-1.5">
          <Package className="w-4 h-4" /> How it works
        </h2>
        <ol className="list-decimal pl-5 space-y-1">
          <li>Save a card today. Nothing is charged until your first box.</li>
          <li>The day before each charge we email you what's coming, with a link to skip that week.</li>
          <li>
            Each box is charged {CHARGE_DAYS_BEFORE} days before pickup, and you get a pickup code just like any other
            order.
          </li>
          <li>Skip a week, pause or cancel online whenever you like, up to the charge. No phone calls, no fees.</li>
        </ol>
        <p>Not sure yet? Buy just one box first, with no sign-up.</p>
      </section>

      {!joined && (
        <div role="tablist" aria-label="How to buy" className="grid grid-cols-2 gap-2">
          {(
            [
              ['subscribe', 'Sign up', 'Every box, skip any time'],
              ['single', 'Just one box', 'Try it, no sign-up'],
            ] as const
          ).map(([value, label, detail]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mode === value}
              onClick={() => setMode(value)}
              className={`rounded-xl border-2 px-3 py-2.5 text-left transition-colors ${
                mode === value ? 'border-emerald-600 bg-emerald-50' : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <span className="block text-sm font-bold text-gray-900">{label}</span>
              <span className="block text-xs text-gray-600">{detail}</span>
            </button>
          ))}
        </div>
      )}

      {!joined && mode === 'single' ? (
        <section className="bg-white border rounded-xl p-5 shadow-sm space-y-3">
          <h2 className="font-bold text-gray-900">Buy just one box</h2>
          <SingleBoxForm planId={plan.id} pickupWindow={plan.pickupWindow} signedIn={Boolean(signedIn)} />
        </section>
      ) : joined ? (
        <section role="status" className="bg-white border border-emerald-300 rounded-xl p-5 text-center space-y-2">
          <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
          <h2 className="font-bold text-gray-900">You're in!</h2>
          <p className="text-sm text-gray-700">
            We've emailed you the details. Your first box is on {plan.firstBox && formatBoxDate(plan.firstBox, { long: true })}.
          </p>
          <button
            onClick={() => router.push('/account/csa')}
            className="mt-2 px-4 py-2 bg-emerald-600 text-white font-bold rounded-lg text-sm"
          >
            Go to My Farm Boxes
          </button>
        </section>
      ) : plan.closedReason ? (
        <p className="bg-white border rounded-xl p-5 text-sm text-gray-700 text-center">{plan.closedReason}</p>
      ) : signedIn === false ? (
        <section className="bg-white border rounded-xl p-5 text-center space-y-3">
          <p className="text-sm text-gray-700">
            Signing up needs an account, so you can skip weeks and manage your card any time. To try a box first
            without one, choose Just one box above.
          </p>
          <Link
            href={`/login?redirect=${encodeURIComponent(`/csa/${plan.id}`)}`}
            className="inline-block px-4 py-2.5 bg-emerald-600 text-white font-bold rounded-lg text-sm"
          >
            Sign in or create an account to join
          </Link>
        </section>
      ) : (
        <section className="bg-white border rounded-xl p-5 shadow-sm space-y-3">
          <h2 className="font-bold text-gray-900">Join and save your card</h2>
          <p className="text-xs text-gray-600">
            You won't be charged today. Your first charge is on{' '}
            <strong>{plan.firstBox && formatBoxDate(chargeDateFor(plan.firstBox), { long: true })}</strong>, for your
            box on {plan.firstBox && formatBoxDate(plan.firstBox)}.
          </p>
          <SaveCardForm
            captcha
            submitLabel={`Join — ${dollars(plan.cost.totalCents)} per box`}
            recurring={{
              description: `${plan.name} from ${plan.farmName}`,
              label: `${plan.name} (per box)`,
              amountCents: plan.cost.totalCents,
              everyDays: plan.frequency === 'biweekly' ? 14 : 7,
              startDate: plan.firstBox ? chargeDateFor(plan.firstBox) : undefined,
              endDate: plan.seasonEnd,
              managementUrl: `${window.location.origin}/account/csa`,
            }}
            start={async (captchaToken) => {
              if (!agreed) throw new Error('Please tick the box to agree to the payment terms.');
              const res = await postWithAuth('/api/csa/join', { action: 'start', planId: plan.id, captchaToken });
              const json = await res.json();
              if (!res.ok) throw new Error(json.error || 'Could not start joining.');
              return json.clientSecret;
            }}
            onSaved={async (setupIntentId) => {
              const res = await postWithAuth('/api/csa/join', { action: 'finish', planId: plan.id, setupIntentId, agreed });
              const json = await res.json();
              if (!res.ok) throw new Error(json.error || 'Your card was saved, but joining failed. Please contact us.');
              setJoined(true);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          >
            <label className="flex items-start gap-2 text-sm text-gray-700 bg-gray-50 border rounded-lg p-3">
              <input
                type="checkbox"
                required
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 w-4 h-4 shrink-0"
              />
              <span>
                <strong className="text-gray-900">I agree to repeat charges.</strong> {agreement} I also agree to the{' '}
                <Link href="/terms#csa" target="_blank" className="font-semibold text-emerald-800 underline">
                  Terms of Use
                </Link>
                .
              </span>
            </label>
          </SaveCardForm>
        </section>
      )}
    </div>
  );
}
