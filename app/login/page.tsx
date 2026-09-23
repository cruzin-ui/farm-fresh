'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter, useSearchParams } from 'next/navigation';
import { Sprout, Lock, Mail, AlertCircle, ArrowRight } from 'lucide-react';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // Get redirect target from URL query string (defaults to /dashboard)
  const redirectTo = searchParams.get('redirectTo') || '/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    // Check if user is already logged in
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        router.push(redirectTo);
      }
    };
    checkSession();
  }, [redirectTo, router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setErrorMsg(error.message);
      setLoading(false);
    } else {
      router.push(redirectTo);
      router.refresh();
    }
  };

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    setErrorMsg(null);

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://farm-fresh-silk.vercel.app';

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${siteUrl}/auth/callback?next=${redirectTo}`,
      },
    });

    if (error) {
      setErrorMsg(error.message);
      setGoogleLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto my-12 p-8 bg-white border border-gray-200 rounded-2xl shadow-sm">
      <div className="text-center mb-6">
        <div className="inline-flex p-3 bg-emerald-100 text-emerald-800 rounded-2xl mb-3">
          <Sprout className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-black text-gray-900">Sign In to Farm Fresh</h1>
        <p className="text-xs text-gray-500 mt-1">Access your seller dashboard and manage harvests.</p>
      </div>

      {errorMsg && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* GOOGLE OAUTH BUTTON */}
      <button
        type="button"
        onClick={handleGoogleLogin}
        disabled={googleLoading}
        className="w-full mb-4 flex items-center justify-center gap-3 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold py-2.5 px-4 rounded-xl text-sm transition-colors shadow-sm disabled:opacity-50"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
          />
        </svg>
        {googleLoading ? 'Redirecting to Google...' : 'Continue with Google'}
      </button>

      <div className="relative my-4">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-200"></div>
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-white px-2 text-gray-400 font-medium">Or email</span>
        </div>
      </div>

      {/* EMAIL & PASSWORD FORM */}
      <form onSubmit={handleLogin} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Email Address</label>
          <div className="relative">
            <Mail className="w-4 h-4 text-gray-400 absolute left-3.5 top-3" />
            <input
              type="email"
              required
              placeholder="farmer@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Password</label>
          <div className="relative">
            <Lock className="w-4 h-4 text-gray-400 absolute left-3.5 top-3" />
            <input
              type="password"
              required
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-4 rounded-xl text-sm transition-colors shadow-sm disabled:bg-gray-400"
        >
          {loading ? 'Signing In...' : 'Sign In to Dashboard'} <ArrowRight className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="text-center py-12 text-xs text-gray-400">Loading auth...</div>}>
      <LoginForm />
    </Suspense>
  );
}