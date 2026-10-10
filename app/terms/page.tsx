import type { Metadata } from 'next';
import Link from 'next/link';
import { BUYER_FEE_LABEL } from '@/lib/pricing';
import { LEGAL_LAST_UPDATED, OPERATOR_DESCRIPTION } from '@/lib/legal';
import { SELLER_READY_DAYS, BUYER_PICKUP_DAYS, AUTO_CANCEL_DAYS } from '@/lib/pickupRules';

export const metadata: Metadata = { title: 'Terms of Use' };

// Mirrors NO_SHOW_RESTOCKING_RATE in lib/orderActions.ts (a server-only file).
const NO_SHOW_FEE = '10%';

// The terms a buyer agrees to at checkout. Sellers additionally agree to the
// Seller Terms.
export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-gray-900">Terms of Use</h1>
      <p className="text-xs text-gray-500 mt-1">Last updated {LEGAL_LAST_UPDATED}</p>

      <div className="mt-6 space-y-6 text-sm text-gray-700 leading-relaxed">
        <p>
          Farm Fresh Direct is operated by {OPERATOR_DESCRIPTION} (&quot;Farm Fresh Direct&quot;, &quot;we&quot;,
          &quot;us&quot;). You can reach us through the{' '}
          <Link href="/contact" className="font-semibold text-emerald-800 underline">
            Contact Us
          </Link>{' '}
          page.
        </p>

        <p>
          These terms apply to everyone who uses Farm Fresh Direct, and in particular to anyone who buys through
          it. By placing an order you agree to them. If you sell on the site, the{' '}
          <Link href="/seller-terms" className="font-semibold text-emerald-800 underline">
            Seller Terms
          </Link>{' '}
          also apply to you.
        </p>

        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-1">1. What Farm Fresh Direct is</h2>
          <p>
            Farm Fresh Direct is a marketplace for locally grown produce. It connects buyers with local
            gardeners and small farms and processes payment between them. Listings for anything other than
            local produce and the few farm foods in our categories are not allowed and will be removed. The
            seller, not Farm Fresh Direct, is the seller of every product listed. We do not grow, handle,
            store, inspect, test, certify or approve any product.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-1">2. Who can use the site</h2>
          <p>
            You must be at least 18 years old to place an order. You can buy as a guest with an email address or
            with an account. You are responsible for giving us a working email address, since that is how you
            receive your order details and pickup code, and for keeping your account sign-in secure.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-1">3. Orders and payment</h2>
          <p>
            You pay in full online, by card, when you place an order. One checkout can include items from
            more than one seller; each item is then a separate order with that seller. In addition to the
            price of the produce, you pay a service fee of {BUYER_FEE_LABEL}, charged once per checkout
            however many items it includes, and any sales tax that applies. Both are shown at checkout before
            you pay. Payments are processed by Stripe. We hold your payment and release each seller&apos;s share
            to them when their item is picked up.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-1">4. Pickup and your pickup code</h2>
          <p>
            Orders are collected in person from the seller, once the seller tells you it is ready. Before
            then you are shown only the seller&apos;s city and zip code; the full pickup address is given to you
            when the order is marked ready. The seller has {SELLER_READY_DAYS} days to do that, counted from
            your order or from the listing&apos;s harvest date if that is later. You then have{' '}
            {BUYER_PICKUP_DAYS} days to collect it, on the days and at the times the seller gives you.
          </p>
          <p className="mt-2">
            You receive one pickup code for each seller you buy from, covering everything you bought from
            that seller in that checkout. It is shown on your order page as a code and as a QR code. Give it
            to the seller, or let them scan it, only when you have received your produce: doing so confirms
            that you have collected the items the seller marks as handed over, and releases your payment for
            them to the seller. A code works for one visit. If you collect only some of your items, we send
            you a new code for the rest. Do not pay the seller anything further at pickup.
          </p>
          <p className="mt-2">
            After a pickup, your order page asks you to confirm that you received each item. If an item has
            been marked as picked up and you did not receive it, tell us there straight away.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-1">5. Cancellations and refunds</h2>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              <strong>If the seller cancels or reduces your order,</strong> you are refunded automatically for
              whatever you will not receive, including the matching share of the service fee.
            </li>
            <li>
              <strong>If the seller does not have your order ready in time,</strong> you can cancel it for a
              full refund, including the service fee. An order that is still not ready {AUTO_CANCEL_DAYS} days
              after it should have started is cancelled and refunded in full automatically.
            </li>
            <li>
              <strong>If you cancel your order,</strong> which you can do from your order page any time before
              pickup, you are refunded what you paid for the produce. The service fee is not refunded. If you
              cancel more than 48 hours after ordering, or after the seller has reported the order as not
              collected, the seller also keeps a {NO_SHOW_FEE} restocking fee.
            </li>
            <li>
              <strong>If you cannot collect your order,</strong> cancel it or contact us as early as you can. If you do not collect an order within {BUYER_PICKUP_DAYS} days of being told it is ready, the seller
              may report it as not collected. If a seller
              reports that an order was not collected, we email you, and you have 48 hours to tell us if that
              is wrong. If an order is not collected, the service fee is not refunded and the seller keeps a{' '}
              {NO_SHOW_FEE} restocking fee; the rest of what you paid for the produce is refunded.
            </li>
            <li>
              <strong>If there is a problem with your order at pickup,</strong> do not give the seller your
              pickup code, and tell us using Report a problem on your order page or the Contact Us page. Once
              the code has been given, the seller has been paid, and any refund is at our discretion.
            </li>
            <li>
              <strong>If you believe a charge is wrong,</strong> contact us first so we can put it right. If
              you dispute a charge with your bank instead, we will give the bank our record of the order,
              including when your pickup code was used.
            </li>
          </ul>
          <p className="mt-2">Refunds are returned to your original payment method and can take several business days.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-1">6. The products</h2>
          <p>
            Products are grown, produced and described by the sellers. We do not guarantee their quality,
            safety, legality or fitness for any purpose, or that a listing is accurate. Produce and other foods
            sold here are not inspected by us. Wash produce before eating it, and handle, store and cook foods
            such as eggs safely.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-1">7. Meeting sellers</h2>
          <p>
            Pickups are arranged between you and the seller, and you attend them at your own risk. Meet only at
            the pickup address on your order, and use the same judgment you would when meeting anyone you do
            not know. You and the seller can message each other about an order through the site. Messages are
            for arranging the pickup; we may read them when looking into a problem or a report.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-1">8. Using the site fairly</h2>
          <p>
            Do not use the site to break the law, to mislead or harass others, to interfere with how the site
            works, or to collect other users&apos; information. Do not pay for, or arrange to pay for, an order
            made through the site in any way other than through the site, and do not buy from your own
            listings. We may cancel orders or close accounts that break these terms.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-1">9. Our responsibility to you</h2>
          <p>
            The site is provided as it is, without warranties of any kind. To the extent the law allows, Farm
            Fresh Direct is not liable for the acts or omissions of sellers or buyers, for the products sold, or
            for anything that happens at a pickup, and our total liability to you for any claim relating to an
            order is limited to the amount you paid for that order.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-1">10. Changes and governing law</h2>
          <p>
            We may update these terms; the version posted here when you place an order is the one that applies
            to it. These terms are governed by the laws of the State of Arizona.
          </p>
        </section>

        <p>
          See also our{' '}
          <Link href="/privacy" className="font-semibold text-emerald-800 underline">
            Privacy Policy
          </Link>
          . Questions?{' '}
          <Link href="/contact" className="font-semibold text-emerald-800 underline">
            Contact us
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
