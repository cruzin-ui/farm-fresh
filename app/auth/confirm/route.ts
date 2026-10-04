import { createServerClient } from '@supabase/ssr';
import type { EmailOtpType } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { safeNextPath } from '@/lib/safeRedirect';

// Where the links in our sign-up confirmation and password-reset emails land,
// once Supabase's email templates are pointed here. The link carries a
// one-time token that is verified on the server, so it works in any browser
// or device — unlike /auth/callback, which only works in the browser that
// asked for the email.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;

  // `redirect_to` is the address the sign-up or reset request asked to return
  // to (our own /auth/callback?next=...); only its destination path is used.
  let next = searchParams.get('next');
  const redirectTo = searchParams.get('redirect_to');
  if (!next && redirectTo) {
    try {
      const target = new URL(redirectTo);
      if (target.origin === origin) next = target.searchParams.get('next') || target.pathname;
    } catch {}
  }
  const destination = safeNextPath(next, type === 'recovery' ? '/auth/reset-password' : '/dashboard');

  if (tokenHash && type) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
            } catch {
              // Handled in middleware
            }
          },
        },
      }
    );

    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      return NextResponse.redirect(`${origin}${destination}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=link-expired`);
}
