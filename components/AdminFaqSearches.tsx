'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { postWithAuth } from '@/lib/authedFetch';

type MissedSearch = {
  query: string;
  searches: number;
  closest: number;
  first_searched_at: string;
  last_searched_at: string;
};

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Phoenix' });

// In Insights on the admin page: what people searched the FAQ for and didn't
// find, so the missing answers can be added. Dismiss one once it's dealt with.
export default function AdminFaqSearches() {
  const [searches, setSearches] = useState<MissedSearch[] | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    postWithAuth('/api/admin/faq-searches')
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Could not load FAQ searches.');
        setSearches(json.searches);
      })
      .catch((err) => setError(err.message));
  }, []);

  const dismiss = async (query: string) => {
    const res = await postWithAuth('/api/admin/faq-searches', { action: 'dismiss', query });
    if (res.ok) setSearches((current) => current?.filter((s) => s.query !== query));
    else setError('Could not dismiss that search. Please try again.');
  };

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5">
      <h3 className="text-sm font-bold text-gray-900">What people searched the FAQ for and didn&apos;t find</h3>
      <p className="text-xs text-gray-500 mt-0.5">
        Searches where no question matched every word, most searched first. &quot;Near matches&quot; means the search
        showed a few close questions instead; &quot;none&quot; means it found nothing at all. Add an answer to the{' '}
        <Link href="/faq" className="underline">
          FAQ
        </Link>
        , then dismiss the search. Only the words are kept, not who searched.
      </p>
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      {searches === undefined && !error ? (
        <p className="mt-3 text-sm text-gray-500">Loading…</p>
      ) : searches === null ? (
        <p className="mt-3 text-sm text-amber-800">Not set up yet: run db/faq_searches.sql in Supabase to start recording.</p>
      ) : searches && searches.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500">Nothing yet. Every FAQ search so far has found an answer.</p>
      ) : searches ? (
        <div className="overflow-x-auto mt-3">
          <table className="w-full text-xs text-gray-700">
            <thead className="text-gray-500 border-b">
              <tr>
                <th scope="col" className="py-2 pr-4 text-left font-semibold">Searched for</th>
                <th scope="col" className="py-2 pr-4 text-right font-semibold">Times</th>
                <th scope="col" className="py-2 pr-4 text-left font-semibold">Showed</th>
                <th scope="col" className="py-2 pr-4 text-left font-semibold">Last searched</th>
                <th scope="col" className="py-2 text-right font-semibold">
                  <span className="sr-only">Dismiss</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {searches.map((s) => (
                <tr key={s.query} className="border-b border-gray-100 last:border-0">
                  <th scope="row" className="py-2 pr-4 text-left font-semibold text-gray-900 break-words">{s.query}</th>
                  <td className="py-2 pr-4 text-right tabular-nums">{s.searches}</td>
                  <td className="py-2 pr-4">{s.closest > 0 ? 'Near matches' : <span className="text-amber-800">None</span>}</td>
                  <td className="py-2 pr-4 whitespace-nowrap">{shortDate(s.last_searched_at)}</td>
                  <td className="py-2 text-right">
                    <button
                      type="button"
                      onClick={() => dismiss(s.query)}
                      className="text-xs font-semibold text-emerald-800 hover:underline"
                    >
                      Dismiss
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
