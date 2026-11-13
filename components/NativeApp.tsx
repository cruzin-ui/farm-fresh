'use client';

import { useEffect } from 'react';
import { isNativeApp, NATIVE_AUTH_CALLBACK } from '@/lib/nativeApp';

// Runs only inside the iPhone and Android app (mobile/); on the website it
// does nothing and loads nothing extra.
//
// - Android's back button goes back a page, and closes the app on the first
//   page instead of doing nothing.
// - Google and Apple sign-in happen in the phone's own browser (Google blocks
//   signing in inside apps' web views). They come back to the app at
//   online.farmfreshdirect.app://auth/callback?code=..., and the code is
//   handed to our usual /auth/callback page here, where the rest of the
//   sign-in was started, so the session lands in the app.
export default function NativeApp() {
  useEffect(() => {
    if (!isNativeApp()) return;
    document.documentElement.classList.add('native-app');

    let cancelled = false;
    const removers: (() => void)[] = [];

    const finishSignIn = async (url: string) => {
      if (!url.startsWith(NATIVE_AUTH_CALLBACK)) return;
      // Each sign-in link is used once: the app keeps reporting the link it
      // was started with on every page after.
      try {
        if (sessionStorage.getItem('ffd-native-auth-url') === url) return;
        sessionStorage.setItem('ffd-native-auth-url', url);
      } catch {}
      const query = url.slice(NATIVE_AUTH_CALLBACK.length).replace(/^[^?]*/, '');
      try {
        const { Browser } = await import('@capacitor/browser');
        await Browser.close();
      } catch {
        // Already closed (Android closes it on its own).
      }
      const params = new URLSearchParams(query.replace(/^\?/, ''));
      if (params.get('code')) {
        window.location.href = `/auth/callback?${params.toString()}`;
      } else {
        // Cancelled, or the provider sent back an error.
        window.location.href = '/login?error=auth-failed';
      }
    };

    (async () => {
      const { App } = await import('@capacitor/app');
      if (cancelled) return;

      const back = await App.addListener('backButton', ({ canGoBack }) => {
        if (canGoBack) window.history.back();
        else App.exitApp();
      });
      const opened = await App.addListener('appUrlOpen', ({ url }) => {
        void finishSignIn(url);
      });
      removers.push(() => back.remove(), () => opened.remove());

      // The app was started by the sign-in link itself.
      const launch = await App.getLaunchUrl();
      if (launch?.url) void finishSignIn(launch.url);
    })();

    return () => {
      cancelled = true;
      removers.forEach((remove) => remove());
    };
  }, []);

  return null;
}
