'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Package, Plus, AlertCircle, CheckCircle2, Users, ChevronDown, Camera, ImageIcon, X, Egg } from 'lucide-react';
import SharedBoxHostPanel, { type HostFarm } from '@/components/SharedBoxHostPanel';
import SharedBoxPartner from '@/components/SharedBoxPartner';
import {
  DEFAULT_DROPOFF_NOTE,
  EGG_NOTICE_SELLER,
  HOST_PACKING_LABEL,
  MIN_HOST_SHARE_CENTS,
  SHARED_BOX_MAX_PARTNERS,
  SHARED_BOX_MILES,
  SHARED_BOX_STEPS,
  farmKeepsCents as sharedKeepsCents,
  sharedBoxAgreementText,
} from '@/lib/sharedBoxTerms';
import { postWithAuth } from '@/lib/authedFetch';
import { supabase } from '@/lib/supabaseClient';
import { resizeImage } from '@/lib/resizeImage';
import Photo from '@/components/Photo';
import { boxCostCents } from '@/lib/csaTerms';
import { boxKindName, describeFrequency, formatBoxDate, todayInArizona, WEEKDAYS, CHARGE_DAYS_BEFORE } from '@/lib/csaSchedule';
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
  oneOff: number;
  // Shared boxes: each partner's answer for the week, and whether a missing
  // part can be reported.
  confirmByLabel?: string;
  canReportMissing?: boolean;
  partners?: { farmerId: string; name: string; answer: string | null }[];
};

const ANSWER_TEXT: Record<string, string> = {
  confirmed: 'confirmed',
  asked: 'not answered yet',
  cant: "can't this week",
  no_reply: 'left out (no answer)',
  missing: 'reported missing',
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
  status: 'forming' | 'open' | 'closed' | 'ended';
  kind: 'solo' | 'shared';
  boxType: 'food' | 'flowers';
  dropoffNote: string;
  hostSubstitutes: boolean;
  hostPart: { contribution: string; priceDollars: string; includesEggs: boolean } | null;
  farms: HostFarm[];
  everJoined: boolean;
  imageUrl: string | null;
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
  // The saved photo, or '' for none.
  imageUrl: string;
  // What's in it, and whether nearby farms help fill it (both set when the
  // box is created).
  boxType: 'food' | 'flowers';
  kind: 'solo' | 'shared';
  // Shared boxes: the host's own part (priceDollars is its price), eggs,
  // where partners drop off, and filling in for a missing part.
  hostContribution: string;
  includesEggs: boolean;
  dropoffNote: string;
  hostSubstitutes: boolean;
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
  imageUrl: '',
  boxType: 'food',
  kind: 'solo',
  hostContribution: '',
  includesEggs: false,
  dropoffNote: DEFAULT_DROPOFF_NOTE,
  hostSubstitutes: false,
};

const STATUS_PILL: Record<Plan['status'], string> = {
  forming: 'bg-sky-100 text-sky-900',
  open: 'bg-emerald-100 text-emerald-800',
  closed: 'bg-amber-100 text-amber-900',
  ended: 'bg-gray-100 text-gray-600',
};
const STATUS_TEXT: Record<Plan['status'], string> = {
  forming: 'Gathering partner farms',
  open: 'Taking members',
  closed: 'Not taking new members',
  ended: 'Ended',
};

// The CSA section of the Seller Dashboard: set up Farm Boxes, write each
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
  const [acceptSharedTerms, setAcceptSharedTerms] = useState(false);
  // A missing part being reported: "planId|date|farmerId".
  const [missingFor, setMissingFor] = useState<string | null>(null);
  // A new photo picked in the form, uploaded when it is saved.
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const pickPhoto = (file: File | null) => {
    setPhotoFile(file);
    setPhotoPreview(file ? URL.createObjectURL(file) : null);
  };

  // Opens the form, forgetting any photo picked for a previous one.
  const openForm = (next: Form | null) => {
    pickPhoto(null);
    setForm(next);
  };

  // Uploads the new photo, if there is one, and returns the photo to save.
  const photoToSave = async () => {
    if (!photoFile) return form?.imageUrl || '';
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw new Error('Please sign in again.');
    const upload = await resizeImage(photoFile);
    const fileName = `crops/${data.session.user.id}-farmbox-${Date.now()}.${upload.name.split('.').pop()}`;
    const { error } = await supabase.storage.from('produce-images').upload(fileName, upload);
    if (error) throw error;
    return supabase.storage.from('produce-images').getPublicUrl(fileName).data.publicUrl;
  };
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  // Weeks whose note was just saved: their button says "Saved" until edited.
  const [savedNotes, setSavedNotes] = useState<Set<string>>(new Set());
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
    value: String(form?.[name] || ''),
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((current) => (current ? { ...current, [name]: e.target.value } : current)),
  });

  const priceCents = Math.round(Number(form?.priceDollars || 0) * 100);
  const cost = priceCents > 0 ? boxCostCents(priceCents) : null;
  const farmKeepsCents = priceCents - Math.round(priceCents * SELLER_FEE_RATE);
  const editingPlan = form?.id ? plans?.find((p) => p.id === form.id) : undefined;
  const editingJoined = Boolean(editingPlan?.everJoined);
  const formShared = form?.kind === 'shared';
  const formKind = boxKindName(form?.boxType);
  // A shared box's own part can change only while it is still forming.
  const hostPartLocked = Boolean(editingPlan && editingPlan.status !== 'forming');
  const hostPartChanged =
    !editingPlan ||
    !editingPlan.hostPart ||
    editingPlan.hostPart.contribution !== form?.hostContribution ||
    editingPlan.hostPart.priceDollars !== Number(form?.priceDollars || 0).toFixed(2) ||
    editingPlan.hostPart.includesEggs !== form?.includesEggs;
  const running = (plans || []).filter((p) => p.status !== 'ended');
  const ended = (plans || []).filter((p) => p.status === 'ended');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Package className="w-5 h-5 text-emerald-600" /> Farm Boxes and Flower Boxes
          </h2>
          <p className="text-sm text-gray-600 max-w-xl mb-2">
            <strong className="text-gray-800">A Farm Box is essentially a CSA</strong> (community supported agriculture):
            buyers sign up for a regular box from your farm through the season. You get steady, predictable sales, you
            know how many boxes to fill before you harvest, and members become regulars. Buyers can also buy a single
            box to try it first; those show in your weekly counts as one-off boxes and count toward any member limit.
          </p>
          <p className="text-sm text-gray-600 max-w-xl mb-2">
            Members get a box from you on a set day, all season. Each box is charged to their saved card{' '}
            {CHARGE_DAYS_BEFORE} days before pickup and shows up in your Orders and Pick List like any order. You're paid
            when they collect it, as usual.
          </p>
          <p className="text-sm text-gray-600 max-w-xl">
            <strong className="text-gray-800">Grow flowers?</strong> Offer a Flower Box instead.{' '}
            <strong className="text-gray-800">Only grow a few things?</strong> Fill a box together with up to{' '}
            {SHARED_BOX_MAX_PARTNERS} farms within {SHARED_BOX_MILES} miles: each farm adds its own part and is paid for it.
          </p>
        </div>
        {!form && (
          <button
            onClick={() => {
              openForm({ ...EMPTY_FORM, seasonStart: todayInArizona() });
              setError(null);
            }}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm"
          >
            <Plus className="w-4 h-4" /> New Farm Box
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

      <SharedBoxPartner sellerTermsAccepted={sellerTermsAccepted} />

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
            let imageUrl = '';
            try {
              setBusy('save');
              imageUrl = await photoToSave();
            } catch (err: any) {
              setBusy(null);
              setError(err.message || 'Your photo could not be uploaded.');
              return;
            }
            const json = await call(
              { action: 'save_plan', plan: { ...form, imageUrl }, acceptTerms, acceptSharedTerms },
              'save',
              form.id
                ? `${formKind} updated.`
                : formShared
                  ? `${formKind} created. Now invite nearby farms below; buyers see it once you open it.`
                  : `${formKind} created. It now shows on your farm page.`
            );
            if (json) {
              openForm(null);
              setAcceptSharedTerms(false);
            }
          }}
          className="border border-emerald-200 bg-emerald-50/40 rounded-2xl p-5 space-y-4"
        >
          <h3 className="font-bold text-gray-900">{form.id ? `Edit ${formKind}` : `New ${formKind}`}</h3>
          {!form.id && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <p className="block text-xs font-semibold text-gray-700 mb-1">What's in it? *</p>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      ['food', 'Food', 'Produce, eggs and more'],
                      ['flowers', 'Flowers', 'Cut flowers'],
                    ] as const
                  ).map(([value, label, detail]) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={form.boxType === value}
                      onClick={() => setForm((current) => (current ? { ...current, boxType: value, includesEggs: value === 'flowers' ? false : current.includesEggs } : current))}
                      className={`rounded-xl border-2 px-3 py-2 text-left ${form.boxType === value ? 'border-emerald-600 bg-white' : 'border-gray-200 bg-white/60'}`}
                    >
                      <span className="block text-sm font-bold text-gray-900">{label}</span>
                      <span className="block text-xs text-gray-600">{detail}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="block text-xs font-semibold text-gray-700 mb-1">Who fills it? *</p>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      ['solo', 'Just my farm', 'Everything from you'],
                      ['shared', 'With nearby farms', `Up to ${SHARED_BOX_MAX_PARTNERS} partners`],
                    ] as const
                  ).map(([value, label, detail]) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={form.kind === value}
                      onClick={() => setForm((current) => (current ? { ...current, kind: value } : current))}
                      className={`rounded-xl border-2 px-3 py-2 text-left ${form.kind === value ? 'border-emerald-600 bg-white' : 'border-gray-200 bg-white/60'}`}
                    >
                      <span className="block text-sm font-bold text-gray-900">{label}</span>
                      <span className="block text-xs text-gray-600">{detail}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
          {formShared && (
            <details open={!form.id} className="text-sm text-gray-700 bg-white border rounded-lg p-3">
              <summary className="font-semibold text-gray-900 cursor-pointer">How a shared box works</summary>
              <ol className="list-decimal pl-5 mt-2 space-y-1">
                {SHARED_BOX_STEPS.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </details>
          )}
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
              <input id="csa-name" required maxLength={80} placeholder={form.boxType === 'flowers' ? 'e.g., "Weekly Bouquet"' : 'e.g., "Weekly Veggie Box"'} {...field('name')} className="w-full px-3 py-2 border rounded-lg text-sm bg-white" />
            </div>
            <div className="sm:col-span-2">
              <p id="csa-photo-label" className="block text-xs font-semibold text-gray-700 mb-1">
                Photo (optional, but boxes with a photo stand out)
              </p>
              <div role="group" aria-labelledby="csa-photo-label" className="flex flex-wrap items-center gap-3">
                {photoPreview || form.imageUrl ? (
                  <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photoPreview || form.imageUrl} alt="Farm Box photo" className="w-20 h-20 rounded-lg object-cover border" />
                    <button
                      type="button"
                      onClick={() => {
                        pickPhoto(null);
                        setForm((current) => (current ? { ...current, imageUrl: '' } : current));
                      }}
                      aria-label="Remove photo"
                      className="absolute -top-2 -right-2 bg-white border rounded-full p-0.5 shadow-sm"
                    >
                      <X className="w-3.5 h-3.5 text-gray-500" />
                    </button>
                  </div>
                ) : (
                  <div className="w-20 h-20 rounded-lg bg-white flex items-center justify-center border border-dashed">
                    <ImageIcon className="w-6 h-6 text-gray-300" />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-2 border rounded-lg text-xs font-semibold text-gray-700 bg-white hover:bg-gray-50"
                >
                  <Camera className="w-3.5 h-3.5" /> Take Photo
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-2 border rounded-lg text-xs font-semibold text-gray-700 bg-white hover:bg-gray-50"
                >
                  <ImageIcon className="w-3.5 h-3.5" /> Choose Photo
                </button>
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => pickPhoto(e.target.files?.[0] || null)}
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => pickPhoto(e.target.files?.[0] || null)}
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">A typical week's box works well, so members can see what they get.</p>
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
                placeholder={
                  form.boxType === 'flowers'
                    ? 'e.g., A mixed bouquet of whatever is blooming that week: zinnias, sunflowers, cosmos.'
                    : formShared
                      ? 'e.g., Seasonal vegetables from us, a dozen eggs and fruit from neighboring farms. Feeds two for a week.'
                      : 'e.g., 6–8 items of whatever is best that week: greens, roots, squash, herbs. Feeds two for a week.'
                }
                {...field('description')}
                className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
              />
            </div>
            {formShared && (
              <div className="sm:col-span-2">
                <label htmlFor="csa-host-part" className="block text-xs font-semibold text-gray-700 mb-1">
                  What your farm puts in each box *
                </label>
                <input
                  id="csa-host-part"
                  required
                  maxLength={200}
                  disabled={hostPartLocked}
                  placeholder={form.boxType === 'flowers' ? 'e.g., a mixed bunch of 12 stems' : 'e.g., 6–8 seasonal vegetables'}
                  {...field('hostContribution')}
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-white disabled:bg-gray-100"
                />
              </div>
            )}
            <div>
              <label htmlFor="csa-price" className="block text-xs font-semibold text-gray-700 mb-1">
                {formShared ? 'Price of your part, per box ($) *' : 'Price per box ($) *'}
              </label>
              <input
                id="csa-price"
                required
                type="number"
                min={formShared ? MIN_HOST_SHARE_CENTS / 100 : 5}
                max="500"
                step="0.01"
                inputMode="decimal"
                disabled={formShared && hostPartLocked}
                {...field('priceDollars')}
                className="w-full px-3 py-2 border rounded-lg text-sm bg-white disabled:bg-gray-100"
              />
              {formShared ? (
                priceCents > 0 && (
                  <p className="text-xs text-gray-600 mt-1">
                    You keep ${(sharedKeepsCents(priceCents, 'host') / 100).toFixed(2)} a box for your part, plus a{' '}
                    {HOST_PACKING_LABEL} packing fee from each partner's part. The box price is every farm's part added together.
                  </p>
                )
              ) : (
                cost && (
                  <p className="text-xs text-gray-600 mt-1">
                    Members pay ${(cost.totalCents / 100).toFixed(2)} with the service fee. You keep $
                    {(farmKeepsCents / 100).toFixed(2)} a box.
                    {editingJoined && ' A new price applies to new members only.'}
                  </p>
                )
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
            {formShared && (
              <>
                {form.boxType === 'food' && (
                  <div className="sm:col-span-2 space-y-2">
                    <label className="flex items-start gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        disabled={hostPartLocked}
                        checked={form.includesEggs}
                        onChange={(e) => setForm((current) => (current ? { ...current, includesEggs: e.target.checked } : current))}
                        className="mt-0.5 w-4 h-4"
                      />
                      <span>My part includes eggs</span>
                    </label>
                    {form.includesEggs && (
                      <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-2">
                        <Egg className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" /> {EGG_NOTICE_SELLER}
                      </p>
                    )}
                  </div>
                )}
                <div className="sm:col-span-2">
                  <label htmlFor="csa-dropoff" className="block text-xs font-semibold text-gray-700 mb-1">
                    When partners drop off their part at your farm
                  </label>
                  <input id="csa-dropoff" maxLength={200} placeholder={DEFAULT_DROPOFF_NOTE} {...field('dropoffNote')} className="w-full px-3 py-2 border rounded-lg text-sm bg-white" />
                </div>
                <label className="sm:col-span-2 flex items-start gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    disabled={editingJoined}
                    checked={form.hostSubstitutes}
                    onChange={(e) => setForm((current) => (current ? { ...current, hostSubstitutes: e.target.checked } : current))}
                    className="mt-0.5 w-4 h-4"
                  />
                  <span>
                    If a partner's part doesn't arrive, I may fill in with my own produce of at least the same value (and be paid
                    for it). Otherwise buyers are refunded that part.
                  </span>
                </label>
              </>
            )}
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

          {formShared && hostPartChanged && !hostPartLocked && (
            <label className="flex items-start gap-2 text-sm text-gray-700 bg-white border rounded-lg p-3">
              <input
                type="checkbox"
                required
                checked={acceptSharedTerms}
                onChange={(e) => setAcceptSharedTerms(e.target.checked)}
                className="mt-0.5 w-4 h-4 shrink-0"
              />
              <span>
                <strong className="text-gray-900">I agree to host a shared {formKind}.</strong>{' '}
                {sharedBoxAgreementText({
                  role: 'host',
                  planName: form.name || 'this box',
                  hostFarmName: 'my farm',
                  contribution: form.hostContribution,
                  shareCents: priceCents || 0,
                  boxType: form.boxType,
                  includesEggs: form.includesEggs,
                  hostSubstitutes: form.hostSubstitutes,
                })}{' '}
                <Link href="/seller-terms#shared" target="_blank" className="font-semibold text-emerald-800 underline">
                  Read section 7
                </Link>
              </span>
            </label>
          )}
          {!sellerTermsAccepted && (
            <label className="flex items-start gap-2 text-sm text-gray-700">
              <input type="checkbox" required checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)} className="mt-0.5 w-4 h-4" />
              <span>
                I agree to the{' '}
                <Link href="/seller-terms" target="_blank" className="font-semibold text-emerald-800 underline">
                  Seller Terms
                </Link>
                , including the Farm Box commitments.
              </span>
            </label>
          )}

          <div className="flex gap-2">
            <button type="submit" disabled={busy !== null} className="px-4 py-2.5 bg-emerald-600 text-white font-bold rounded-xl text-sm disabled:opacity-50">
              {busy === 'save' ? 'Saving…' : form.id ? 'Save changes' : `Create ${formKind}`}
            </button>
            <button type="button" onClick={() => openForm(null)} className="px-4 py-2.5 text-sm font-semibold text-gray-700">
              Cancel
            </button>
          </div>
        </form>
      )}

      {plans === null && <p className="text-sm text-gray-500">Loading…</p>}
      {plans && plans.length === 0 && !form && (
        <div className="border border-dashed rounded-2xl p-6 text-center text-sm text-gray-600">
          You don't offer a Farm Box yet. A Farm Box gives you regular customers and steady weekly sales you can plan
          your harvest around, and you can fill one together with nearby farms.
        </div>
      )}

      {/* ---------- each running share ---------- */}
      {running.map((plan) => (
        <section key={plan.id} className="border rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex items-start gap-3">
              {plan.imageUrl && (
                <Photo src={plan.imageUrl} alt={plan.name} sizes="64px" className="w-16 h-16 rounded-lg object-cover border shrink-0" />
              )}
              <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-700">
                {plan.kind === 'shared' ? `Shared ${boxKindName(plan.boxType)} · you host` : boxKindName(plan.boxType)}
              </p>
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
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-[11px] font-bold rounded-full px-2.5 py-1 ${STATUS_PILL[plan.status]}`}>{STATUS_TEXT[plan.status]}</span>
              <button
                onClick={() =>
                  openForm({
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
                    status: plan.status === 'closed' ? 'closed' : 'open',
                    imageUrl: plan.imageUrl || '',
                    boxType: plan.boxType,
                    kind: plan.kind,
                    hostContribution: plan.hostPart?.contribution || '',
                    includesEggs: plan.hostPart?.includesEggs || false,
                    dropoffNote: plan.dropoffNote,
                    hostSubstitutes: plan.hostSubstitutes,
                    ...(plan.hostPart ? { priceDollars: plan.hostPart.priceDollars } : {}),
                  })
                }
                className="text-xs font-semibold border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50"
              >
                Edit
              </button>
            </div>
          </div>

          {plan.kind === 'shared' && (
            <SharedBoxHostPanel
              planId={plan.id}
              planStatus={plan.status}
              dropoffNote={plan.dropoffNote}
              farms={plan.farms}
              busy={busy}
              call={call}
            />
          )}

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
                          {week.oneOff > 0 && ` · ${week.oneOff} one-off`}
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
                        {plan.kind === 'shared' && plan.status !== 'forming' && (week.partners || []).length > 0 && (
                          <div className="text-xs text-gray-700 space-y-1">
                            <p>
                              <strong>Partners:</strong>{' '}
                              {(week.partners || [])
                                .map((p) => `${p.name}: ${p.answer ? ANSWER_TEXT[p.answer] || p.answer : 'not asked yet'}`)
                                .join(' · ')}
                              {week.canChange && ` (answers close ${week.confirmByLabel})`}
                            </p>
                            {week.canReportMissing &&
                              (week.partners || [])
                                .filter((p) => p.answer !== 'missing' && p.answer !== 'cant' && p.answer !== 'no_reply')
                                .map((p) => {
                                  const missingKey = `${plan.id}|${week.date}|${p.farmerId}`;
                                  const report = (substitute: boolean) =>
                                    call(
                                      { action: 'report_missing', planId: plan.id, boxDate: week.date, farmerId: p.farmerId, substitute },
                                      missingKey,
                                      substitute
                                        ? `Recorded: you filled in for ${p.name}. Buyers were told, and you're paid for that part.`
                                        : `Recorded: ${p.name}'s part didn't arrive. Buyers have been refunded that part.`
                                    ).then((json) => json && setMissingFor(null));
                                  return missingFor === missingKey ? (
                                    <div key={p.farmerId} className="p-2 border border-red-200 bg-red-50 rounded-lg space-y-2">
                                      <p className="text-red-900">
                                        {p.name}'s part didn't arrive for {week.label}? Do this before handing out boxes; it counts as a
                                        cancellation by {p.name}.
                                      </p>
                                      <div className="flex flex-wrap gap-2">
                                        <button disabled={busy !== null} onClick={() => report(false)} className="px-3 py-1.5 font-bold bg-red-600 text-white rounded-lg disabled:opacity-50">
                                          Refund buyers that part
                                        </button>
                                        {plan.hostSubstitutes && (
                                          <button disabled={busy !== null} onClick={() => report(true)} className="px-3 py-1.5 font-bold border border-gray-300 bg-white rounded-lg disabled:opacity-50">
                                            I filled in with my own produce
                                          </button>
                                        )}
                                        <button onClick={() => setMissingFor(null)} className="font-semibold text-gray-600">
                                          Never mind
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <button key={p.farmerId} onClick={() => setMissingFor(missingKey)} className="mr-3 font-semibold text-red-700 underline">
                                      {p.name}'s part didn't arrive
                                    </button>
                                  );
                                })}
                          </div>
                        )}
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
                            onClick={async () => {
                              const json = await call({ action: 'save_week', planId: plan.id, boxDate: week.date, note: draft }, key, 'Box note saved.');
                              if (json) setSavedNotes((current) => new Set(current).add(key));
                            }}
                            className="px-3 py-2 text-xs font-semibold border border-gray-300 rounded-lg disabled:opacity-50"
                          >
                            {busy === key ? 'Saving…' : savedNotes.has(key) && draft === week.note ? '✓ Saved' : 'Save note'}
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
                                    "That week is called off. Members have been told and won't be charged, and anyone who bought just that box is refunded."
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
                  Ending a Farm Box cancels every membership. Nobody is charged again; boxes already paid for stay in your
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
                      const json = await call({ action: 'end_plan', planId: plan.id, reason }, `end${plan.id}`, 'Farm Box ended. Members have been told.');
                      if (json) setReasonFor(null);
                    }}
                    className="px-3 py-2 text-xs font-bold bg-red-600 text-white rounded-lg disabled:opacity-50"
                  >
                    End Farm Box
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
                End this {boxKindName(plan.boxType)}
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
