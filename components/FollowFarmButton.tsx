'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Heart } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { postWithAuth } from '@/lib/authedFetch';

// "Follow this farm": adds it to the shopper's Followed Farms page, where they
// can see what it has for sale. Following needs an account, so someone who
// isn't signed in is sent to sign in and brought back.
export default function FollowFarmButton({ farmerId, farmName }: { farmerId: string; farmName: string }) {
  const pathname = usePathname();
  const [checked, setChecked] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [following, setFollowing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [justFollowed, setJustFollowed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const call = async (action: 'status' | 'follow' | 'unfollow') => {
    const res = await postWithAuth('/api/follows', { farmerId, action });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not update that.');
    return Boolean(data.following);
  };

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (cancelled) return;
      if (session) {
        setSignedIn(true);
        try {
          const isFollowing = await call('status');
          if (!cancelled) setFollowing(isFollowing);
        } catch {}
      }
      if (!cancelled) setChecked(true);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [farmerId]);

  const toggle = async () => {
    setBusy(true);
    setError(null);
    try {
      const isFollowing = await call(following ? 'unfollow' : 'follow');
      setFollowing(isFollowing);
      setJustFollowed(isFollowing);
    } catch (err: any) {
      setError(err.message || 'Could not update that.');
    } finally {
      setBusy(false);
    }
  };

  const buttonClass =
    'inline-flex items-center justify-center gap-1.5 text-xs font-bold px-3.5 py-2 rounded-xl border transition-colors';

  // Hold the space until we know who is looking, so the button doesn't flip.
  if (!checked) return <div className="h-9" aria-hidden="true" />;

  if (!signedIn) {
    return (
      <Link
        href={`/login?redirect=${encodeURIComponent(pathname || '/browse')}`}
        className={`${buttonClass} bg-white border-gray-300 text-gray-700 hover:bg-gray-50 print:hidden`}
      >
        <Heart className="w-4 h-4" aria-hidden="true" /> Sign In to Follow This Farm
      </Link>
    );
  }

  return (
    <div className="space-y-1.5 print:hidden">
      <button
        type="button"
        disabled={busy}
        aria-pressed={following}
        onClick={toggle}
        className={`${buttonClass} ${
          following
            ? 'bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100'
            : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
        }`}
      >
        <Heart className={`w-4 h-4 ${following ? 'fill-emerald-600 text-emerald-600' : ''}`} aria-hidden="true" />
        {following ? 'Following' : 'Follow This Farm'}
      </button>

      {justFollowed && (
        <p role="status" className="text-xs text-emerald-800">
          Added {farmName} to your{' '}
          <Link href="/following" className="font-semibold underline">
            Followed Farms
          </Link>
          .
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs font-semibold text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
