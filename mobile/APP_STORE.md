# App Store and Google Play submission notes

What to put in App Store Connect and the Play Console. Getting the first review right matters most. Apple rejects apps that only wrap a website (guideline 4.2), so the review notes point the reviewer to what the app does on the phone itself.

## Review notes (App Store Connect → App Review Information → Notes)

> Farm Fresh Direct is a marketplace where shoppers pre-order produce from local farmers and gardeners and pick it up in person. Shoppers pay at checkout; the farmer is paid only after pickup, when the shopper's pickup code is scanned.
>
> Features of the app on the phone:
> - Push notifications: sellers are notified of new orders, cancellations and messages; buyers are notified when an order is ready for pickup and when the farmer messages them. Tapping a notification opens that order.
> - Camera: sellers photograph their harvest, and scan the buyer's pickup QR code to confirm a pickup (Sell → Orders → an order → Scan Buyer's QR Code).
> - Location: "Use my location" on the home screen and Browse finds the closest farms.
> - Native share sheet for sharing a farm or a listing.
> - Sign in with Apple, plus in-app account deletion (Account Settings → Delete my account).
> - Offline screen when there is no connection.
>
> Payments are for physical goods picked up in person (produce, eggs, flowers, plants), processed by Stripe, so in-app purchase does not apply (guideline 3.1.3(e)).
>
> Demo accounts:
> - Buyer: [email] / [password]. Has a past order and an order ready for pickup.
> - Seller: [email] / [password]. Has listings, an open order to mark ready, and sales records.

## Demo accounts (must exist before submitting)

The most common first rejection is "we couldn't see the app's features." Before submitting:

1. Create a buyer account and a seller account, with email sign-in (not Google).
2. Give the seller a farm profile, 3 or 4 listings with photos, and a completed payout setup in Stripe test or live mode.
3. Place an order from the buyer to the seller, and leave one order ready for pickup.
4. Keep these accounts and their data. Keep them out of the launch cleanup, and don't delete them later; Apple re-checks on every update.

## Listing

- **Name:** Farm Fresh Direct
- **Subtitle (30 characters):** Local farms, picked up fresh
- **Category:** Food & Drink (secondary: Shopping)
- **Age rating:** 4+
- **Privacy policy URL:** https://www.farmfreshdirect.online/privacy
- **Support URL:** https://www.farmfreshdirect.online/contact
- **Screenshots:** taken in the app on a phone, not of the website on a computer. Show: home with "Use my location", Browse, a listing, checkout, an order ready for pickup with its QR code, the seller dashboard, and a notification.
- Never mention Android or "our website" in the iPhone listing, and the reverse.

## App privacy answers (App Store "nutrition label" / Play "Data safety")

Data linked to the user, used for running the app (not for tracking or ads):

| Data | Why |
|---|---|
| Name, email address | Account, order emails |
| Phone number (optional) | Pickup contact |
| Physical address | Sellers' pickup address only |
| Coarse location | Only when "Use my location" is tapped; only the zip code is kept |
| Photos | Sellers' listing and farm photos |
| Purchase history | Orders |
| Payment info | Handled by Stripe; card numbers never reach our servers |
| Other user content | Messages between buyer and seller, reviews |
| Device ID (push token) | Notifications |

- **Tracking:** None. There's no advertising and no cross-app tracking, so the app does not need to ask permission to track.

## Checklist

- [ ] Apple Developer account approved
- [ ] Sign in with Apple set up (Apple keys + Supabase provider)
- [ ] Push: APNs key in Vercel; Firebase set up for Android (see README)
- [ ] push_devices table created (db/push_devices.sql)
- [ ] Demo accounts with data
- [ ] TestFlight build tested on a real iPhone: sign-in (Google, Apple, email), checkout, camera, QR scan, location, share, notifications, offline screen
- [ ] Screenshots, listing text, privacy answers
- [ ] Submit
