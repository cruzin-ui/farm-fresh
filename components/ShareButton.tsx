'use client';

import { useState } from 'react';
import { Share2 } from 'lucide-react';
import { shareLink } from '@/lib/share';

// Share a farm or a listing: the share sheet on phones, a copied link elsewhere.
export default function ShareButton({
  title,
  text,
  url = '',
  label = 'Share',
  className = '',
}: {
  title: string;
  text?: string;
  // Leave empty to share the page being viewed.
  url?: string;
  label?: string;
  className?: string;
}) {
  const [note, setNote] = useState('');

  const share = async () => {
    const result = await shareLink({ title, text, url: url || window.location.pathname });
    if (result === 'copied') setNote('Link copied');
    else if (result === 'failed') setNote("Couldn't share");
    else return;
    setTimeout(() => setNote(''), 2500);
  };

  return (
    <button
      type="button"
      onClick={share}
      className={
        className ||
        'inline-flex items-center gap-1.5 text-sm font-semibold text-gray-700 border border-gray-300 bg-white rounded-lg px-3 py-1.5 hover:bg-gray-50'
      }
    >
      <Share2 className="w-4 h-4" aria-hidden="true" />
      <span aria-live="polite">{note || label}</span>
    </button>
  );
}
