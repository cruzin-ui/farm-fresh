import type { Metadata } from 'next';
import Link from 'next/link';
import { LEGAL_LAST_UPDATED, OPERATOR_DESCRIPTION } from '@/lib/legal';

export const metadata: Metadata = { title: 'Privacy Policy' };

// Describes what the site actually collects and who it is shared with. If the
// site starts using a new service that receives personal data (analytics,
// advertising, a different email or payment provider), this page must be
// updated to match.
export default function PrivacyPolicyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-gray-900">Privacy Policy</h1>
      <p className="text-xs text-gray-500 mt-1">Last updated {LEGAL_LAST_UPDATED}</p>

      <div className="mt-6 space-y-6 text-sm text-gray-700 leading-relaxed">
        <p>
          Farm Fresh Direct is operated by {OPERATOR_DESCRIPTION} (&quot;Farm Fresh Direct&quot;, &quot;we&quot;,
          &quot;us&quot;). This policy explains what information we collect when you use this website, how we use
          it, and who we share it with.
        </p>

        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-1">1. Information we collect</h2>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              <strong>Account information.</strong> Your email address and sign-in details when you create an
              account.
            </li>
            <li>
              <strong>Guest checkout.</strong> Your email address, if you buy without creating an account.
            </li>
            <li>
              <strong>Orders.</strong> What you bought or sold, the quantity, the price, the date and the status
              of each order.
            </li>
            <li>
              <strong>Seller information.</strong> If you sell: your farm name, photos, description, location,
              zip code, the listings you post, and the pickup address for each listing.
            </li>
            <li>
              <strong>Messages.</strong> What you send us through the Contact Us form, and messages a seller
              sends a buyer through the site about an order.
            </li>
            <li>
              <strong>Payment information.</strong> Card details are entered directly with our payment
              processor, Stripe. We do not receive or store your full card number. Sellers give Stripe the
              identity, tax and bank details needed to be paid; we do not store those either.
            </li>
            <li>
              <strong>Technical information.</strong> Standard information your browser sends when it loads a
              page, such as your IP address and browser type, which our hosting provider logs.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-1">2. How we use it</h2>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>To process orders, payments, refunds and seller payouts.</li>
            <li>
              To send emails about your orders: confirmations, pickup details, changes, refunds and a thank-you
              after pickup.
            </li>
            <li>To show listings and farm profiles to people browsing the site.</li>
            <li>To answer your questions and resolve problems with orders.</li>
            <li>To keep the site secure, prevent fraud and misuse, and meet our legal and tax obligations.</li>
          </ul>
          <p className="mt-2">We do not sell your personal information, and we do not use it for advertising.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-1">3. What buyers and sellers see about each other</h2>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              <strong>Sellers see</strong> the email address of a buyer who orders from them, and what was
              ordered.
            </li>
            <li>
              <strong>Buyers see</strong> a seller&apos;s farm name, photos, description, city and zip code on
              public listings. A seller&apos;s pickup address is shown to a buyer only after that buyer has
              paid for an order.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-1">4. Companies that process information for us</h2>
          <p>We use other companies to run the site. They receive only what they need to do their job:</p>
          <ul className="list-disc pl-5 space-y-1.5 mt-2">
            <li>
              <strong>Stripe</strong> — payment processing, seller identity verification and payouts.
            </li>
            <li>
              <strong>Supabase</strong> — our database, sign-in system and photo storage.
            </li>
            <li>
              <strong>Vercel</strong> — website hosting.
            </li>
            <li>
              <strong>Resend</strong> — sending our emails.
            </li>
            <li>
              <strong>Address and zip code lookup services</strong> (Photon and Zippopotam) — when a seller
              types a pickup address or zip code, that text is sent to these services to suggest matching
              addresses and cities.
            </li>
          </ul>
          <p className="mt-2">
            We may also disclose information when the law requires it, or to protect the rights and safety of
            our users or the public.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-1">5. Cookies</h2>
          <p>
            We use cookies and similar browser storage only to keep you signed in. We do not use advertising or
            tracking cookies.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-1">6. How long we keep information</h2>
          <p>
            We keep account and order information for as long as your account is open and for as long
            afterwards as we need it for tax, accounting and legal purposes.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-1">7. Your choices</h2>
          <p>
            You can ask us for a copy of the information we hold about you, ask us to correct it, or ask us to
            delete your account. We may need to keep some order records where the law requires it. To make a
            request,{' '}
            <Link href="/contact" className="font-semibold text-emerald-800 underline">
              contact us
            </Link>
            .
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-1">8. Children</h2>
          <p>
            This site is not intended for children under 13, and we do not knowingly collect information from
            them. You must be at least 18 to buy or sell here.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-1">9. Changes to this policy</h2>
          <p>
            If we change this policy we will post the new version here and update the date at the top.
          </p>
        </section>

        <p>
          Questions about your privacy?{' '}
          <Link href="/contact" className="font-semibold text-emerald-800 underline">
            Contact us
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
