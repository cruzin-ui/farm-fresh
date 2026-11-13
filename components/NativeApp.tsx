'use client';

import { useEffect } from 'react';
import { isNativeApp, nativePlatform, NATIVE_AUTH_CALLBACK } from '@/lib/nativeApp';
import { supabase } from '@/lib/supabaseClient';
import { postWithAuth } from '@/lib/authedFetch';

const PUSH_TOKEN_KEY = 'ffd-push-token';

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
// - Notifications: once someone is signed in, and once the server can send to
//   this kind of phone, the app asks permission and registers the phone
//   (lib/push.ts). Tapping a notification opens the page it is about. Signing
//   out stops this phone getting that account's notifications.
// - Links that would open a new tab stay in the app (our pages) or open in the
//   phone's browser (other sites), since an app has no tabs.
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

      await setUpNotifications(removers, () => cancelled);
    })().catch((err) => console.error('app setup failed', err));

    // An app has no tabs: our own pages open in place, other sites in the
    // phone's browser.
    const onClick = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.('a[target="_blank"]') as HTMLAnchorElement | null;
      if (!link || !link.href || event.defaultPrevented) return;
      const url = new URL(link.href, window.location.href);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') return;
      event.preventDefault();
      if (url.origin === window.location.origin) {
        window.location.href = url.href;
      } else {
        void import('@capacitor/browser').then(({ Browser }) => Browser.open({ url: url.href }));
      }
    };
    document.addEventListener('click', onClick);
    removers.push(() => document.removeEventListener('click', onClick));

    return () => {
      cancelled = true;
      removers.forEach((remove) => remove());
    };
  }, []);

  return null;
}

async function setUpNotifications(removers: (() => void)[], isCancelled: () => boolean) {
  const platform = nativePlatform();
  if (platform === 'web') return;
  const { PushNotifications } = await import('@capacitor/push-notifications');
  if (isCancelled()) return;

  const registration = await PushNotifications.addListener('registration', async ({ value }) => {
    try {
      localStorage.setItem(PUSH_TOKEN_KEY, value);
    } catch {}
    await postWithAuth('/api/push/register', { platform, token: value }).catch(() => {});
  });
  // Tapping a notification opens the page it is about.
  const tapped = await PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => {
    const url = String((notification.data as any)?.url || '');
    if (url.startsWith('/') && !url.startsWith('//')) window.location.href = url;
  });
  removers.push(() => registration.remove(), () => tapped.remove());

  const turnOn = async () => {
    // Don't ask before the server can actually send to this kind of phone.
    const res = await postWithAuth('/api/push/register', { platform }).catch(() => null);
    const ready = res && res.ok ? Boolean((await res.json()).ready) : false;
    if (!ready || isCancelled()) return;
    let { receive } = await PushNotifications.checkPermissions();
    if (receive === 'prompt' || receive === 'prompt-with-rationale') {
      receive = (await PushNotifications.requestPermissions()).receive;
    }
    if (receive === 'granted') await PushNotifications.register();
  };

  const turnOff = async () => {
    let token = '';
    try {
      token = localStorage.getItem(PUSH_TOKEN_KEY) || '';
      localStorage.removeItem(PUSH_TOKEN_KEY);
    } catch {}
    if (token) {
      await fetch('/api/push/unregister', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      }).catch(() => {});
    }
  };

  const { data } = await supabase.auth.getSession();
  if (data.session) void turnOn();
  const { data: auth } = supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN') void turnOn();
    if (event === 'SIGNED_OUT') void turnOff();
  });
  removers.push(() => auth.subscription.unsubscribe());
}
