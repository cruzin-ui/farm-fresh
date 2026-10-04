'use client';

import { useEffect, useId, useRef, useState } from 'react';
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

// An address field with suggestions, built as an ARIA combobox: the
// suggestions can be moved through with the arrow keys, chosen with Enter and
// dismissed with Escape, and screen readers are told how many there are.
export default function AddressAutocomplete({
  id,
  value,
  verified,
  onChange,
  onSelect,
  required,
  placeholder,
}: {
  id?: string;
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
  const [activeIndex, setActiveIndex] = useState(-1);
  const [searching, setSearching] = useState(false);
  const [lookupFailed, setLookupFailed] = useState(false);
  const [searched, setSearched] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const baseId = useId();
  const listId = `${baseId}-list`;
  const hintId = `${baseId}-hint`;
  const optionId = (index: number) => `${baseId}-option-${index}`;

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
        setActiveIndex(-1);
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

  const showList = open && suggestions.length > 0;

  const choose = (suggestion: AddressSuggestion) => {
    onSelect(suggestion);
    setOpen(false);
    setActiveIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && suggestions.length > 0) {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((current) => (current + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp' && suggestions.length > 0) {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((current) => (current <= 0 ? suggestions.length - 1 : current - 1));
    } else if (e.key === 'Enter' && showList && activeIndex >= 0) {
      // Pick the highlighted suggestion instead of submitting the form.
      e.preventDefault();
      choose(suggestions[activeIndex]);
    } else if (e.key === 'Escape' && showList) {
      e.preventDefault();
      setOpen(false);
      setActiveIndex(-1);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <input
        id={id}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={showList && activeIndex >= 0 ? optionId(activeIndex) : undefined}
        aria-describedby={hintId}
        required={required}
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        onKeyDown={handleKeyDown}
        className="w-full px-4 py-2 border rounded-lg text-sm"
      />

      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Address suggestions"
          className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden"
        >
          {suggestions.map((suggestion, index) => (
            <li
              key={suggestion.address}
              id={optionId(index)}
              role="option"
              aria-selected={index === activeIndex}
              // mousedown, not click, so the choice registers before the input loses focus
              onMouseDown={(e) => {
                e.preventDefault();
                choose(suggestion);
              }}
              onMouseEnter={() => setActiveIndex(index)}
              className={`flex items-start gap-2 px-3 py-3 text-sm text-gray-700 cursor-pointer ${
                index === activeIndex ? 'bg-emerald-50' : ''
              }`}
            >
              <MapPin className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" aria-hidden="true" />
              {suggestion.address}
            </li>
          ))}
        </ul>
      )}

      {/* Announced to screen readers as it changes. */}
      <p id={hintId} role="status" className="text-[10px] mt-1 text-gray-500">
        {verified ? (
          <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
            <CheckCircle2 className="w-3 h-3" aria-hidden="true" /> Matched to a known address
          </span>
        ) : searching ? (
          'Looking up addresses...'
        ) : lookupFailed ? (
          "Address lookup isn't available right now — your address will be saved as typed."
        ) : showList ? (
          `${suggestions.length} suggestion${suggestions.length === 1 ? '' : 's'} — use the arrow keys and Enter to choose one.`
        ) : searched && suggestions.length === 0 ? (
          "We couldn't find that address. Check the spelling, or keep it as typed if it's correct — some rural addresses aren't in the lookup."
        ) : (
          'Start typing and pick your address from the list.'
        )}
      </p>
    </div>
  );
}
