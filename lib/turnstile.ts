// Settings for the "I'm human" check at checkout (Cloudflare Turnstile). Safe
// to import anywhere.

// The widget's site key. It is public by design — it is sent to every
// visitor's browser — so it can live in the code. The matching SECRET key must
// never be put here: it belongs only in the TURNSTILE_SECRET_KEY environment
// variable on the server.
export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '0x4AAAAAAFSnZqEMnVFFMtR6';

// What the check is being run for. The server only accepts a proof that was
// issued for this action, so one from some other form can't be reused here.
export const TURNSTILE_CHECKOUT_ACTION = 'checkout';
