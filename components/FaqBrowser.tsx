'use client';

import React, { useState } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';

export type FaqItem = { question: string; answer: React.ReactNode; text: string };
export type FaqSection = { id: string; title: string; faqs: FaqItem[] };

// The FAQ with a search box, and a heading per section that folds the whole
// section away. While searching, only matching questions show, already open.
export default function FaqBrowser({ sections }: { sections: FaqSection[] }) {
  const [query, setQuery] = useState('');
  const [closed, setClosed] = useState<Record<string, boolean>>({});

  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const searching = words.length > 0;
  const matches = (faq: FaqItem) => {
    const haystack = `${faq.question} ${faq.text}`.toLowerCase();
    return words.every((word) => haystack.includes(word));
  };
  const shown = sections.map((section) => ({ ...section, faqs: searching ? section.faqs.filter(matches) : section.faqs }));
  const resultCount = shown.reduce((sum, s) => sum + s.faqs.length, 0);

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
            {resultCount === 0
              ? 'No questions match. Try fewer or different words, or contact us.'
              : `${resultCount} question${resultCount === 1 ? '' : 's'} found`}
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
