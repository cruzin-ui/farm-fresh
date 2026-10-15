'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Camera, ImageIcon, X, MapPin, Calendar, Sprout, Pencil } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { postWithAuth } from '@/lib/authedFetch';
import { resizeImage } from '@/lib/resizeImage';
import { LISTING_CATEGORIES } from '@/lib/categories';
import { PLANTS_CATEGORY, plantDetailLabels } from '@/lib/plants';
import { SELLER_FEE_RATE } from '@/lib/pricing';
import { pickupAvailability, friendlyDate } from '@/lib/dates';
import { CARD_LISTING_TAGS } from '@/lib/listingTags';
import { CategoryNotice, PlantFields, HighlightsPicker, UNIT_TYPE_OPTIONS, USUAL_UNIT } from '@/components/ListingFormParts';

// Posting a new listing one question at a time, so it works well on a phone:
// category, name, photo, price, when, extras, then a preview to check before
// posting. (Editing a listing still uses the single-page form.)

type Step = 'category' | 'name' | 'photo' | 'price' | 'when' | 'extras' | 'review';
const STEPS: Step[] = ['category', 'name', 'photo', 'price', 'when', 'extras', 'review'];

// Each category's card on the first step.
const CATEGORY_CARDS: Record<string, { emoji: string; blurb: string }> = {
  Vegetables: { emoji: '🥕', blurb: 'Tomatoes, greens, squash, roots' },
  'Fruits & Berries': { emoji: '🍓', blurb: 'Citrus, berries, melons, stone fruit' },
  'Herbs & Spices': { emoji: '🌿', blurb: 'Basil, rosemary, mint, chiles' },
  Mushrooms: { emoji: '🍄', blurb: 'Ones you cultivated: oyster, shiitake' },
  'Honey & Jam': { emoji: '🍯', blurb: 'Honey, jams, jellies, syrups' },
  'Fresh Eggs': { emoji: '🥚', blurb: 'Chicken, duck, quail' },
  'Cut Flowers': { emoji: '💐', blurb: 'Bunches, stems, bouquets' },
  [PLANTS_CATEGORY]: { emoji: '🌱', blurb: 'Starts, succulents, herbs, trees' },
};

// What is kept between visits (the photo itself can't be, so it isn't).
type Draft = {
  step: Step;
  category: string;
  title: string;
  variety: string;
  unitType: string;
  price: string;
  quantity: string;
  readyDate: string;
  endDate: string;
  potSize: string;
  sunNeeds: string;
  waterNeeds: string;
  isNative: boolean;
  description: string;
  tags: string[];
  reusedImageUrl: string | null;
};

const EMPTY: Draft = {
  step: 'category',
  category: '',
  title: '',
  variety: '',
  unitType: 'lbs',
  price: '',
  quantity: '',
  readyDate: '',
  endDate: '',
  potSize: '',
  sunNeeds: '',
  waterNeeds: '',
  isNative: false,
  description: '',
  tags: [],
  reusedImageUrl: null,
};

const dayString = (offsetDays: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function NewListingWizard({
  userId,
  farmName,
  farmPickup,
  farmPickupLoaded,
  farmState,
  sellerTermsAccepted,
  previousListings,
  onGoToProfile,
  onPosted,
  onCancel,
}: {
  userId: string;
  farmName: string;
  farmPickup: { address: string; zip: string; city: string } | null;
  farmPickupLoaded: boolean;
  farmState: { name: string; code: string } | null;
  sellerTermsAccepted: boolean;
  previousListings: any[];
  onGoToProfile: () => void;
  onPosted: () => Promise<void>;
  onCancel: () => void;
}) {
  const draftKey = `ffd-listing-draft:${userId}`;
  const [d, setD] = useState<Draft>(EMPTY);
  const [savedDraft, setSavedDraft] = useState<Draft | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [termsChecked, setTermsChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  const set = (fields: Partial<Draft>) => setD((current) => ({ ...current, ...fields }));
  const isPlant = d.category === PLANTS_CATEGORY;
  const stepIndex = STEPS.indexOf(d.step);

  // A listing left part-way on this device is offered back.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(draftKey);
      const parsed = raw ? (JSON.parse(raw) as Draft) : null;
      if (parsed?.category) setSavedDraft({ ...EMPTY, ...parsed });
    } catch {}
  }, [draftKey]);

  // Remember progress once the seller has started.
  useEffect(() => {
    if (!d.category) return;
    started.current = true;
    try {
      window.localStorage.setItem(draftKey, JSON.stringify(d));
    } catch {}
  }, [d, draftKey]);

  const forgetDraft = () => {
    try {
      window.localStorage.removeItem(draftKey);
    } catch {}
  };

  const goTo = (step: Step) => {
    setError(null);
    set({ step });
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Their own earlier posts in this category, newest first, for suggestions.
  const earlier = previousListings.filter((l) => !d.category || l.category === d.category);
  const earlierNames = [...new Set(earlier.map((l) => l.title).filter(Boolean))] as string[];
  const reusable = earlier.find((l) => l.title?.trim().toLowerCase() === d.title.trim().toLowerCase() && d.title.trim());

  const reuse = (previous: any) => {
    set({
      variety: previous.variety || '',
      unitType: previous.unit_type || d.unitType,
      price: previous.price_per_unit != null ? String(previous.price_per_unit) : '',
      description: previous.description || '',
      tags: Array.isArray(previous.tags) ? previous.tags : [],
      potSize: previous.pot_size || '',
      sunNeeds: previous.sun_needs || '',
      waterNeeds: previous.water_needs || '',
      isNative: Boolean(previous.native_state),
      reusedImageUrl: previous.image_url || null,
    });
    setImageFile(null);
    setImagePreview(null);
    goTo('price');
  };

  // What's missing on this step, or null when it's fine to move on.
  const problem = (step: Step): string | null => {
    if (step === 'category') {
      if (farmPickupLoaded && !farmPickup) return 'Add your pickup address to your Farm Profile first.';
      if (!d.category) return 'Choose a category.';
    }
    if (step === 'name') {
      if (!d.title.trim()) return isPlant ? 'Enter the plant name.' : 'Enter the crop name.';
      if (!d.variety.trim()) return 'Enter the variety or type. If you don’t know it, describe it, like “Large brown” or “Mixed”.';
    }
    if (step === 'price') {
      const price = Number(d.price);
      const quantity = Number(d.quantity);
      if (d.price === '' || !Number.isFinite(price) || price < 0) return 'Enter a price.';
      if (!Number.isInteger(quantity) || quantity < 1) return 'Enter how many you have, as a whole number of at least 1.';
    }
    if (step === 'when') {
      if (!d.readyDate) return isPlant ? 'Choose the ready date.' : 'Choose the harvest date.';
      if (d.endDate && d.endDate < d.readyDate) return '“Available until” can’t be before the ready date.';
    }
    if (step === 'review') {
      if (!sellerTermsAccepted && !termsChecked) return 'Please read and agree to the Seller Terms first.';
    }
    return null;
  };

  const next = (e?: React.FormEvent) => {
    e?.preventDefault();
    const issue = problem(d.step);
    if (issue) return setError(issue);
    if (d.step === 'review') return post();
    goTo(STEPS[stepIndex + 1]);
  };

  const pickPhoto = (file: File | null) => {
    setImageFile(file);
    setImagePreview(file ? URL.createObjectURL(file) : null);
    if (file) set({ reusedImageUrl: null });
  };

  const post = async () => {
    setPosting(true);
    setError(null);
    try {
      let imageUrl = d.reusedImageUrl;
      if (imageFile) {
        const upload = await resizeImage(imageFile);
        const fileName = `crops/${userId}-${Date.now()}.${upload.name.split('.').pop()}`;
        const { error: uploadError } = await supabase.storage.from('produce-images').upload(fileName, upload);
        if (uploadError) throw uploadError;
        imageUrl = supabase.storage.from('produce-images').getPublicUrl(fileName).data.publicUrl;
      }

      const res = await postWithAuth('/api/listings/create', {
        acceptTerms: termsChecked,
        fields: {
          title: d.title.trim(),
          variety: d.variety.trim(),
          category: d.category,
          description: d.description,
          unit_type: d.unitType,
          price_per_unit: parseFloat(d.price),
          available_quantity: parseFloat(d.quantity),
          harvest_ready_date: d.readyDate,
          harvest_end_date: d.endDate || null,
          tags: d.tags,
          pot_size: d.potSize,
          sun_needs: d.sunNeeds || null,
          water_needs: d.waterNeeds || null,
          is_native: isPlant && d.isNative,
          image_url: imageUrl,
        },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not post your listing.');

      forgetDraft();
      await onPosted();
    } catch (err: any) {
      setError(err.message || 'Something went wrong posting your listing.');
    } finally {
      setPosting(false);
    }
  };

  const photo = imagePreview || d.reusedImageUrl;
  const keepsPerUnit = Number(d.price) > 0 ? Number(d.price) * (1 - SELLER_FEE_RATE) : null;
  const availability = pickupAvailability(d.readyDate || null);

  // ---------- offer a saved draft ----------
  if (savedDraft && !started.current) {
    return (
      <div className="max-w-xl mx-auto p-6 border rounded-2xl bg-white space-y-3 text-center">
        <h2 className="text-lg font-bold text-gray-900">Pick up where you left off?</h2>
        <p className="text-sm text-gray-600">
          You started a listing{savedDraft.title ? ` for ${savedDraft.title}` : ''} ({savedDraft.category}). Any photo
          you chose will need adding again.
        </p>
        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          <button
            onClick={() => {
              setD(savedDraft);
              setSavedDraft(null);
            }}
            className="px-4 py-2.5 bg-emerald-600 text-white font-bold rounded-xl text-sm"
          >
            Continue
          </button>
          <button
            onClick={() => {
              forgetDraft();
              setSavedDraft(null);
            }}
            className="px-4 py-2.5 border rounded-xl text-sm font-semibold text-gray-700"
          >
            Start a new listing
          </button>
        </div>
      </div>
    );
  }

  const label = (text: string, htmlFor: string) => (
    <label htmlFor={htmlFor} className="block text-sm font-semibold text-gray-800 mb-1">
      {text}
    </label>
  );
  const input = 'w-full px-4 py-3 border rounded-xl text-base';

  return (
    <div ref={topRef} className="max-w-xl mx-auto scroll-mt-24">
      {/* progress */}
      <div className="mb-5">
        <div className="flex items-center justify-between text-xs font-semibold text-gray-500 mb-1.5">
          <span>
            Step {stepIndex + 1} of {STEPS.length}
          </span>
          <button type="button" onClick={onCancel} className="text-gray-500 hover:text-gray-800 underline">
            Cancel
          </button>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden" aria-hidden="true">
          <div className="h-full bg-emerald-600 transition-all" style={{ width: `${((stepIndex + 1) / STEPS.length) * 100}%` }} />
        </div>
      </div>

      <form onSubmit={next} className="space-y-5">
        {/* ---------- 1. category ---------- */}
        {d.step === 'category' && (
          <>
            <h2 className="text-2xl font-extrabold text-gray-900">What are you selling?</h2>
            {farmPickupLoaded && !farmPickup && (
              <p className="p-4 bg-amber-50 border border-amber-300 rounded-xl text-sm text-amber-950">
                <strong>First, add your pickup address.</strong> Every listing is picked up at the address on your Farm
                Profile.{' '}
                <button type="button" onClick={onGoToProfile} className="font-semibold underline">
                  Open Farm Profile
                </button>
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              {LISTING_CATEGORIES.map((cat) => {
                const card = CATEGORY_CARDS[cat] || { emoji: '🧺', blurb: '' };
                const chosen = d.category === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    disabled={farmPickupLoaded && !farmPickup}
                    onClick={() => {
                      // A new category starts from its usual unit, and plant details only belong to plants.
                      set({
                        category: cat,
                        unitType: USUAL_UNIT[cat] || 'lbs',
                        ...(cat !== PLANTS_CATEGORY ? { potSize: '', sunNeeds: '', waterNeeds: '', isNative: false } : {}),
                      });
                      setError(null);
                      // Straight on, unless there's a note to read first.
                      if (!['Mushrooms', 'Cut Flowers', 'Fresh Eggs', 'Honey & Jam', PLANTS_CATEGORY].includes(cat)) {
                        goTo('name');
                      }
                    }}
                    aria-pressed={chosen}
                    className={`text-left p-4 rounded-2xl border-2 transition-colors disabled:opacity-50 ${
                      chosen ? 'border-emerald-600 bg-emerald-50' : 'border-gray-200 bg-white hover:border-emerald-300'
                    }`}
                  >
                    <span className="block text-4xl leading-none" aria-hidden="true">
                      {card.emoji}
                    </span>
                    <span className="block mt-2 text-sm font-bold text-gray-900">{cat}</span>
                    <span className="block text-xs text-gray-500 mt-0.5">{card.blurb}</span>
                  </button>
                );
              })}
            </div>
            {d.category && <CategoryNotice category={d.category} />}
          </>
        )}

        {/* ---------- 2. name ---------- */}
        {d.step === 'name' && (
          <>
            <h2 className="text-2xl font-extrabold text-gray-900">{isPlant ? 'What plant is it?' : 'What is it?'}</h2>
            <div>
              {label(isPlant ? 'Plant name' : 'Crop name', 'wiz-title')}
              <input
                id="wiz-title"
                autoFocus
                list="wiz-earlier-names"
                placeholder={isPlant ? 'e.g., Tomato Starts' : d.category === 'Fresh Eggs' ? 'e.g., Farm Fresh Eggs' : 'e.g., Heirloom Tomatoes'}
                value={d.title}
                onChange={(e) => set({ title: e.target.value })}
                className={input}
              />
              <datalist id="wiz-earlier-names">
                {earlierNames.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
              {reusable ? (
                <button
                  type="button"
                  onClick={() => reuse(reusable)}
                  className="mt-2 w-full text-left p-3 rounded-xl border-2 border-emerald-500 bg-emerald-50 text-sm"
                >
                  <span className="font-bold text-emerald-900">Use my last &quot;{reusable.title}&quot; post&apos;s details</span>
                  <span className="block text-xs text-emerald-900/80">
                    Fills in the variety, price, photo, description and highlights. You&apos;ll just add the amount and
                    date.
                  </span>
                </button>
              ) : (
                earlierNames.length > 0 && (
                  <p className="text-xs text-gray-500 mt-1">Start typing, or tap the box to pick one you&apos;ve posted before.</p>
                )
              )}
            </div>
            <div>
              {label('Variety or type', 'wiz-variety')}
              <input
                id="wiz-variety"
                maxLength={60}
                placeholder={isPlant ? 'e.g., Cherokee Purple' : d.category === 'Fresh Eggs' ? 'e.g., Brown, Chicken' : 'e.g., Yukon Gold'}
                value={d.variety}
                onChange={(e) => set({ variety: e.target.value })}
                className={input}
              />
              <p className="text-xs text-gray-500 mt-1">
                Buyers nearly always ask. Not sure? Describe it: &quot;Large brown&quot;, &quot;Mixed&quot;.
              </p>
            </div>
          </>
        )}

        {/* ---------- 3. photo ---------- */}
        {d.step === 'photo' && (
          <>
            <h2 className="text-2xl font-extrabold text-gray-900">Add a photo</h2>
            <p className="text-sm text-gray-600">Listings with a photo get far more attention. A clear shot in daylight works best.</p>
            <div className="aspect-[4/3] rounded-2xl border-2 border-dashed border-gray-300 bg-gray-50 overflow-hidden flex items-center justify-center relative">
              {photo ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo} alt="Your photo" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => {
                      pickPhoto(null);
                      set({ reusedImageUrl: null });
                    }}
                    aria-label="Remove photo"
                    className="absolute top-2 right-2 bg-white rounded-full p-1.5 shadow"
                  >
                    <X className="w-4 h-4 text-gray-600" />
                  </button>
                </>
              ) : (
                <ImageIcon className="w-12 h-12 text-gray-300" aria-hidden="true" />
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => cameraRef.current?.click()}
                className="flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-gray-200 font-semibold text-sm text-gray-800 hover:border-emerald-300"
              >
                <Camera className="w-4 h-4" /> Take photo
              </button>
              <button
                type="button"
                onClick={() => libraryRef.current?.click()}
                className="flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-gray-200 font-semibold text-sm text-gray-800 hover:border-emerald-300"
              >
                <ImageIcon className="w-4 h-4" /> Choose photo
              </button>
            </div>
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => pickPhoto(e.target.files?.[0] || null)} />
            <input ref={libraryRef} type="file" accept="image/*" className="hidden" onChange={(e) => pickPhoto(e.target.files?.[0] || null)} />
          </>
        )}

        {/* ---------- 4. price ---------- */}
        {d.step === 'price' && (
          <>
            <h2 className="text-2xl font-extrabold text-gray-900">Price and amount</h2>
            <div>
              {label('Sold by', 'wiz-unit')}
              <select id="wiz-unit" value={d.unitType} onChange={(e) => set({ unitType: e.target.value })} className={`${input} bg-white`}>
                {UNIT_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                {label(`Price per ${d.unitType} ($)`, 'wiz-price')}
                <input
                  id="wiz-price"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  placeholder="3.50"
                  value={d.price}
                  onChange={(e) => set({ price: e.target.value })}
                  className={input}
                />
              </div>
              <div>
                {label(`How many ${d.unitType}?`, 'wiz-quantity')}
                <input
                  id="wiz-quantity"
                  type="number"
                  inputMode="numeric"
                  step="1"
                  min="1"
                  placeholder="25"
                  value={d.quantity}
                  onChange={(e) => set({ quantity: e.target.value })}
                  className={input}
                />
              </div>
            </div>
            <p className="text-sm text-gray-700 bg-gray-50 border rounded-xl p-3">
              {keepsPerUnit !== null ? (
                <>
                  You keep <strong>${keepsPerUnit.toFixed(2)}</strong> per {d.unitType} ({Math.round((1 - SELLER_FEE_RATE) * 100)}%).
                </>
              ) : (
                <>You keep {Math.round((1 - SELLER_FEE_RATE) * 100)}% of the price.</>
              )}{' '}
              Buyers order whole {d.unitType}; for smaller amounts, pick a smaller unit.
            </p>
          </>
        )}

        {/* ---------- 5. when ---------- */}
        {d.step === 'when' && (
          <>
            <h2 className="text-2xl font-extrabold text-gray-900">When is it ready?</h2>
            <div>
              {label(isPlant ? 'Ready date' : 'Harvest date', 'wiz-ready')}
              <div className="flex gap-2 mb-2">
                {[
                  ['Today', dayString(0)],
                  ['Tomorrow', dayString(1)],
                ].map(([text, day]) => (
                  <button
                    key={text}
                    type="button"
                    onClick={() => set({ readyDate: day })}
                    aria-pressed={d.readyDate === day}
                    className={`px-4 py-2 rounded-xl border-2 text-sm font-semibold ${
                      d.readyDate === day ? 'border-emerald-600 bg-emerald-50 text-emerald-900' : 'border-gray-200 text-gray-700'
                    }`}
                  >
                    {text}
                  </button>
                ))}
              </div>
              <input id="wiz-ready" type="date" value={d.readyDate} onChange={(e) => set({ readyDate: e.target.value })} className={input} />
              <p className="text-xs text-gray-500 mt-1">
                Buyers can order now either way. You have a few days from the order, or from this date if it&apos;s later,
                to mark it ready.
              </p>
            </div>
            <div>
              {label('Available until (optional)', 'wiz-end')}
              <input id="wiz-end" type="date" value={d.endDate} onChange={(e) => set({ endDate: e.target.value })} className={input} />
            </div>
            {isPlant && (
              <div className="pt-2 border-t">
                <h3 className="text-base font-bold text-gray-900 mb-2">About the plant (optional)</h3>
                <PlantFields
                  idPrefix="wiz"
                  potSize={d.potSize}
                  setPotSize={(v) => set({ potSize: v })}
                  sunNeeds={d.sunNeeds}
                  setSunNeeds={(v) => set({ sunNeeds: v })}
                  waterNeeds={d.waterNeeds}
                  setWaterNeeds={(v) => set({ waterNeeds: v })}
                  isNative={d.isNative}
                  setIsNative={(v) => set({ isNative: v })}
                  stateName={farmState?.name || null}
                />
              </div>
            )}
          </>
        )}

        {/* ---------- 6. extras ---------- */}
        {d.step === 'extras' && (
          <>
            <h2 className="text-2xl font-extrabold text-gray-900">Anything else buyers should know?</h2>
            <p className="text-sm text-gray-600">Both are optional, but they help buyers choose you.</p>
            <div>
              {label('Description', 'wiz-description')}
              <textarea
                id="wiz-description"
                rows={3}
                placeholder={
                  isPlant
                    ? 'How big it is, when it fruits or flowers, how to care for it...'
                    : 'What makes it special: how it tastes, how you grow it...'
                }
                value={d.description}
                onChange={(e) => set({ description: e.target.value })}
                className={input}
              />
            </div>
            <HighlightsPicker idPrefix="wiz" tags={d.tags} onChange={(tags) => set({ tags })} />
          </>
        )}

        {/* ---------- 7. review ---------- */}
        {d.step === 'review' && (
          <>
            <h2 className="text-2xl font-extrabold text-gray-900">Check it and post</h2>
            <p className="text-sm text-gray-600">This is how buyers will see it.</p>

            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
              <div className="h-44 bg-emerald-50 relative flex items-center justify-center overflow-hidden">
                {photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photo} alt="" className="w-full h-full object-cover" />
                ) : (
                  <Sprout className="w-10 h-10 text-emerald-700/40" aria-hidden="true" />
                )}
                <span className="absolute top-3 left-3 bg-white/90 text-emerald-900 text-[10px] font-bold px-2.5 py-1 rounded-full shadow-sm">
                  {d.category}
                </span>
                <span className="absolute top-3 right-3 bg-white/90 text-emerald-900 text-[10px] font-bold px-2.5 py-1 rounded-full shadow-sm">
                  {d.quantity} {d.unitType} left
                </span>
              </div>
              <div className="p-5 space-y-2">
                <p className="text-xs font-bold text-gray-700">{farmName || 'Your farm'}</p>
                <h3 className="font-extrabold text-gray-900 text-lg leading-snug">{d.title}</h3>
                <p className="text-xs font-semibold text-gray-500">Variety: {d.variety}</p>
                {d.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {d.tags.slice(0, CARD_LISTING_TAGS).map((tag) => (
                      <span key={tag} className="text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                {isPlant && (plantDetailLabels({ pot_size: d.potSize, sun_needs: d.sunNeeds, water_needs: d.waterNeeds }).length > 0 || d.isNative) && (
                  <p className="text-xs text-gray-700">
                    {plantDetailLabels({ pot_size: d.potSize, sun_needs: d.sunNeeds, water_needs: d.waterNeeds }).join(' · ')}
                    {d.isNative && (
                      <span className="ml-1 inline-block text-[10px] font-bold text-amber-900 bg-amber-100 px-2 py-0.5 rounded-full">
                        Native to {farmState?.name || 'your state'}
                      </span>
                    )}
                  </p>
                )}
                <p className="flex items-center gap-2 text-xs text-gray-500">
                  <MapPin className="w-3.5 h-3.5 text-emerald-600" /> {farmPickup?.city || 'Your area'}
                </p>
                <p className="flex items-center gap-2 text-xs">
                  <Calendar className="w-3.5 h-3.5 text-gray-400" />
                  <span className={`font-bold px-2 py-0.5 rounded-md ${availability.tagClass}`}>{availability.label}</span>
                </p>
                <p className="pt-2 border-t">
                  <span className="text-2xl font-black text-gray-900">${Number(d.price || 0).toFixed(2)}</span>
                  <span className="text-xs text-gray-500"> / {d.unitType}</span>
                </p>
              </div>
            </div>

            <ul className="divide-y border rounded-xl text-sm">
              {(
                [
                  ['category', 'Category', d.category],
                  ['name', isPlant ? 'Plant' : 'Crop', `${d.title} · ${d.variety}`],
                  ['photo', 'Photo', photo ? 'Added' : 'None'],
                  ['price', 'Price and amount', `$${Number(d.price || 0).toFixed(2)} / ${d.unitType} · ${d.quantity} available`],
                  ['when', 'Ready', `${friendlyDate(d.readyDate)}${d.endDate ? `, until ${friendlyDate(d.endDate)}` : ''}`],
                  ['extras', 'Description and highlights', d.description || d.tags.length ? 'Added' : 'None'],
                ] as [Step, string, string][]
              ).map(([step, name, value]) => (
                <li key={step} className="flex items-center justify-between gap-3 p-3">
                  <span className="min-w-0">
                    <span className="block text-xs text-gray-500">{name}</span>
                    <span className="block font-semibold text-gray-900 truncate">{value}</span>
                  </span>
                  <button type="button" onClick={() => goTo(step)} className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-emerald-800">
                    <Pencil className="w-3.5 h-3.5" /> Edit
                  </button>
                </li>
              ))}
            </ul>

            <p className="text-xs text-gray-600">
              Picked up at your farm&apos;s address in {farmPickup?.city || 'your area'}. Buyers get the full address when
              their order is ready.
            </p>

            {!sellerTermsAccepted && (
              <label className="flex items-start gap-2 p-4 bg-gray-50 border rounded-xl text-xs text-gray-700">
                <input type="checkbox" checked={termsChecked} onChange={(e) => setTermsChecked(e.target.checked)} className="mt-0.5 w-4 h-4 shrink-0" />
                <span>
                  I have read and agree to the{' '}
                  <a href="/seller-terms" target="_blank" rel="noopener" className="font-semibold text-emerald-800 underline">
                    Seller Terms
                  </a>
                  . I&apos;m responsible for making sure everything I sell is legal to sell in my state, including any
                  licenses, permits, labeling and food-safety requirements. Farm Fresh Direct does not inspect or approve
                  what I sell.
                </span>
              </label>
            )}
          </>
        )}

        {error && (
          <p role="alert" className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
            {error}
          </p>
        )}

        {/* ---------- back / next ---------- */}
        <div className="flex gap-3 pt-2">
          {stepIndex > 0 && (
            <button
              type="button"
              onClick={() => goTo(STEPS[stepIndex - 1])}
              disabled={posting}
              className="flex items-center justify-center gap-1.5 px-5 py-3.5 rounded-xl border-2 border-gray-200 font-semibold text-sm text-gray-700"
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
          )}
          {(d.step !== 'category' || d.category) && (
            <button
              type="submit"
              disabled={posting}
              className="flex-1 flex items-center justify-center gap-1.5 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm disabled:bg-gray-400"
            >
              {d.step === 'review' ? (
                posting ? 'Posting…' : 'Post listing'
              ) : d.step === 'photo' && !photo ? (
                <>
                  Skip for now <ArrowRight className="w-4 h-4" />
                </>
              ) : (
                <>
                  Next <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
