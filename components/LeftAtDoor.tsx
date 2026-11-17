'use client';

import { useRef, useState } from 'react';
import { Camera } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { resizeImage } from '@/lib/resizeImage';
import { DELIVERY_RELEASE_HOURS } from '@/lib/delivery';

// "Left at the door" on a delivery order: the seller takes a photo of the
// order where they left it. The buyer is sent the photo and has
// DELIVERY_RELEASE_HOURS to report a problem; then the seller is paid.
export default function LeftAtDoor({ orderId, onDone }: { orderId: string; onDone: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const photo = await resizeImage(file, 1600, 0.8).catch(() => file);
      const { data } = await supabase.auth.getSession();
      const form = new FormData();
      form.append('orderId', orderId);
      form.append('photo', photo);
      const res = await fetch('/api/orders/delivered', {
        method: 'POST',
        headers: { Authorization: `Bearer ${data.session?.access_token || ''}` },
        body: form,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not save that.');
      setConfirming(false);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="inline-flex items-center justify-center gap-1.5 bg-white border border-blue-300 text-blue-800 hover:bg-blue-50 text-sm font-bold px-4 py-3 rounded-xl transition-colors"
      >
        <Camera className="w-4 h-4" aria-hidden="true" /> Buyer Not Home: Left at the Door
      </button>
    );
  }

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 space-y-2 text-xs text-blue-950 w-full">
      <p className="text-sm font-bold">Leave it, then take a photo</p>
      <p>
        Take a photo that shows the order where you left it, with the door or house number in view if you can. Leave eggs
        and anything perishable only in a cooler. The buyer gets the photo, and you&apos;re paid {DELIVERY_RELEASE_HOURS} hours
        later unless they report a problem.
      </p>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) send(file);
          e.target.value = '';
        }}
      />
      <div className="flex gap-2 flex-wrap">
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-bold px-3.5 py-2 rounded-xl"
        >
          <Camera className="w-4 h-4" aria-hidden="true" /> {busy ? 'Sending…' : 'Take Photo & Mark Delivered'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setConfirming(false)}
          className="bg-white border text-gray-700 font-bold px-3.5 py-2 rounded-xl hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
      {error && (
        <p role="alert" className="font-semibold text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
