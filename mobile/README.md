# Farm Fresh Direct app (iPhone and Android)

A native shell around www.farmfreshdirect.online, built with Capacitor 8.
The app shows the live site, so site changes reach the app without an app
update. Only changes in this folder (icons, permissions, plugins, native
settings) need a new store release.

## What's here

- `capacitor.config.ts`: app ID `online.farmfreshdirect.app` (never change it after release), the site address, splash screen and status bar.
- `www/offline.html`: shown when the phone is offline. `www/index.html` is only a placeholder that Capacitor requires.
- `assets/`: the source icon and splash images (the FFD seal). To regenerate every size after changing them, run:
  `npx @capacitor/assets@3.0.5 generate --iconBackgroundColor '#047857' --iconBackgroundColorDark '#047857' --splashBackgroundColor '#047857' --splashBackgroundColorDark '#064e3b'`
  Then delete the `icons/` folder and `www/manifest.json` it also creates.
- `android/`, `ios/`: the native projects. Edit them only for permissions, the sign-in return address and other native settings.

## How the site and the app work together

- The site checks `lib/nativeApp.ts` to see whether it's running inside the app.
- `components/NativeApp.tsx` handles the Android back button, and finishes Google and Apple sign-in when it returns to `online.farmfreshdirect.app://auth/callback`.
- That return address must be on Supabase's allowed list: Authentication, then URL Configuration, then Redirect URLs. Add `online.farmfreshdirect.app://auth/callback**`.
- Links to other sites open in the phone's browser (`server.allowNavigation`).

## Building

After changing anything here, run `npm install`, then `npx cap sync`.

- **Android:** install Android Studio, then run `npx cap open android`. To try it, run on a phone plugged in by USB, with developer mode on.
- **iPhone:** this needs a Mac, so we use a cloud build service, plus the Apple Developer account for signing and TestFlight.
