'use client';

import { useEffect, useRef } from 'react';
import { TURNSTILE_CHECKOUT_ACTION } from '@/lib/turnstile';

declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: Record<string, unknown>) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

const SCRIPT_ID = 'cf-turnstile-script';
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

// The "I'm human" check at checkout (Cloudflare Turnstile). For most people it
// ticks itself without them doing anything. `onToken` receives the proof to
// send to the server, or an empty string when there isn't a valid one. Each
// proof works once, so change `resetKey` after every payment attempt to get a
// fresh one. `onUnavailable` is called if the check itself can't run (blocked
// by the visitor's network, say), so the page isn't left waiting on it.
export default function TurnstileBox({
  siteKey,
  onToken,
  onUnavailable,
  resetKey,
}: {
  siteKey: string;
  onToken: (token: string) => void;
  onUnavailable: () => void;
  resetKey: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;
  const onUnavailableRef = useRef(onUnavailable);
  onUnavailableRef.current = onUnavailable;

  useEffect(() => {
    let cancelled = false;
    let poll: ReturnType<typeof setInterval> | undefined;

    const render = () => {
      if (cancelled || !containerRef.current || !window.turnstile || widgetIdRef.current) return;
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        action: TURNSTILE_CHECKOUT_ACTION,
        callback: (token: string) => onTokenRef.current(token),
        'expired-callback': () => onTokenRef.current(''),
        'error-callback': () => {
          onTokenRef.current('');
          onUnavailableRef.current();
        },
      });
    };

    if (!document.getElementById(SCRIPT_ID)) {
      const script = document.createElement('script');
      script.id = SCRIPT_ID;
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      script.onerror = () => onUnavailableRef.current();
      document.head.appendChild(script);
    }

    // The script may still be loading; draw the box as soon as it is ready.
    if (window.turnstile) render();
    else {
      poll = setInterval(() => {
        if (window.turnstile) {
          clearInterval(poll);
          render();
        }
      }, 200);
    }

    return () => {
      cancelled = true;
      if (poll) clearInterval(poll);
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {}
      }
      widgetIdRef.current = null;
    };
  }, [siteKey]);

  useEffect(() => {
    if (resetKey === 0) return;
    onTokenRef.current('');
    if (widgetIdRef.current && window.turnstile) {
      try {
        window.turnstile.reset(widgetIdRef.current);
      } catch {}
    }
  }, [resetKey]);

  return <div ref={containerRef} className="min-h-[65px]" />;
}
