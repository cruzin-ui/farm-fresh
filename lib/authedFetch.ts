import { supabase } from '@/lib/supabaseClient';

// POSTs JSON to one of our API routes with the current Supabase session's
// access token attached, so the route can verify who is calling.
export async function postWithAuth(url: string, body: Record<string, unknown> = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}
