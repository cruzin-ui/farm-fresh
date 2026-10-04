// Where to send someone after signing in. The destination arrives in the link,
// so it is only honoured when it is a path on this site ("/checkout?id=..."),
// never another website.
export function safeNextPath(next: string | null | undefined, fallback = '/dashboard') {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return fallback;
  return next;
}
