import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  Sprout,
  ShoppingBag,
  Banknote,
  CalendarCheck,
  MapPin,
  Store,
  Heart,
  ClipboardList,
  Tag,
  SlidersHorizontal,
  ShieldCheck,
  Undo2,
  Star,
  ShoppingCart,
  MessageCircle,
  UserCheck,
  Package,
} from 'lucide-react';
import {
  BUYER_FEE_LABEL,
  SELLER_FEE_RATE,
  RESTOCKING_RATE,
  FREE_CANCELLATION_HOURS,
  SELLER_KEEPS_PERCENT,
  PLATFORM_KEEPS_CENTS_PER_DOLLAR,
} from '@/lib/pricing';

export const metadata: Metadata = {
  title: 'Why Farm Fresh Direct',
  description:
    'What growers and buyers get from using Farm Fresh Direct: payment up front, protected orders and neighbors who can find each other.',
};

const SELLER_FEE = `${SELLER_FEE_RATE * 100}%`;
const RESTOCKING_FEE = `${RESTOCKING_RATE * 100}%`;

// `wide` cards span the whole row, to stand out.
type Reason = { icon: typeof Store; title: string; body: string; wide?: boolean };

const FOR_SELLERS: Reason[] = [
  {
    icon: Package,
    title: 'Hassle-free Farm Boxes (like a CSA)',
    body: `A Farm Box is our take on a CSA: a weekly or every-other-week box that members sign up for. Offer one and let the site run it. Members join online with a saved card, and each box is charged automatically before pickup, so you know how many to pack and you are paid before you pick. Reminders, skipped weeks, pauses, cancellations and declined cards are all handled for you, and each box shows up on your Pick List like any order. No spreadsheets, no chasing payments, and the same ${SELLER_FEE} fee as everything else.`,
    wide: true,
  },
  {
    icon: Store,
    title: 'A storefront of your own',
    body: 'Your farm gets its own page with your photo, your story, how you grow, what you have for sale and your reviews. Choose your own short address, like farmfreshdirect.online/your-farm, and share it anywhere: it is an online farm stand that is open when you are not.',
  },
  {
    icon: Heart,
    title: 'Regulars who come back',
    body: 'Buyers can favorite your farm and see what you post next, and every pickup can earn you a review. One good first order becomes a customer who checks back each week.',
  },
  {
    icon: ClipboardList,
    title: 'Your records, kept for you',
    body: 'Every order, pickup, cancellation and payout is saved in your Sales History. Your dashboard charts what you earned each week and which crops earned it, so you are not piecing it together from texts and a notebook.',
  },
  {
    icon: MapPin,
    title: 'New customers find you',
    body: 'Buyers search by zip code, so people nearby who have never heard of you see what you grow.',
  },
  {
    icon: Banknote,
    title: 'Paid before you pick',
    body: 'Every order is paid in full when it is placed, so you harvest what has sold. No cash box, no making change and no chasing a payment: your earnings are deposited to your bank account every week.',
  },
  {
    icon: CalendarCheck,
    title: 'Your time is protected',
    body: `If a buyer cancels late or never turns up, you are paid a ${RESTOCKING_FEE} restocking fee and the produce goes back on your listing for someone else.`,
  },
  {
    icon: Tag,
    title: 'Free to list',
    body: `Posting is free, and you keep ${SELLER_KEEPS_PERCENT}% of every sale. We take ${SELLER_FEE} of what you sell and nothing when you sell nothing. There is no stall fee and no monthly charge.`,
  },
  {
    icon: SlidersHorizontal,
    title: 'You set the terms',
    body: 'Your prices, your quantities, your pickup days and times. Your street address stays private until an order is ready to collect.',
  },
];

const FOR_BUYERS: Reason[] = [
  {
    icon: Package,
    title: 'Farm Boxes, on your terms',
    body: 'Some farms offer a Farm Box: a box of whatever they are harvesting that week, on a set day. Sign up and pay per box, skipping or pausing in a couple of taps, or buy just one to try it. Your regular order gives a small grower steady sales they can plan around.',
    wide: true,
  },
  {
    icon: ShieldCheck,
    title: 'Your money is protected',
    body: 'We hold your payment until you collect. The farmer is paid when you hand over your pickup code, with the produce in your hands.',
  },
  {
    icon: Undo2,
    title: 'Refunded if it falls through',
    body: `If the farmer can't supply your order, you get everything back, the service fee included. Change your mind within ${FREE_CANCELLATION_HOURS} hours and the produce price is refunded.`,
  },
  {
    icon: Star,
    title: 'Know who grew it',
    body: 'Every farm has a profile showing how it grows, and reviews written by people who have picked up an order there.',
  },
  {
    icon: ShoppingCart,
    title: 'One basket, several farms',
    body: 'Fill your cart from as many growers as you like and pay once. The service fee is charged once per checkout, not per farm.',
  },
  {
    icon: MessageCircle,
    title: 'No back-and-forth',
    body: 'Your order is set aside for you. When it is ready you get one email with the address and the days and times you can come, and you can message the farmer from your order.',
  },
  {
    icon: UserCheck,
    title: 'No account needed',
    body: 'Check out as a guest in a minute, by card, Apple Pay or Google Pay.',
  },
];

function Reasons({ items }: { items: Reason[] }) {
  return (
    <ul className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
      {items.map(({ icon: Icon, title, body, wide }) => (
        <li
          key={title}
          className={`rounded-2xl p-5 shadow-sm border ${
            wide ? 'sm:col-span-2 bg-emerald-50 border-emerald-200' : 'bg-white border-gray-200'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 shrink-0 bg-emerald-100 text-emerald-700 rounded-xl flex items-center justify-center">
              <Icon className="w-5 h-5" aria-hidden="true" />
            </div>
            <h3 className="text-base font-bold text-gray-900">{title}</h3>
          </div>
          <p className="mt-3 text-sm text-gray-600 leading-relaxed">{body}</p>
        </li>
      ))}
    </ul>
  );
}

export default function WhyPage() {
  return (
    <div className="max-w-4xl mx-auto px-2 sm:px-6 py-8 sm:py-12">
      <Link href="/" className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:underline mb-8">
        <ArrowLeft className="w-4 h-4" /> Back to Home
      </Link>

      <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900">Why buy and sell here</h1>
      <p className="mt-4 text-lg text-gray-600 leading-relaxed">
        Buying food from a neighbor should be simple. Farm Fresh Direct takes care of the awkward parts (finding
        each other, agreeing on a time, and paying) so growers can get on with growing and buyers can get on with
        eating.
      </p>

      <section className="mt-12" aria-labelledby="why-sellers">
        <div className="flex items-center gap-2 text-emerald-700">
          <Sprout className="w-5 h-5" aria-hidden="true" />
          <p className="text-xs font-bold uppercase tracking-wide">For growers</p>
        </div>
        <h2 id="why-sellers" className="mt-1 text-2xl font-bold text-gray-900">
          More than a place to sell: your own online farm stand
        </h2>
        <Reasons items={FOR_SELLERS} />
        <Link
          href="/dashboard"
          className="mt-6 inline-flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold py-3 px-5 rounded-xl transition-colors"
        >
          Start selling <ArrowRight className="w-4 h-4" aria-hidden="true" />
        </Link>
      </section>

      <section className="mt-14" aria-labelledby="why-buyers">
        <div className="flex items-center gap-2 text-emerald-700">
          <ShoppingBag className="w-5 h-5" aria-hidden="true" />
          <p className="text-xs font-bold uppercase tracking-wide">For buyers</p>
        </div>
        <h2 id="why-buyers" className="mt-1 text-2xl font-bold text-gray-900">
          Fresh food from people you can meet
        </h2>
        <Reasons items={FOR_BUYERS} />
        <Link
          href="/browse"
          className="mt-6 inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold py-3 px-5 rounded-xl transition-colors"
        >
          Browse produce <ArrowRight className="w-4 h-4" aria-hidden="true" />
        </Link>
      </section>

      <section className="mt-14 bg-emerald-900 text-white rounded-2xl p-6 sm:p-8" aria-labelledby="why-cost">
        <h2 id="why-cost" className="text-2xl font-bold">
          What it costs
        </h2>
        <dl className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <dt className="text-sm font-semibold text-emerald-200">Growers</dt>
            <dd className="mt-1 text-2xl font-bold">You keep {SELLER_KEEPS_PERCENT}%</dd>
            <dd className="mt-1 text-sm text-emerald-100">
              A {SELLER_FEE} fee on what you sell. Nothing to list, nothing per month.
            </dd>
          </div>
          <div>
            <dt className="text-sm font-semibold text-emerald-200">Buyers</dt>
            <dd className="mt-1 text-2xl font-bold">{BUYER_FEE_LABEL} per checkout</dd>
            <dd className="mt-1 text-sm text-emerald-100">Shown before you pay, however many farms you buy from.</dd>
          </div>
        </dl>
        <p className="mt-6 text-sm text-emerald-100 leading-relaxed">
          The fees include card processing, which is paid out of them. After processing costs, Farm Fresh
          Direct keeps about {PLATFORM_KEEPS_CENTS_PER_DOLLAR} cents of every dollar of produce sold, from both
          fees together. That pays for holding payments safely, refunds when something goes wrong, and keeping
          the site running. The rest goes to the person who grew your food.{' '}
          <Link href="/faq" className="font-semibold text-white underline underline-offset-2">
            Read the full details in the FAQ
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
