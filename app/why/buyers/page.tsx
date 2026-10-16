import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  ShoppingBag,
  ShieldCheck,
  Undo2,
  Star,
  ShoppingCart,
  MessageCircle,
  UserCheck,
  Package,
} from 'lucide-react';
import { BUYER_FEE_LABEL, FREE_CANCELLATION_HOURS } from '@/lib/pricing';
import { Reasons, DetailBox, OtherSide, type Reason } from '@/components/WhyReasons';

export const metadata: Metadata = {
  title: 'Why Buy Here',
  description:
    'Fresh food from local growers, picked up near you. Your payment is held until you collect, and refunded if the farmer can’t supply your order.',
};

const FOR_BUYERS: Reason[] = [
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
    icon: Package,
    title: 'Farm Boxes, on your terms',
    body: 'Some farms offer a Farm Box: a box of whatever they are harvesting that week, on a set day. Sign up and pay per box, skipping or pausing in a couple of taps, or buy just one to try it.',
    wide: true,
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

export default function WhyBuyersPage() {
  return (
    <div className="max-w-4xl mx-auto px-2 sm:px-6 py-8 sm:py-12">
      <Link href="/why" className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:underline mb-8">
        <ArrowLeft className="w-4 h-4" /> Why Farm Fresh Direct
      </Link>

      <div className="flex items-center gap-2 text-emerald-700">
        <ShoppingBag className="w-5 h-5" aria-hidden="true" />
        <p className="text-xs font-bold uppercase tracking-wide">For buyers</p>
      </div>
      <h1 className="mt-1 text-3xl sm:text-4xl font-extrabold text-gray-900">Fresh food from people you can meet</h1>
      <p className="mt-4 text-lg text-gray-600 leading-relaxed">
        Buy straight from gardens and small farms near you, pay online, and pick it up at the farm. Here is why it works.
      </p>

      <Reasons items={FOR_BUYERS} />

      <DetailBox id="buy-how" title="How it works">
        <ol className="list-decimal pl-5 space-y-2">
          <li>Browse what&apos;s growing near you, and add things from one farm or several to your cart.</li>
          <li>Pay online. Your payment is held until you collect.</li>
          <li>Wait for the &quot;ready&quot; email: it has the pickup address and the days and times you can come.</li>
          <li>Collect your order, then show your QR code or give your pickup code to the farmer.</li>
        </ol>
      </DetailBox>

      <DetailBox id="buy-cost" title="What it costs">
        <p>
          The price the farmer sets, plus a service fee of <strong>{BUYER_FEE_LABEL}</strong>, charged once per checkout
          however many farms you buy from, and sales tax where it applies. You see every amount before you pay.
        </p>
        <p>
          What the service fee pays for: the card processing on your payment, and keeping the site running, so you have
          a safe place to buy from local growers.
        </p>
      </DetailBox>

      <div className="mt-10 flex flex-col sm:flex-row items-center gap-4">
        <Link
          href="/browse"
          className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold py-3 px-5 rounded-xl transition-colors"
        >
          Browse produce <ArrowRight className="w-4 h-4" aria-hidden="true" />
        </Link>
        <p className="text-sm text-gray-600">
          Questions? See the{' '}
          <Link href="/faq" className="font-semibold text-emerald-800 underline">
            FAQ
          </Link>
          .
        </p>
      </div>

      <OtherSide href="/why/sellers" text="Grow something? See why people sell here" />
    </div>
  );
}
