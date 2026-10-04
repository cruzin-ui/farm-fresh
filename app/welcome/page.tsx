'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, ShoppingBag, Receipt, Sprout, ArrowRight } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { safeNextPath } from '@/lib/safeRedirect';

// Where a new member lands after clicking the confirmation link in their
// sign-up email: a confirmation that it worked, and the three things they
// might want to do next. If they signed up on the way to somewhere specific
// (such as a checkout), `next` carries that so they can pick up where they
// left off.
function WelcomeContent() {
  const searchParams = useSearchParams();
  const nextParam = searchParams.get('next');
  const continueTo = nextParam ? safeNextPath(nextParam, '') : '';

  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setEmail(session?.user.email ?? null);
      setChecking(false);
    });
  }, []);

  if (checking) {
    return <div className="max-w-xl mx-auto my-20 text-center text-sm text-gray-500">Loading...</div>;
  }

  if (!email) {
    return (
      <div className="max-w-md mx-auto my-12 p-6 bg-white border rounded-2xl text-center text-sm text-gray-600 shadow-sm space-y-3">
        <p>Please sign in to continue.</p>
        <Link
          href="/login"
          className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 px-5 rounded-xl text-sm"
        >
          Sign In
        </Link>
      </div>
    );
  }

  const options = [
    {
      href: '/browse',
      icon: ShoppingBag,
      title: 'Browse for produce',
      detail: 'See what local gardens and farms have fresh right now.',
    },
    {
      href: '/orders',
      icon: Receipt,
      title: 'Check my orders',
      detail: 'Your reservations, pickup details and pickup codes.',
    },
    {
      href: '/dashboard',
      icon: Sprout,
      title: 'Want to start selling?',
      detail: 'Set up your farm profile and post your first harvest.',
    },
  ];

  return (
    <div className="max-w-xl mx-auto px-4 py-10 space-y-6">
      <div role="status" className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-center space-y-2">
        <CheckCircle2 className="w-12 h-12 text-emerald-700 mx-auto" aria-hidden="true" />
        <h1 className="text-2xl font-extrabold text-emerald-950">Congrats — your email is confirmed!</h1>
        <p className="text-sm text-emerald-900">
          Welcome to Farm Fresh Direct. You're signed in as <span className="font-semibold">{email}</span>.
        </p>
      </div>

      {continueTo && (
        <Link
          href={continueTo}
          className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-6 rounded-xl shadow-md transition-colors"
        >
          Continue where you left off <ArrowRight className="w-4 h-4" aria-hidden="true" />
        </Link>
      )}

      <div>
        <h2 className="text-lg font-bold text-gray-900 mb-3">What would you like to do?</h2>
        <div className="space-y-3">
          {options.map(({ href, icon: Icon, title, detail }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-4 bg-white px-5 py-4 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md hover:border-emerald-400 transition-all"
            >
              <div className="w-12 h-12 shrink-0 bg-emerald-100 text-emerald-700 rounded-xl flex items-center justify-center">
                <Icon className="w-6 h-6" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-base font-bold text-gray-900">{title}</p>
                <p className="text-sm text-gray-500">{detail}</p>
              </div>
              <ArrowRight className="w-4 h-4 text-gray-400 shrink-0" aria-hidden="true" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function WelcomePage() {
  return (
    <Suspense fallback={<div className="max-w-xl mx-auto my-20 text-center text-sm text-gray-500">Loading...</div>}>
      <WelcomeContent />
    </Suspense>
  );
}
