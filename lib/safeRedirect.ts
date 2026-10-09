// Browser storage key for the page someone was heading to when they started
// signing in with Google. See the login page and the account menu.
export const AFTER_LOGIN_KEY = 'ffd-after-login';

// Where someone goes after signing in when they weren't heading anywhere in
// particular. That page sends sellers with payouts set up to their dashboard
// and everyone else to Browse.
export const AFTER_SIGN_IN_PATH = '/signed-in';

// Where to send someone after signing in. The destination arrives in the link,
// so it is only honoured when it is a path on this site ("/checkout?id=..."),
// never another website.
export function safeNextPath(next: string | null | undefined, fallback = AFTER_SIGN_IN_PATH) {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return fallback;
  return next;
}
