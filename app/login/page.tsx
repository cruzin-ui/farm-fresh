'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Sprout, Mail, Lock, ArrowRight, AlertCircle, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { safeNextPath, AFTER_LOGIN_KEY, AFTER_SIGN_IN_PATH } from '@/lib/safeRedirect';

type Mode = 'signin' | 'signup' | 'forgot';

const MIN_PASSWORD_LENGTH = 8;

const LINK_ERRORS: Record<string, string> = {
  'auth-failed': "We couldn't sign you in with that link. Please try again.",
  'link-expired': 'That link has expired or was already used. Please request a new one.',
};

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // With nowhere particular to go, sellers whose payouts are set up land on
  // their dashboard and everyone else on Browse; the /signed-in page decides.
  const redirectTarget = safeNextPath(searchParams.get('redirect') || searchParams.get('next'), AFTER_SIGN_IN_PATH);

  const initialMode = searchParams.get('mode');
  const [mode, setMode] = useState<Mode>(
    initialMode === 'signup' || initialMode === 'forgot' ? initialMode : 'signin'
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(LINK_ERRORS[searchParams.get('error') || ''] || null);
  // Shown after a sign-up or reset request, in place of the form.
  const [notice, setNotice] = useState<string | null>(null);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setNotice(null);
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === 'forgot') {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset-password`,
        });
        if (resetError) throw resetError;

        // The same message whether or not the address has an account, so this
        // form can't be used to find out who is registered.
        setNotice(`If there's an account for ${email}, we've emailed a link to reset the password. It can take a minute to arrive.`);
        return;
      }

      if (mode === 'signup') {
        if (password.length < MIN_PASSWORD_LENGTH) {
          throw new Error(`Use a password of at least ${MIN_PASSWORD_LENGTH} characters.`);
        }

        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirectTarget)}`,
          },
        });
        if (signUpError) throw signUpError;

        // With email confirmation switched off in Supabase there is a session
        // straight away; otherwise they need to click the link we sent.
        if (data.session) {
          router.push(redirectTarget);
          return;
        }

        setNotice(`Almost there — we've emailed a confirmation link to ${email}. Click it to finish creating your account. If you already have an account, sign in instead.`);
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) throw signInError;

      router.push(redirectTarget);
    } catch (err: any) {
      setError(
        err.message === 'Email not confirmed'
          ? 'Please confirm your email first, using the link we sent when you signed up.'
          : err.message || 'Something went wrong. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError(null);
    setGoogleLoading(true);

    try {
      const callbackUrl = `${window.location.origin}/auth/callback?next=${encodeURIComponent(
        redirectTarget
      )}`;

      // Remembered in case Google sign-in comes back to the home page instead
      // of our callback address (which happens when that address isn't on
      // Supabase's allowed list); the account menu then finishes the trip.
      try {
        window.sessionStorage.setItem(AFTER_LOGIN_KEY, redirectTarget);
      } catch {}

      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: callbackUrl,
        },
      });

      if (oauthError) throw oauthError;
      // Browser will redirect to Google, then back to /auth/callback?next=...
    } catch (err: any) {
      setError(err.message || 'Failed to sign in with Google.');
      setGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 bg-emerald-600 rounded-2xl flex items-center justify-center mb-3">
            <Sprout className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">
            {mode === 'signup' ? 'Create your account' : mode === 'forgot' ? 'Reset your password' : 'Welcome back'}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {mode === 'signup'
              ? 'Join Farm Fresh Direct to buy or sell'
              : mode === 'forgot'
                ? "We'll email you a link to choose a new one"
                : 'Sign in to Farm Fresh Direct'}
          </p>
        </div>

        {error && (
          <div role="alert" className="mb-4 flex items-start gap-2 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        {notice ? (
          <div role="status" className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-900 space-y-3">
            <p className="flex items-start gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0" aria-hidden="true" />
              <span>{notice}</span>
            </p>
            <button onClick={() => switchMode('signin')} className="font-semibold underline">
              Back to sign in
            </button>
          </div>
        ) : (
          <>
        {mode !== 'forgot' && (
          <>
        <button
          onClick={handleGoogleLogin}
          disabled={googleLoading || loading}
          className="w-full flex items-center justify-center gap-2 py-2.5 border border-gray-300 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors mb-4"
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
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          Continue with Google
        </button>

        <div className="flex items-center gap-3 my-4">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-xs text-gray-400 font-medium">or</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>
          </>
        )}

        <form onSubmit={handleEmailLogin} className="space-y-3">
          <div>
            <label htmlFor="login-email" className="text-xs font-semibold text-gray-600 mb-1 block">Email</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input id="login-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
              />
            </div>
          </div>

          {mode !== 'forgot' && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="login-password" className="text-xs font-semibold text-gray-600 block">Password</label>
              {mode === 'signin' && (
                <button
                  type="button"
                  onClick={() => switchMode('forgot')}
                  className="text-xs font-semibold text-emerald-800 underline"
                >
                  Forgot password?
                </button>
              )}
            </div>
            <div className="relative">
              <Lock className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input id="login-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                minLength={mode === 'signup' ? MIN_PASSWORD_LENGTH : undefined}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
              />
            </div>
            {mode === 'signup' && (
              <p className="text-xs text-gray-500 mt-1">At least {MIN_PASSWORD_LENGTH} characters.</p>
            )}
          </div>
          )}

          <button
            type="submit"
            disabled={loading || googleLoading}
            className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white font-semibold rounded-xl text-sm flex items-center justify-center gap-2 transition-colors mt-2"
          >
            {loading
              ? 'Please wait...'
              : mode === 'signup'
                ? 'Create Account'
                : mode === 'forgot'
                  ? 'Email Me a Reset Link'
                  : 'Sign In'}
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-gray-600">
          {mode === 'signin' ? (
            <>
              New here?{' '}
              <button onClick={() => switchMode('signup')} className="font-semibold text-emerald-800 underline">
                Create an account
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button onClick={() => switchMode('signin')} className="font-semibold text-emerald-800 underline">
                Sign in
              </button>
            </>
          )}
        </p>

        {mode === 'signup' && (
          <p className="mt-3 text-center text-xs text-gray-500">
            By creating an account you agree to our{' '}
            <a href="/terms" target="_blank" className="underline">
              Terms of Use
            </a>{' '}
            and{' '}
            <a href="/privacy" target="_blank" className="underline">
              Privacy Policy
            </a>
            .
          </p>
        )}
          </>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[70vh] flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}