// The iPhone and Android app (mobile/) is a native shell that shows this
// website. These helpers let a page tell when it is running inside the app.
// Safe to import anywhere; on the server and in a phone's browser they report
// "not the app".

// Where Google and Apple sign-in come back to in the app. The phone hands this
// address to the app, which finishes signing in (components/NativeApp.tsx).
// It must be on Supabase's list of allowed redirect addresses.
export const NATIVE_AUTH_CALLBACK = 'online.farmfreshdirect.app://auth/callback';

// True inside the app. The app's native side adds window.Capacitor to the page.
export function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (window as any).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}

export function nativePlatform(): 'ios' | 'android' | 'web' {
  if (!isNativeApp()) return 'web';
  return (window as any).Capacitor.getPlatform();
}
