'use client';

import { useEffect, useRef, useState } from 'react';
import { MapPin, CheckCircle2 } from 'lucide-react';

export type AddressSuggestion = {
  address: string;
  city: string;
  state: string;
  zip: string;
};

// Looks up US street addresses as the user types, using Photon — a free,
// keyless search over OpenStreetMap data. Its coverage of rural addresses is
// patchy, so this only *suggests*: the user can always keep what they typed.
async function searchAddresses(query: string, signal: AbortSignal): Promise<AddressSuggestion[]> {
  const res = await fetch(
    `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=10&lang=en&layer=house&layer=street`,
    { signal }
  );
  if (!res.ok) throw new Error(`Address lookup failed (${res.status})`);

  const data = await res.json();
  const seen = new Set<string>();
  const suggestions: AddressSuggestion[] = [];

  for (const feature of data.features || []) {
    const p = feature.properties || {};
    if (p.countrycode !== 'US') continue;

    const street = [p.housenumber, p.street || p.name].filter(Boolean).join(' ');
    const city = p.city || p.town || p.village || p.county || '';
    if (!street || !city) continue;

    const address = `${street}, ${city}, ${[p.state, p.postcode].filter(Boolean).join(' ')}`.trim();
    if (seen.has(address)) continue;
    seen.add(address);

    suggestions.push({ address, city, state: p.state || '', zip: p.postcode || '' });
    if (suggestions.length === 5) break;
  }

  return suggestions;
}

export default function AddressAutocomplete({
  value,
  verified,
  onChange,
  onSelect,
  required,
  placeholder,
}: {
  value: string;
  // True when the current value was picked from the suggestions.
  verified: boolean;
  onChange: (text: string) => void;
  onSelect: (suggestion: AddressSuggestion) => void;
  required?: boolean;
  placeholder?: string;
}) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [lookupFailed, setLookupFailed] = useState(false);
  const [searched, setSearched] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Search a moment after the user stops typing, cancelling stale requests.
  useEffect(() => {
    const query = value.trim();

    if (verified || query.length < 5) {
      setSuggestions([]);
      setSearched(false);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        setSuggestions(await searchAddresses(query, controller.signal));
        setLookupFailed(false);
        setSearched(true);
        setOpen(true);
      } catch (err: any) {
        if (err?.name !== 'AbortError') setLookupFailed(true);
      } finally {
        setSearching(false);
      }
    }, 350);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value, verified]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        required={required}
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        className="w-full px-4 py-2 border rounded-lg text-sm"
      />

      {open && suggestions.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          {suggestions.map((suggestion) => (
            <li key={suggestion.address}>
              <button
                type="button"
                onClick={() => {
                  onSelect(suggestion);
                  setOpen(false);
                }}
                className="w-full flex items-start gap-2 px-3 py-3 text-left text-sm text-gray-700 hover:bg-emerald-50"
              >
                <MapPin className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                {suggestion.address}
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="text-[10px] mt-1 text-gray-400">
        {verified ? (
          <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
            <CheckCircle2 className="w-3 h-3" /> Matched to a known address
          </span>
        ) : searching ? (
          'Looking up addresses...'
        ) : lookupFailed ? (
          "Address lookup isn't available right now — your address will be saved as typed."
        ) : searched && suggestions.length === 0 ? (
          "We couldn't find that address. Check the spelling, or keep it as typed if it's correct — some rural addresses aren't in the lookup."
        ) : (
          'Start typing and pick your address from the list.'
        )}
      </p>
    </div>
  );
}
