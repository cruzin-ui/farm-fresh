'use client';

import { useState } from 'react';
import { LocateFixed, Loader2 } from 'lucide-react';
import { zipFromDeviceLocation, LOCATION_PROBLEM_TEXT } from '@/lib/geo';

// "Use my location": fills in the buyer's zip code from where their phone or
// computer is, so they don't have to type it. The phone asks permission first.
export default function UseMyLocation({
  onZip,
  className = '',
  label = 'Use my location',
  tone = 'light',
}: {
  onZip: (zip: string) => void;
  className?: string;
  label?: string;
  // 'dark' for use on the photo in the home page banner.
  tone?: 'light' | 'dark';
}) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');

  const locate = async () => {
    setBusy(true);
    setProblem('');
    const result = await zipFromDeviceLocation();
    setBusy(false);
    if ('zip' in result) onZip(result.zip);
    else setProblem(LOCATION_PROBLEM_TEXT[result.problem]);
  };

  return (
    <span className={`inline-flex flex-col ${className}`}>
      <button
        type="button"
        onClick={locate}
        disabled={busy}
        className={`inline-flex items-center gap-1.5 text-sm font-semibold underline-offset-2 hover:underline disabled:opacity-60 ${
          tone === 'dark' ? 'text-white' : 'text-emerald-700'
        }`}
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <LocateFixed className="w-4 h-4" aria-hidden="true" />}
        {busy ? 'Finding you…' : label}
      </button>
      {problem && (
        <span role="alert" className={`text-xs mt-1 ${tone === 'dark' ? 'text-white/90' : 'text-red-700'}`}>
          {problem}
        </span>
      )}
    </span>
  );
}
