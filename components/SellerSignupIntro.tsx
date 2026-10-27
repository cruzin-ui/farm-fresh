'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Banknote,
  Store,
  Package,
  CalendarDays,
  MapPin,
  Tag,
  Star,
  Sprout,
  ChevronDown,
  ArrowDown,
} from 'lucide-react';
import { SELLER_KEEPS_PERCENT } from '@/lib/pricing';

// Shown beside sign-in when someone arrives from "I want to sell": what
// selling here gets them, and an example farm page so they can picture what
// buyers will see. `compact` (after the first visit) shows one line that
// opens the rest.

const BENEFITS = [
  { icon: Tag, title: `Keep ${SELLER_KEEPS_PERCENT}%`, text: 'Free to list. No monthly or startup costs.' },
  { icon: Banknote, title: 'Paid before you pick', text: 'Every order is paid in full up front.' },
  { icon: Store, title: 'Your own farm page', text: 'Your story, photos and reviews, at your own web address.' },
  { icon: MapPin, title: 'Buyers find you', text: 'People nearby search by zip code.' },
  { icon: Package, title: 'Farm Boxes made easy', text: 'Weekly boxes, solo or with nearby farms.' },
  { icon: CalendarDays, title: 'Market pre-orders', text: 'Buyers order ahead and collect at your stand.' },
];

// The example farm's items, drawn with emoji so nothing looks like a real farm's photos.
const EXAMPLE_ITEMS = [
  { emoji: '🍅', name: 'Heirloom Tomatoes', detail: 'Cherokee Purple', price: '$4.00', unit: 'lb' },
  { emoji: '🥚', name: 'Farm Fresh Eggs', detail: 'Large brown', price: '$7.00', unit: 'dozen' },
  { emoji: '💐', name: 'Zinnia Bouquet', detail: 'Mixed colors', price: '$12.00', unit: 'bunch' },
];

function ExampleFarmPage() {
  return (
    <figure aria-label="An example farm page" className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="relative h-24 bg-[url('/hero-market.jpg')] bg-cover bg-center">
        <div className="absolute inset-0 bg-black/25" />
        <span className="absolute top-2 right-2 text-[10px] font-bold uppercase tracking-wide bg-white/90 text-gray-700 px-2 py-0.5 rounded-full">
          Example
        </span>
      </div>
      <div className="p-4 pt-0 space-y-3">
        <div className="flex items-start gap-3">
          <div className="-mt-7 shrink-0 w-14 h-14 rounded-xl bg-emerald-100 border-2 border-white shadow flex items-center justify-center text-2xl relative" aria-hidden="true">
            🌻
          </div>
          <div className="pt-1.5 min-w-0">
            <p className="font-extrabold text-gray-900 leading-tight truncate">Sunny Acres Farm</p>
            <p className="text-xs text-gray-500 flex items-center gap-1">
              <MapPin className="w-3 h-3" aria-hidden="true" /> Your town
              <span className="mx-1">·</span>
              <Star className="w-3 h-3 fill-amber-400 text-amber-400" aria-hidden="true" /> 4.9 (12 reviews)
            </p>
          </div>
        </div>
        <p className="text-xs text-gray-600 leading-relaxed">
          A family garden growing heirloom vegetables, flowers and eggs, picked fresh the morning you collect.
        </p>
        <div className="flex flex-wrap gap-1.5 text-[11px] font-semibold">
          <span className="bg-emerald-50 text-emerald-900 border border-emerald-200 rounded-full px-2 py-0.5">📍 Saturday market, 8 am – noon</span>
          <span className="bg-emerald-50 text-emerald-900 border border-emerald-200 rounded-full px-2 py-0.5">🌱 Growing: squash, expected mid-November</span>
        </div>
        <ul className="grid grid-cols-3 gap-2">
          {EXAMPLE_ITEMS.map((item) => (
            <li key={item.name} className="rounded-xl border border-gray-200 overflow-hidden">
              <div className="h-14 bg-emerald-50 flex items-center justify-center text-3xl" aria-hidden="true">
                {item.emoji}
              </div>
              <div className="p-1.5">
                <p className="text-[11px] font-bold text-gray-900 leading-tight">{item.name}</p>
                <p className="text-[10px] text-gray-500 truncate">{item.detail}</p>
                <p className="text-[11px] font-black text-gray-900 mt-0.5">
                  {item.price}
                  <span className="font-medium text-gray-500"> / {item.unit}</span>
                </p>
              </div>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50/60 p-2.5">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">Farm Box</p>
            <p className="text-xs font-bold text-gray-900">Weekly Veggie Box · every Thursday</p>
          </div>
          <p className="text-sm font-black text-gray-900 shrink-0">
            $28<span className="text-[10px] font-medium text-gray-500"> / box</span>
          </p>
        </div>
      </div>
      <figcaption className="px-4 py-2 bg-gray-50 border-t text-[11px] text-gray-500">
        An example of what buyers see. Your page shows your own farm, photos and listings.
      </figcaption>
    </figure>
  );
}

export default function SellerSignupIntro({ compact }: { compact: boolean }) {
  const [open, setOpen] = useState(!compact);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full max-w-sm mx-auto md:max-w-none flex items-center justify-between gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-left"
        aria-expanded={false}
      >
        <span className="flex items-center gap-2 text-sm font-bold text-emerald-950">
          <Sprout className="w-4 h-4 text-emerald-600" aria-hidden="true" /> Why sell on Farm Fresh Direct?
        </span>
        <ChevronDown className="w-4 h-4 text-emerald-700" aria-hidden="true" />
      </button>
    );
  }

  return (
    <section aria-labelledby="sell-intro-title" className="space-y-5">
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-emerald-700 flex items-center gap-1.5">
          <Sprout className="w-4 h-4" aria-hidden="true" /> For growers
        </p>
        <h2 id="sell-intro-title" className="mt-1 text-2xl sm:text-3xl font-extrabold text-gray-900 leading-tight">
          Your own online farm stand
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          Post what you grow, get paid before you pick, and let buyers nearby find you. Setting up takes a few minutes.
        </p>
        <p className="mt-2 text-sm font-semibold text-emerald-900">
          No subscriptions, no startup costs, and automatic record keeping: every sale is logged for you, with a yearly
          report to download at tax time.
        </p>
        <a href="#sign-up-form" className="md:hidden mt-3 inline-flex items-center gap-1 text-sm font-semibold text-emerald-800 underline">
          Skip to sign up <ArrowDown className="w-4 h-4" aria-hidden="true" />
        </a>
      </div>

      <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {BENEFITS.map(({ icon: Icon, title, text }) => (
          <li key={title} className="rounded-xl border border-gray-200 bg-white p-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <Icon className="w-5 h-5" aria-hidden="true" />
            </div>
            <p className="mt-2 text-sm font-bold text-gray-900 leading-tight">{title}</p>
            <p className="mt-0.5 text-xs text-gray-600 leading-snug">{text}</p>
          </li>
        ))}
      </ul>

      <div>
        <p className="text-sm font-bold text-gray-900 mb-2">What buyers will see</p>
        <ExampleFarmPage />
      </div>

      <p className="text-xs text-gray-500">
        More detail on fees and payouts:{' '}
        <Link href="/why/sellers" className="font-semibold text-emerald-800 underline">
          Why sell here
        </Link>
        .
      </p>
    </section>
  );
}
