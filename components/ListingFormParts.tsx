'use client';

import React, { useState } from 'react';
import { X } from 'lucide-react';
import { PLANTS_CATEGORY, SUN_NEEDS, WATER_NEEDS, POT_SIZE_MAX } from '@/lib/plants';
import {
  LISTING_TAG_OPTIONS,
  MAX_LISTING_TAGS,
  MAX_LISTING_TAG_LENGTH,
  CARD_LISTING_TAGS,
  cleanListingTag,
} from '@/lib/listingTags';

// Pieces of the listing form shared by posting a new listing (step by step)
// and editing one (the single-page form in the Seller Dashboard).

export const UNIT_TYPE_OPTIONS = [
  { value: 'lbs', label: 'lbs (Pounds)' },
  { value: 'oz', label: 'oz (Ounces)' },
  { value: 'kg', label: 'kg (Kilograms)' },
  { value: 'units', label: 'Units (each, e.g. per pumpkin)' },
  { value: 'plants', label: 'Plants (each)' },
  { value: 'pots', label: 'Pots' },
  { value: 'dozen', label: 'Dozen' },
  { value: 'bunches', label: 'Bunches' },
  { value: 'bouquets', label: 'Bouquets' },
  { value: 'stems', label: 'Stems' },
  { value: 'bags', label: 'Bags' },
  { value: 'flats', label: 'Flats' },
  { value: 'pints', label: 'Pints' },
  { value: 'quarts', label: 'Quarts' },
  { value: 'jars', label: 'Jars' },
  { value: 'packets', label: 'Packets' },
];

// The unit each category is usually sold in, to start new listings from.
export const USUAL_UNIT: Record<string, string> = {
  Vegetables: 'lbs',
  'Fruits & Berries': 'lbs',
  'Herbs & Spices': 'bunches',
  Mushrooms: 'lbs',
  'Honey & Jam': 'jars',
  'Fresh Eggs': 'dozen',
  'Cut Flowers': 'bunches',
  [PLANTS_CATEGORY]: 'plants',
};

const noteClass = 'p-4 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-950';

// What a seller needs to know about a category before listing in it.
export function CategoryNotice({ category }: { category: string }) {
  if (category === 'Mushrooms') {
    return (
      <div className={noteClass}>
        <p className="font-bold text-sm">Cultivated mushrooms only</p>
        <p className="mt-0.5">
          List only mushrooms you grew yourself, such as on logs, blocks or in a grow room. Mushrooms gathered from the
          wild can&apos;t be sold here, because some poisonous kinds look like edible ones. Keep them cool and sell
          them fresh.
        </p>
      </div>
    );
  }
  if (category === 'Cut Flowers') {
    return (
      <div className={noteClass}>
        <p className="font-bold text-sm">Cut flowers you grew</p>
        <p className="mt-0.5">
          Stems, bunches and bouquets from your own garden or farm. For potted plants and seedlings, choose Plants
          &amp; Seedlings instead. Because flowers aren&apos;t food, sales tax is added to them at checkout where it
          applies; you don&apos;t need to do anything about it.
        </p>
      </div>
    );
  }
  if (category === PLANTS_CATEGORY) {
    return (
      <div className={noteClass}>
        <p className="font-bold text-sm">Check your state&apos;s plant rules before listing</p>
        <p className="mt-0.5">
          States regulate selling plants. Depending on where you are, you may need a nursery licence or inspection,
          some plants (such as invasive species) can&apos;t be sold at all, and protected native plants need permits or
          tags. List only plants you grew or propagated yourself, never ones dug up from the wild. You&apos;re
          responsible for following the rules where you sell.
        </p>
        <p className="mt-1.5 font-semibold">Check your state&apos;s agriculture department regulations before listing plants.</p>
      </div>
    );
  }
  if (category === 'Fresh Eggs' || category === 'Honey & Jam') {
    return (
      <div className={noteClass}>
        <p className="font-bold text-sm">Check your state&apos;s rules before listing this</p>
        <p className="mt-0.5">
          {category === 'Fresh Eggs'
            ? 'States commonly have rules for selling eggs: keeping them refrigerated, how cartons are labeled, and a license above a certain number of hens or dozens.'
            : "Honey, jam and other prepared foods usually fall under your state's cottage food laws, which decide what may be made at home and how it must be labeled."}{' '}
          You&apos;re responsible for making sure it&apos;s legal to sell where you are.{' '}
          <a href="/faq" target="_blank" rel="noopener" className="font-semibold underline">
            Read more in the FAQ
          </a>
          .
        </p>
      </div>
    );
  }
  return null;
}

// Pot size, sun, water and native, for Plants & Seedlings.
export function PlantFields(props: {
  potSize: string;
  setPotSize: (value: string) => void;
  sunNeeds: string;
  setSunNeeds: (value: string) => void;
  waterNeeds: string;
  setWaterNeeds: (value: string) => void;
  isNative: boolean;
  setIsNative: (value: boolean) => void;
  // The farm's state, from its pickup zip code.
  stateName: string | null;
  idPrefix: string;
}) {
  const { potSize, setPotSize, sunNeeds, setSunNeeds, waterNeeds, setWaterNeeds, isNative, setIsNative, stateName, idPrefix } = props;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label htmlFor={`${idPrefix}-pot-size`} className="block text-xs font-semibold text-gray-700 mb-1">
            Pot size
          </label>
          <input
            id={`${idPrefix}-pot-size`}
            type="text"
            maxLength={POT_SIZE_MAX}
            placeholder="e.g., 4-inch, 1 gallon"
            value={potSize}
            onChange={(e) => setPotSize(e.target.value)}
            className="w-full px-4 py-2 border rounded-lg text-sm"
          />
        </div>
        <div>
          <label htmlFor={`${idPrefix}-sun`} className="block text-xs font-semibold text-gray-700 mb-1">
            Sun
          </label>
          <select
            id={`${idPrefix}-sun`}
            value={sunNeeds}
            onChange={(e) => setSunNeeds(e.target.value)}
            className="w-full px-4 py-2 border rounded-lg text-sm bg-white"
          >
            <option value="">Not specified</option>
            {Object.entries(SUN_NEEDS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${idPrefix}-water`} className="block text-xs font-semibold text-gray-700 mb-1">
            Water
          </label>
          <select
            id={`${idPrefix}-water`}
            value={waterNeeds}
            onChange={(e) => setWaterNeeds(e.target.value)}
            className="w-full px-4 py-2 border rounded-lg text-sm bg-white"
          >
            <option value="">Not specified</option>
            {Object.entries(WATER_NEEDS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="flex items-start gap-2 text-sm text-gray-800">
          <input
            type="checkbox"
            checked={isNative}
            onChange={(e) => setIsNative(e.target.checked)}
            className="mt-0.5 w-4 h-4 shrink-0"
          />
          <span>
            <strong>Native to {stateName || 'my state'}</strong>
            <span className="block text-xs text-gray-500">
              Buyers see a &quot;Native to {stateName || 'your state'}&quot; label. The state comes from your pickup
              address.
            </span>
          </span>
        </label>
        {isNative && (
          <p className="mt-2 p-3 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-950">
            Some native plants are protected and need state permits or tags to sell. You&apos;re responsible for having
            any permit or tag your plant needs. Check your state&apos;s agriculture department regulations.
          </p>
        )}
      </div>
    </div>
  );
}

// The highlights picker: ready-made ones to tap, or the seller's own.
export function HighlightsPicker({
  tags,
  onChange,
  idPrefix,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  idPrefix: string;
}) {
  const [customTag, setCustomTag] = useState('');
  const [customTagError, setCustomTagError] = useState<string | null>(null);
  const full = tags.length >= MAX_LISTING_TAGS;

  const toggle = (tag: string) =>
    onChange(tags.includes(tag) ? tags.filter((t) => t !== tag) : full ? tags : [...tags, tag]);

  const addCustom = () => {
    const result = cleanListingTag(customTag);
    if ('error' in result) return setCustomTagError(result.error);
    if (tags.some((tag) => tag.toLowerCase() === result.tag.toLowerCase())) return setCustomTagError('You already have that one.');
    if (full) return setCustomTagError(`You can have up to ${MAX_LISTING_TAGS}. Remove one first.`);
    // Typing a ready-made one picks it rather than making a copy.
    const readyMade = LISTING_TAG_OPTIONS.find((option) => option.toLowerCase() === result.tag.toLowerCase());
    onChange([...tags, readyMade || result.tag]);
    setCustomTag('');
    setCustomTagError(null);
  };

  return (
    <div>
      <p id={`${idPrefix}-highlights-label`} className="block text-xs font-semibold text-gray-700 mb-1">
        Highlights ({tags.length}/{MAX_LISTING_TAGS})
      </p>
      <div role="group" aria-labelledby={`${idPrefix}-highlights-label`} className="flex flex-wrap gap-2">
        {LISTING_TAG_OPTIONS.map((tag) => {
          const selected = tags.includes(tag);
          const atLimit = !selected && full;
          return (
            <button
              key={tag}
              type="button"
              onClick={() => toggle(tag)}
              aria-pressed={selected}
              disabled={atLimit}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                selected
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : atLimit
                    ? 'bg-gray-50 text-gray-300 border-gray-200 cursor-not-allowed'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-emerald-400'
              }`}
            >
              {tag}
            </button>
          );
        })}
      </div>
      {tags.some((tag) => !LISTING_TAG_OPTIONS.includes(tag)) && (
        <div className="flex flex-wrap gap-2 mt-2">
          {tags
            .filter((tag) => !LISTING_TAG_OPTIONS.includes(tag))
            .map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => toggle(tag)}
                aria-label={`Remove ${tag}`}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold border bg-emerald-600 text-white border-emerald-600"
              >
                {tag} <X className="w-3 h-3" aria-hidden="true" />
              </button>
            ))}
        </div>
      )}

      <div className="mt-3">
        <label htmlFor={`${idPrefix}-custom-highlight`} className="block text-xs font-semibold text-gray-700 mb-1">
          Or write your own
        </label>
        <div className="flex gap-2">
          <input
            id={`${idPrefix}-custom-highlight`}
            type="text"
            maxLength={MAX_LISTING_TAG_LENGTH}
            placeholder="e.g., Grown From Seed"
            value={customTag}
            onChange={(e) => {
              setCustomTag(e.target.value);
              setCustomTagError(null);
            }}
            onKeyDown={(e) => {
              // Enter adds the highlight instead of submitting the form.
              if (e.key === 'Enter') {
                e.preventDefault();
                addCustom();
              }
            }}
            disabled={full}
            className="flex-1 min-w-0 px-4 py-2 border rounded-lg text-sm disabled:bg-gray-100"
          />
          <button
            type="button"
            onClick={addCustom}
            disabled={!customTag.trim() || full}
            className="shrink-0 px-4 py-2 rounded-lg text-xs font-bold bg-gray-900 text-white disabled:bg-gray-300"
          >
            Add
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-1">
          {customTag.length}/{MAX_LISTING_TAG_LENGTH} characters.
        </p>
        {customTagError && (
          <p role="alert" className="text-xs font-semibold text-red-700 mt-1">
            {customTagError}
          </p>
        )}
      </div>

      <p className="text-xs text-gray-400 mt-2">
        Pick or write up to {MAX_LISTING_TAGS}. All of them show on your listing&apos;s page, and the first{' '}
        {CARD_LISTING_TAGS} on its card in Browse. Only say what&apos;s true of it: for example, don&apos;t write
        &quot;Certified Organic&quot; unless you hold the certification.
      </p>
    </div>
  );
}
