'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, Search, X } from 'lucide-react';
import { indexEntry, parseSearch, scoreEntry, searchToRecord } from '@/lib/faqSearch';

export type FaqItem = { question: string; answer: React.ReactNode; text: string };
export type FaqSection = { id: string; title: string; faqs: FaqItem[] };

// When nothing matches every word of a search, how many of the nearest
// questions to show instead.
const CLOSEST_COUNT = 3;

// How long a search has to sit unchanged before one that found nothing is
// recorded, so half-typed words aren't.
const RECORD_AFTER_MS = 2000;

// The FAQ with a search box, and a heading per section that folds the whole
// section away. While searching, only matching questions show, already open,
// best match first (see lib/faqSearch). If nothing matches every word, the
// closest few show instead, and the search is recorded for the admin page so
// the missing answer can be added.
export default function FaqBrowser({ sections }: { sections: FaqSection[] }) {
  const [query, setQuery] = useState('');
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const recorded = useRef(new Set<string>());

  const indexes = useMemo(
    () => new Map(sections.flatMap((s) => s.faqs.map((faq) => [faq, indexEntry(faq.question, faq.text)] as const))),
    [sections]
  );

  const terms = parseSearch(query);
  const searching = terms.length > 0;
  const scored = sections.flatMap((section) =>
    section.faqs.map((faq, order) => ({ section: section.id, faq, order, ...scoreEntry(indexes.get(faq)!, terms) }))
  );
  const exact = scored.filter((s) => s.matchesAll);
  const closest =
    searching && exact.length === 0
      ? scored
          .filter((s) => s.found >= Math.max(1, Math.ceil(terms.length / 2)))
          .sort((a, b) => b.found - a.found || b.score - a.score)
          .slice(0, CLOSEST_COUNT)
      : [];
  const results = exact.length ? exact : closest;
  const shown = sections.map((section) => ({
    ...section,
    faqs: searching
      ? results
          .filter((r) => r.section === section.id)
          .sort((a, b) => b.score - a.score || a.order - b.order)
          .map((r) => r.faq)
      : section.faqs,
  }));
  const resultCount = results.length;

  // A search that settles with nothing matching every word is sent to be
  // recorded, once per page visit.
  const missed = searching && exact.length === 0 ? searchToRecord(query) : null;
  const closestCount = closest.length;
  useEffect(() => {
    if (!missed || recorded.current.has(missed)) return;
    const timer = setTimeout(() => {
      recorded.current.add(missed);
      fetch('/api/faq/missed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: missed, closest: closestCount }),
        keepalive: true,
      }).catch(() => {});
    }, RECORD_AFTER_MS);
    return () => clearTimeout(timer);
  }, [missed, closestCount]);

  return (
    <div className="space-y-8">
      <div>
        <label htmlFor="faq-search" className="sr-only">
          Search the FAQ
        </label>
        <div className="relative">
          <Search className="w-5 h-5 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
          <input
            id="faq-search"
            type="search"
            placeholder="Search questions…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-11 pr-10 py-3 rounded-xl border border-gray-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        {searching && (
          <p role="status" className="mt-2 text-xs text-gray-600">
            {exact.length > 0 ? (
              `${resultCount} question${resultCount === 1 ? '' : 's'} found`
            ) : (
              <>
                {closestCount > 0
                  ? 'No question matches all of those words. These come closest. Still stuck? '
                  : 'No questions match. Try different words, or '}
                <Link href="/contact" className="font-semibold text-emerald-800 underline">
                  {closestCount > 0 ? 'Contact us' : 'contact us'}
                </Link>
                .
              </>
            )}
          </p>
        )}
      </div>

      {shown.map((section) => {
        if (searching && section.faqs.length === 0) return null;
        const open = searching || !closed[section.id];
        return (
          <section key={section.id} id={section.id} aria-labelledby={`${section.id}-title`}>
            <h2 id={`${section.id}-title`}>
              <button
                type="button"
                onClick={() => setClosed((current) => ({ ...current, [section.id]: !current[section.id] }))}
                aria-expanded={open}
                aria-controls={`${section.id}-list`}
                disabled={searching}
                className="w-full flex items-center justify-between gap-2 text-left text-xl font-bold text-gray-900 mb-3 disabled:cursor-default"
              >
                <span>
                  {section.title}
                  <span className="ml-2 text-sm font-normal text-gray-500">({section.faqs.length})</span>
                </span>
                {!searching && (
                  <ChevronDown className={`w-5 h-5 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
                )}
              </button>
            </h2>
            {open && (
              <div id={`${section.id}-list`} className="space-y-2">
                {section.faqs.map((faq) => (
                  <details
                    // A new key while searching opens the matches.
                    key={`${faq.question}-${searching ? 'open' : 'closed'}`}
                    open={searching}
                    className="bg-white border border-gray-200 rounded-xl shadow-sm"
                  >
                    <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-gray-900">
                      {faq.question}
                    </summary>
                    <div className="px-4 pb-4 text-sm text-gray-700 leading-relaxed">{faq.answer}</div>
                  </details>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
