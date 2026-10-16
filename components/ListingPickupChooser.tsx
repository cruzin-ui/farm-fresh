'use client';

import React, { useState } from 'react';
import { MapPin } from 'lucide-react';
import AddressAutocomplete from '@/components/AddressAutocomplete';

export type PickupChoice = { address: string; zip: string; city: string };

// Where a listing is picked up: the farm's address from the Farm Profile, or,
// at the seller's choice, an address just for this listing (a market stall,
// a second plot). `value` is that listing's own address, or null for the
// farm's.
export default function ListingPickupChooser({
  farmPickup,
  value,
  onChange,
  onGoToProfile,
  idPrefix,
}: {
  farmPickup: PickupChoice | null;
  value: PickupChoice | null;
  onChange: (value: PickupChoice | null) => void;
  onGoToProfile: () => void;
  idPrefix: string;
}) {
  // An address picked from the suggestions is known to be real.
  const [verified, setVerified] = useState(Boolean(value?.address));

  if (!value) {
    return (
      <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 space-y-2">
        <p className="flex items-start gap-2">
          <MapPin className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            <span className="font-semibold text-gray-900">Pickup:</span> your farm&apos;s address
            {farmPickup ? ` in ${farmPickup.city || 'your area'} (${farmPickup.zip})` : ''}. Buyers see the city and zip;
            they get the full address when the order is ready.
          </span>
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 pl-6">
          <button
            type="button"
            onClick={() => {
              setVerified(false);
              onChange({ address: '', zip: '', city: '' });
            }}
            className="text-xs font-semibold text-emerald-800 underline"
          >
            Use a different address for this listing
          </button>
          <button type="button" onClick={onGoToProfile} className="text-xs font-semibold text-gray-600 underline">
            Change my farm&apos;s address
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 bg-emerald-50/50 border border-emerald-200 rounded-xl space-y-3">
      <div>
        <p className="text-sm font-bold text-gray-900">Pickup address for this listing</p>
        <p className="text-xs text-gray-600 mt-0.5">
          Only this listing is picked up here; your other listings keep your farm&apos;s address. Buyers see the city and
          zip, and get the full address when their order is ready.
        </p>
      </div>
      <AddressAutocomplete
        id={`${idPrefix}-own-pickup-address`}
        placeholder="Start typing, then pick the address from the list"
        value={value.address}
        verified={verified}
        onChange={(text) => {
          setVerified(false);
          onChange({ ...value, address: text });
        }}
        onSelect={(suggestion) => {
          setVerified(true);
          onChange({
            address: suggestion.address,
            zip: suggestion.zip ? suggestion.zip.slice(0, 5) : value.zip,
            city: suggestion.city ? [suggestion.city, suggestion.state].filter(Boolean).join(', ') : value.city,
          });
        }}
      />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={`${idPrefix}-own-pickup-zip`} className="block text-xs font-semibold text-gray-700 mb-1">
            Zip code
          </label>
          <input
            id={`${idPrefix}-own-pickup-zip`}
            inputMode="numeric"
            placeholder="e.g., 85041"
            value={value.zip}
            onChange={(e) => onChange({ ...value, zip: e.target.value.replace(/\D/g, '').slice(0, 5) })}
            className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
          />
        </div>
        <div>
          <label htmlFor={`${idPrefix}-own-pickup-city`} className="block text-xs font-semibold text-gray-700 mb-1">
            City / area
          </label>
          <input
            id={`${idPrefix}-own-pickup-city`}
            placeholder="e.g., Phoenix, AZ"
            value={value.city}
            onChange={(e) => onChange({ ...value, city: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
          />
        </div>
      </div>
      <button type="button" onClick={() => onChange(null)} className="text-xs font-semibold text-gray-700 underline">
        Use my farm&apos;s address instead
      </button>
    </div>
  );
}

// Why a listing's own pickup address can't be used yet, or null when it can.
export function pickupProblem(value: PickupChoice | null) {
  if (!value) return null;
  if (!value.address.trim()) return 'Enter the pickup address for this listing, or use your farm’s address.';
  if (!/^\d{5}$/.test(value.zip)) return 'Enter the 5-digit zip code for this listing’s pickup address.';
  if (!value.city.trim()) return 'Enter the city for this listing’s pickup address.';
  return null;
}
