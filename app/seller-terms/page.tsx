import type { Metadata } from 'next';
import Link from 'next/link';
import { SELLER_FEE_RATE } from '@/lib/pricing';
import { SELLER_TERMS_VERSION } from '@/lib/sellerTerms';
import { OPERATOR_DESCRIPTION } from '@/lib/legal';

export const metadata: Metadata = { title: 'Seller Terms' };

const SELLER_FEE = `${SELLER_FEE_RATE * 100}%`;

// The terms a seller agrees to before posting their first listing. When the
// substance of these changes, update SELLER_TERMS_VERSION so the change is
// reflected in what new sellers are recorded as having accepted.
export default function SellerTermsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-gray-900">Seller Terms</h1>
      <p className="text-xs text-gray-500 mt-1">Version {SELLER_TERMS_VERSION}</p>

      <div className="mt-6 space-y-6 text-sm text-gray-700 leading-relaxed">
        <p>
          Farm Fresh Direct is operated by {OPERATOR_DESCRIPTION} (&quot;Farm Fresh Direct&quot;, &quot;we&quot;,
          &quot;us&quot;).
        </p>

        <p>
          These terms apply to everyone who lists products for sale on Farm Fresh Direct. By posting a listing you
          agree to them, in addition to our{' '}
          <Link href="/terms" className="font-semibold text-emerald-800 underline">
            Terms of Use
          </Link>{' '}
          and{' '}
          <Link href="/privacy" className="font-semibold text-emerald-800 underline">
            Privacy Policy
          </Link>
          .
        </p>

        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-1">1. You are responsible for what you sell</h2>
          <p>
            You are the seller of the products you list. You are responsible for knowing and following all
            federal, state and local laws that apply to them, including any licenses, permits, registrations,
            labeling, packaging and food-safety requirements. Rules for items such as eggs, seeds, honey, jam and
            other prepared foods vary by state; it is your responsibility to check them before you list.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-1">2. Farm Fresh Direct&apos;s role</h2>
          <p>
            Farm Fresh Direct is a marketplace that connects buyers and sellers and processes payment between
            them. We do not grow, handle, inspect, test, certify or approve any product, and we do not verify
            that a seller holds any license or permit. We are not responsible for products sold in violation of
            the law, or for the quality, safety or legality of any product listed.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-1">3. Honest listings</h2>
          <p>
            Your listings must accurately describe what you are selling, including the product, quantity, price
            and any claims you make about how it was grown or produced. Only make claims, such as
            &quot;organic&quot;, that you are legally entitled to make.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-1">4. Fees and payment</h2>
          <p>
            Posting is free. Farm Fresh Direct keeps a seller fee of {SELLER_FEE} of the produce price on each
            completed sale. Buyers pay online, and we hold the payment until pickup. Your payout is released when
            you enter the buyer&apos;s pickup code, and is paid to your connected payout account. Do not collect
            cash or any additional payment at pickup.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-1">5. Fulfilling orders</h2>
          <p>
            You agree to have the produce you list available for pickup at the address and times you give the
            buyer. If you cannot fulfill an order in full, reduce or cancel it through your Seller Dashboard so
            the buyer is refunded. If a buyer does not collect an order, we may close it and pay you a restocking
            fee.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-1">6. Removing listings and accounts</h2>
          <p>
            We may remove a listing, cancel and refund an order, or suspend a seller&apos;s account if we believe
            a product is not permitted, a listing is inaccurate, or these terms have been broken.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-1">7. Your responsibility for claims</h2>
          <p>
            You are responsible for any claims, losses or costs that arise from the products you sell or from
            your failure to follow the law or these terms.
          </p>
        </section>

        <p>
          Questions about these terms?{' '}
          <Link href="/contact" className="font-semibold text-emerald-800 underline">
            Contact us
          </Link>
          . For more on what you can sell, see the{' '}
          <Link href="/faq" className="font-semibold text-emerald-800 underline">
            FAQ
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
