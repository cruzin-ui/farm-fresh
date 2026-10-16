import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  Sprout,
  Banknote,
  MapPin,
  Store,
  Heart,
  ClipboardList,
  SlidersHorizontal,
  Package,
} from 'lucide-react';
import {
  SELLER_FEE_RATE,
  RESTOCKING_RATE,
  FREE_CANCELLATION_HOURS,
  SELLER_KEEPS_PERCENT,
} from '@/lib/pricing';
import { SELLER_READY_DAYS, BUYER_PICKUP_DAYS, AUTO_CANCEL_DAYS } from '@/lib/pickupRules';
import { NO_SHOW_REVIEW_HOURS } from '@/lib/noShow';
import { SELLER_CANCEL_LIMIT, SELLER_CANCEL_WINDOW_DAYS } from '@/lib/sellerLimits';
import { LISTING_CATEGORIES } from '@/lib/categories';
import { Reasons, DetailBox, OtherSide, type Reason } from '@/components/WhyReasons';

export const metadata: Metadata = {
  title: 'Why Sell Here',
  description:
    'What growers get from selling on Farm Fresh Direct: an online farm stand, payment up front, and no monthly or startup costs. Fees, payouts and cancellations explained.',
};

const SELLER_FEE = `${SELLER_FEE_RATE * 100}%`;
const RESTOCKING_FEE = `${RESTOCKING_RATE * 100}%`;

const FOR_SELLERS: Reason[] = [
  {
    icon: Store,
    title: 'A storefront of your own',
    body: 'Your farm gets its own page with your photo, your story, how you grow, what you have for sale and your reviews. Choose your own short address, like farmfreshdirect.online/your-farm, and share it anywhere: it is an online farm stand that is open when you are not.',
  },
  {
    icon: Banknote,
    title: 'Paid before you pick',
    body: 'Every order is paid in full when it is placed, so you harvest what has sold. No cash box, no making change and no chasing a payment.',
  },
  {
    icon: Package,
    title: 'Hassle-free Farm Boxes (like a CSA)',
    body: 'Offer a weekly or every-other-week box that members sign up for. Each box is charged automatically before pickup, so you know how many to pack, and reminders, skipped weeks, pauses and declined cards are all handled for you.',
    wide: true,
  },
  {
    icon: Heart,
    title: 'Regulars who come back',
    body: 'Buyers can favorite your farm and see what you post next, and every pickup can earn you a review. One good first order becomes a customer who checks back each week.',
  },
  {
    icon: MapPin,
    title: 'New customers find you',
    body: 'Buyers search by zip code, so people nearby who have never heard of you see what you grow.',
  },
  {
    icon: ClipboardList,
    title: 'Your records, kept for you',
    body: 'Every order, pickup, cancellation and payout is saved in your Sales History, and your dashboard charts what you earned each week and which crops earned it.',
  },
  {
    icon: SlidersHorizontal,
    title: 'You set the terms',
    body: 'Your prices, your quantities, your pickup days and times. Your street address stays private until an order is ready to collect.',
  },
];

export default function WhySellersPage() {
  return (
    <div className="max-w-4xl mx-auto px-2 sm:px-6 py-8 sm:py-12">
      <Link href="/why" className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:underline mb-8">
        <ArrowLeft className="w-4 h-4" /> Why Farm Fresh Direct
      </Link>

      <div className="flex items-center gap-2 text-emerald-700">
        <Sprout className="w-5 h-5" aria-hidden="true" />
        <p className="text-xs font-bold uppercase tracking-wide">For growers</p>
      </div>
      <h1 className="mt-1 text-3xl sm:text-4xl font-extrabold text-gray-900">
        More than a place to sell: your own online farm stand
      </h1>
      <p className="mt-4 text-lg text-gray-600 leading-relaxed">
        Post what you grow, get paid before you pick, and meet buyers at a time that suits you. Here is what you get, what
        it costs, and exactly how payouts and cancellations work.
      </p>

      <Reasons items={FOR_SELLERS} />

      <section className="mt-10 bg-emerald-900 text-white rounded-2xl p-6 sm:p-8" aria-labelledby="sell-cost">
        <h2 id="sell-cost" className="text-2xl font-bold">
          What it costs
        </h2>
        <p className="mt-3 text-3xl font-black">You keep {SELLER_KEEPS_PERCENT}%</p>
        <ul className="mt-4 space-y-2 text-sm text-emerald-50 leading-relaxed list-disc pl-5">
          <li>
            A {SELLER_FEE} seller fee on each completed sale, taken out of your payout. Nothing when you sell nothing.
          </li>
          <li>Free to list, with no monthly subscription and no startup costs.</li>
          <li>Card processing is paid out of our fees, not yours.</li>
        </ul>
        <p className="mt-4 text-sm text-emerald-100">
          Example: you sell $20 of tomatoes. You are paid ${(20 * (1 - SELLER_FEE_RATE)).toFixed(2)}.
        </p>
      </section>

      <DetailBox id="sell-payouts" title="How you get paid">
        <ol className="list-decimal pl-5 space-y-2">
          <li>A buyer orders and pays in full online. You get an email.</li>
          <li>
            You mark the order ready within {SELLER_READY_DAYS} days (or of your listing&apos;s harvest date, if that is
            later), and tick the days and times the buyer can come.
          </li>
          <li>The buyer gets your pickup address and has {BUYER_PICKUP_DAYS} days to collect.</li>
          <li>
            At pickup, scan the buyer&apos;s QR code or type their pickup code. That releases your payment, and Stripe
            deposits it to your bank once a week, on Fridays.
          </li>
        </ol>
        <p>Never take cash or a separate payment at pickup: everything is paid through the site.</p>
      </DetailBox>

      <DetailBox id="sell-cancellations" title="Cancellations, no-shows and refunds">
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong>A buyer cancels within {FREE_CANCELLATION_HOURS} hours</strong> of ordering: they get the produce price
            back and the item goes back on your listing. No fee either way.
          </li>
          <li>
            <strong>A buyer cancels later, or never turns up:</strong> you are paid a {RESTOCKING_FEE} restocking fee and the
            produce goes back on your listing. For a no-show, you report it once the buyer&apos;s {BUYER_PICKUP_DAYS} days
            are up; they have {NO_SHOW_REVIEW_HOURS} hours to respond, then it closes.
          </li>
          <li>
            <strong>You cancel or reduce an order</strong> (a poor harvest, say): the buyer is refunded in full for that
            part, including their share of the service fee, and you aren&apos;t paid for it. Now and then is fine; if you
            cancel {SELLER_CANCEL_LIMIT} or more orders within {SELLER_CANCEL_WINDOW_DAYS} days, your listings are paused
            until we review your account.
          </li>
          <li>
            <strong>An order isn&apos;t marked ready in time:</strong> the buyer can cancel for a full refund, and an order
            still not ready after {AUTO_CANCEL_DAYS} days is cancelled and refunded automatically. You aren&apos;t paid for
            it.
          </li>
          <li>
            <strong>After pickup:</strong> if a buyer tells us they didn&apos;t receive something you marked as handed over,
            we look into it, and may hold or recover that payout if it wasn&apos;t supplied.
          </li>
        </ul>
      </DetailBox>

      <DetailBox id="sell-what" title="What you can sell">
        <p>
          Things you grew or made yourself, in these categories: {LISTING_CATEGORIES.join(', ')}. Mushrooms must be ones
          you cultivated, and plants ones you grew or propagated. Seeds, meat, dairy, baked goods and crafts can&apos;t be
          listed.
        </p>
        <p>
          You are responsible for following your state&apos;s rules for what you sell, such as licences for eggs or
          plants and cottage-food rules for honey and jam. Sales tax is worked out and collected for you at checkout.
        </p>
      </DetailBox>

      <DetailBox id="sell-start" title="What you need to start">
        <ul className="list-disc pl-5 space-y-2">
          <li>A farm profile: your farm name, a photo and a pickup address (it stays private until an order is ready).</li>
          <li>
            A payout account, set up through Stripe in a few minutes: the identity details Stripe asks for and a bank account
            for your deposits.
          </li>
          <li>Your first listing: pick a category, add a photo, price and amount, and post.</li>
        </ul>
      </DetailBox>

      <div className="mt-10 flex flex-col sm:flex-row items-center gap-4">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold py-3 px-5 rounded-xl transition-colors"
        >
          Start selling <ArrowRight className="w-4 h-4" aria-hidden="true" />
        </Link>
        <p className="text-sm text-gray-600">
          Full details:{' '}
          <Link href="/seller-terms" className="font-semibold text-emerald-800 underline">
            Seller Terms
          </Link>{' '}
          and the{' '}
          <Link href="/faq" className="font-semibold text-emerald-800 underline">
            FAQ
          </Link>
          .
        </p>
      </div>

      <OtherSide href="/why/buyers" text="Looking to buy instead? See why people buy here" />
    </div>
  );
}
