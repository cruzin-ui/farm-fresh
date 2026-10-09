'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

// Where someone lands straight after signing in when they weren't heading
// anywhere in particular. It only decides where to send them: a seller whose
// payout setup is finished goes to their Seller Dashboard, and everyone else
// goes to Browse. (Someone who signed in on the way to a specific page, such
// as checkout, is sent there instead and never comes through here.)
export default function SignedInPage() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    async function route() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        if (!cancelled) router.replace('/login');
        return;
      }

      const { data: profile } = await supabase
        .from('seller_profiles')
        .select('stripe_onboarding_complete')
        .eq('id', session.user.id)
        .maybeSingle();

      if (!cancelled) router.replace(profile?.stripe_onboarding_complete ? '/dashboard' : '/browse');
    }

    route();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div role="status" className="min-h-[50vh] flex flex-col items-center justify-center space-y-3">
      <div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
      <p className="text-sm font-medium text-gray-600">Signing you in...</p>
    </div>
  );
}
