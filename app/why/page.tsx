import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Sprout, ShoppingBag } from 'lucide-react';
import { SELLER_KEEPS_PERCENT, BUYER_FEE_LABEL } from '@/lib/pricing';

export const metadata: Metadata = {
  title: 'Why Farm Fresh Direct',
  description:
    'What growers and buyers get from using Farm Fresh Direct: payment up front, protected orders and neighbors who can find each other.',
};

// Sends buyers and growers to the page written for them.
export default function WhyPage() {
  return (
    <div className="max-w-4xl mx-auto px-2 sm:px-6 py-8 sm:py-12">
      <Link href="/" className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:underline mb-8">
        <ArrowLeft className="w-4 h-4" /> Back to Home
      </Link>

      <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900">Why buy and sell here</h1>
      <p className="mt-4 text-lg text-gray-600 leading-relaxed">
        Buying food from a neighbor should be simple. Farm Fresh Direct takes care of the awkward parts (finding each
        other, agreeing on a time, and paying) so growers can get on with growing and buyers can get on with eating.
      </p>

      <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          href="/why/buyers"
          className="group bg-white border border-gray-200 rounded-2xl p-6 shadow-sm hover:shadow-md hover:border-emerald-400 transition-all"
        >
          <div className="w-12 h-12 bg-emerald-100 text-emerald-700 rounded-xl flex items-center justify-center">
            <ShoppingBag className="w-6 h-6" aria-hidden="true" />
          </div>
          <h2 className="mt-4 text-xl font-bold text-gray-900">For buyers</h2>
          <p className="mt-1 text-sm text-gray-600">
            Fresh food from people you can meet. Your money is protected until you get your produce, and it&apos;s {BUYER_FEE_LABEL} per
            checkout.
          </p>
          <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-800 group-hover:underline">
            Why buy here <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </span>
        </Link>

        <Link
          href="/why/sellers"
          className="group bg-white border border-gray-200 rounded-2xl p-6 shadow-sm hover:shadow-md hover:border-emerald-400 transition-all"
        >
          <div className="w-12 h-12 bg-emerald-100 text-emerald-700 rounded-xl flex items-center justify-center">
            <Sprout className="w-6 h-6" aria-hidden="true" />
          </div>
          <h2 className="mt-4 text-xl font-bold text-gray-900">For sellers</h2>
          <p className="mt-1 text-sm text-gray-600">
            Your own online farm stand. Paid before you pick, keep {SELLER_KEEPS_PERCENT}%, and no monthly or startup costs.
          </p>
          <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-800 group-hover:underline">
            Why sell here <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </span>
        </Link>
      </div>
    </div>
  );
}
