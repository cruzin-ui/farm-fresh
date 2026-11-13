import type { CapacitorConfig } from '@capacitor/cli';

// The Farm Fresh Direct app for iPhone and Android.
//
// The app is a native shell around the live website: it opens
// www.farmfreshdirect.online full screen, so every change to the site reaches
// the app at once, with no app update. The site notices it is inside the app
// (components/NativeApp.tsx) and adds what a website can't do on its own:
// the Android back button, Google and Apple sign-in through the system
// browser, and (later) push notifications.
//
// Capacitor's docs call server.url "not intended for production" because it
// is meant for live-reload during development. We use it on purpose; the
// offline page (www/offline.html) covers what a bundled app would.
const config: CapacitorConfig = {
  // Never change these after the first store release: the stores use the ID
  // to tell updates apart from new apps.
  appId: 'online.farmfreshdirect.app',
  appName: 'Farm Fresh Direct',
  webDir: 'www',

  server: {
    url: 'https://www.farmfreshdirect.online',
    // Pages on any other site (maps, Stripe's own pages, email links) open in
    // the phone's browser instead of inside the app.
    allowNavigation: ['www.farmfreshdirect.online', 'farmfreshdirect.online'],
    // Shown when the phone is offline or the site can't be reached.
    errorPath: 'offline.html',
  },

  // Lets the site tell the app apart from a phone's browser.
  appendUserAgent: 'FarmFreshDirectApp',
  backgroundColor: '#f3f9f5',

  ios: {
    // Keep the page below the status bar and above the home indicator.
    contentInset: 'always',
    scheme: 'Farm Fresh Direct',
  },

  android: {
    allowMixedContent: false,
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: '#047857',
      showSpinner: false,
    },
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#ffffff',
      overlaysWebView: false,
    },
    // Show a notification even while the app is open.
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    SystemBars: {
      insetsHandling: 'native',
    },
  },
};

export default config;
