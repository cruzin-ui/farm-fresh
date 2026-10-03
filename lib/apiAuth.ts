import type { User } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// SERVER-ONLY. Resolves the signed-in user from the request's
// `Authorization: Bearer <supabase access token>` header. Returns null when
// the header is missing or the token is invalid/expired — route handlers
// should respond 401 in that case and never trust a user id from the body.
export async function getRequestUser(request: Request): Promise<User | null> {
  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;

  return data.user;
}

// Admins are the signed-in users whose email is listed in the ADMIN_EMAILS
// environment variable (comma-separated). With the variable unset, nobody is
// an admin.
export function isAdminEmail(email: string | undefined | null) {
  if (!email) return false;

  const admins = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  return admins.includes(email.toLowerCase());
}

// Like getRequestUser, but returns null unless the user is an admin.
export async function getRequestAdmin(request: Request): Promise<User | null> {
  const user = await getRequestUser(request);
  return user && isAdminEmail(user.email) ? user : null;
}
