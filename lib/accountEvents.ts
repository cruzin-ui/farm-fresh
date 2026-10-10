// Lets one part of the page tell the account button in the header that what it
// shows may be out of date — the seller just opened a message thread, or
// marked an order ready — so it can look again straight away rather than
// waiting for its next routine check.

const ACCOUNT_CHANGED_EVENT = 'ffd-account-changed';

export function announceAccountChange() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(ACCOUNT_CHANGED_EVENT));
}

export function onAccountChange(listener: () => void) {
  window.addEventListener(ACCOUNT_CHANGED_EVENT, listener);
  return () => window.removeEventListener(ACCOUNT_CHANGED_EVENT, listener);
}

// Where a user's own profile picture is kept in their sign-in record. A name of
// our own, so signing in with Google (which fills in its own picture fields)
// never overwrites the one they chose here.
export const PROFILE_PHOTO_KEY = 'profile_photo_url';
