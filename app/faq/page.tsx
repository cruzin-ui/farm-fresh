import type { Metadata } from 'next';
import Link from 'next/link';
import { HelpCircle } from 'lucide-react';
import { BUYER_FEE_LABEL, SELLER_FEE_RATE } from '@/lib/pricing';

export const metadata: Metadata = { title: 'FAQ' };

const SELLER_FEE = `${SELLER_FEE_RATE * 100}%`;
// Mirrors NO_SHOW_RESTOCKING_RATE in lib/orderActions.ts (a server-only file).
const NO_SHOW_FEE = '10%';

type Faq = { question: string; answer: React.ReactNode };

const BUYER_FAQS: Faq[] = [
  {
    question: 'Do I need an account to buy?',
    answer:
      "No. You can check out as a guest with just an email address, which is where we send your confirmation and pickup code. Creating an account adds a My Orders page where you can see all your orders in one place.",
  },
  {
    question: 'How do I pay?',
    answer:
      'By card, online, when you reserve. Payments are processed by Stripe. Every order is paid in full up front, so you never need to bring cash to a pickup.',
  },
  {
    question: 'Can I order part of a unit, like half a pound?',
    answer:
      'No. Orders are in whole units of whatever the farmer lists: whole pounds, whole dozens, whole bunches. If a farmer lists in ounces, you can order any whole number of ounces.',
  },
  {
    question: 'Are there any fees?',
    answer: `Buyers pay a service fee of ${BUYER_FEE_LABEL} on top of the produce price. You'll see the exact amount at checkout before you pay.`,
  },
  {
    question: 'When does the farmer get my money?',
    answer:
      "Not until you've picked up your order. We hold your payment and only release it to the farmer when they enter the pickup code you give them at pickup.",
  },
  {
    question: 'What is the pickup code?',
    answer:
      "A code you receive when you order. Give it to the farmer once your produce is in your hands — it confirms the handover and releases their payment. Don't share it before then, by text, phone or email.",
  },
  {
    question: 'Where and when do I pick up?',
    answer:
      "Listings show the farmer's city and zip code. You get the full pickup address once you've paid. Wait for our \"ready for pickup\" email before heading over — it includes the farmer's hours and any instructions.",
  },
  {
    question: "I've lost my pickup code. How do I find it?",
    answer: (
      <>
        It's in your order confirmation email, and in the "ready for pickup" email. If you have an account, it's
        also on your My Orders page. Guests can use the link in their confirmation email. Still stuck?{' '}
        <Link href="/contact" className="font-semibold text-emerald-800 underline">
          Contact us
        </Link>
        .
      </>
    ),
  },
  {
    question: "What if the farmer doesn't have what I ordered?",
    answer:
      "Harvests are unpredictable. If a farmer has less than expected they can reduce or cancel your order, and you're refunded automatically for whatever you don't receive. We'll email you when that happens.",
  },
  {
    question: "What if I can't make the pickup?",
    answer: (
      <>
        Please{' '}
        <Link href="/contact" className="font-semibold text-emerald-800 underline">
          contact us
        </Link>{' '}
        as early as you can. If a farmer reports that you didn't pick up an order, we email you and you have 48
        hours to tell us if that's wrong, using the button in that email. If an order is never collected, the
        service fee isn't refunded and the farmer keeps a {NO_SHOW_FEE} restocking fee; the rest of what you
        paid for the produce is refunded.
      </>
    ),
  },
  {
    question: "Something was wrong with my order. What do I do?",
    answer: (
      <>
        If there's a problem at pickup, don't hand over your pickup code — that's what releases your payment.{' '}
        <Link href="/contact" className="font-semibold text-emerald-800 underline">
          Contact us
        </Link>{' '}
        with your order details and we'll help sort it out.
      </>
    ),
  },
];

const SELLER_FAQS: Faq[] = [
  {
    question: 'Who can sell on Farm Fresh Direct?',
    answer:
      "Home gardeners and small local farms. You're responsible for making sure what you sell is allowed where you live — see the next two questions.",
  },
  {
    question: 'Are there rules about what I can sell?',
    answer: (
      <>
        <p>
          Yes, and they depend on your state. Whole, uncut fruits and vegetables are the simplest. Other items
          often have their own state rules, for example:
        </p>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li>
            <strong>Eggs:</strong> states commonly set rules on refrigeration, carton labeling and reusing
            cartons, and may require a license above a certain flock size or number of dozens sold.
          </li>
          <li>
            <strong>Seeds:</strong> states commonly require labeling (such as variety, germination rate and test
            date) and sometimes a seed dealer permit. Seed saved from patented or protected varieties
            generally can't be resold.
          </li>
          <li>
            <strong>Honey, jam and other prepared foods:</strong> these usually fall under your state's
            "cottage food" laws, which decide what may be made in a home kitchen and how it must be labeled.
            Some states don't allow items like pickles, salsa or other canned goods at all.
          </li>
        </ul>
        <p className="mt-2">
          Before you list anything beyond fresh produce, check with your state's department of agriculture or
          health department. This list is general information, not legal advice, and it isn't complete.
        </p>
      </>
    ),
  },
  {
    question: 'Who is responsible for making sure my products are legal to sell?',
    answer: (
      <>
        <p>
          You are. As the seller, you're responsible for knowing and following the federal, state and local
          laws that apply to what you sell, including any licenses, permits, labeling and food-safety
          requirements.
        </p>
        <p className="mt-2">
          Farm Fresh Direct is a marketplace that connects buyers and sellers. We don't inspect, test, certify
          or approve products, and we aren't responsible for items that are sold in violation of the law. We
          may remove a listing if we learn it isn't permitted.
        </p>
        <p className="mt-2">
          You'll be asked to agree to our{' '}
          <Link href="/seller-terms" className="font-semibold text-emerald-800 underline">
            Seller Terms
          </Link>{' '}
          before posting your first listing.
        </p>
      </>
    ),
  },
  {
    question: 'Do I have to pay taxes on what I sell here?',
    answer: (
      <>
        <p>
          Money you earn from sales is generally taxable income, and reporting it is your responsibility. That
          includes any income tax, self-employment tax, and any state or local taxes, licenses or permits that
          apply to you as a seller.
        </p>
        <p className="mt-2">
          Farm Fresh Direct doesn't withhold taxes from your payouts and can't give tax advice. If your sales
          through the platform reach the IRS reporting threshold for the year, you'll receive a 1099 tax form
          showing them, and the same figures are reported to the IRS. The tax details you enter when you set up
          payouts are what that form uses, so keep them accurate.
        </p>
        <p className="mt-2">
          Your Sales History in the Seller Dashboard is a record of your completed sales. If you're unsure
          what you owe, talk to a tax professional.
        </p>
      </>
    ),
  },
  {
    question: 'What does it cost to sell?',
    answer: `Posting is free. We keep a ${SELLER_FEE} seller fee from each completed sale, taken out of your payout. There are no monthly or listing fees.`,
  },
  {
    question: 'What do I need to get started?',
    answer:
      'A farm profile and a connected payout account. Payouts are set up through Stripe from the Payouts & Settings tab of your Seller Dashboard. Buyers can only purchase from you once that is finished.',
  },
  {
    question: 'How and when do I get paid?',
    answer:
      "At pickup, ask the buyer for their pickup code and enter it in your Seller Dashboard. That releases your payment to your Stripe account, and Stripe deposits it to your bank on its regular schedule. Each open order shows the exact amount you'll receive.",
  },
  {
    question: 'Is my address public?',
    answer:
      'No. Listings show only your city and zip code. Your pickup address is shared with a buyer only after they have paid for an order.',
  },
  {
    question: "What if I end up with less produce than I listed?",
    answer:
      'Use Cancel / Adjust on the order in your dashboard to reduce the quantity or cancel it. The buyer is refunded automatically, and your payout is adjusted to match.',
  },
  {
    question: "What if a buyer doesn't show up?",
    answer: (
      <>
        Once you've marked an order ready, you can report a no-show with the Buyer Did Not Show button in your
        Seller Dashboard. The buyer is emailed and has 48 hours to respond; if they don't, the order is closed automatically, and if
        they do, we review it. When an order is closed as a no-show you receive a{' '}
        {NO_SHOW_FEE} restocking fee, and the quantity goes back on your listing. You can also{' '}
        <Link href="/contact" className="font-semibold text-emerald-800 underline">
          contact us
        </Link>
        .
      </>
    ),
  },
  {
    question: 'Can I sell partial amounts, like half a pound?',
    answer:
      'Quantities are whole numbers. Buyers order whole units (1 lb, 2 lbs, and so on), so listings are entered in whole units too. To sell smaller amounts, list in a smaller unit, such as ounces instead of pounds.',
  },
  {
    question: 'Can I post the same crop more than once?',
    answer:
      'One listing per crop and variety at a time. If you have more to sell, edit the listing and raise the quantity — it keeps everything in one place for buyers.',
  },
  {
    question: 'Can buyers and I deal directly after we meet?',
    answer:
      "Yes. Our mission is to connect you with local buyers, and if that turns into a lasting relationship, that's a good outcome. We hope you'll keep listing here when you have produce to share.",
  },
];

function FaqGroup({ title, faqs }: { title: string; faqs: Faq[] }) {
  return (
    <section>
      <h2 className="text-xl font-bold text-gray-900 mb-3">{title}</h2>
      <div className="space-y-2">
        {faqs.map((faq) => (
          <details key={faq.question} className="bg-white border border-gray-200 rounded-xl shadow-sm group">
            <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-gray-900">
              {faq.question}
            </summary>
            <div className="px-4 pb-4 text-sm text-gray-700 leading-relaxed">{faq.answer}</div>
          </details>
        ))}
      </div>
    </section>
  );
}

export default function FaqPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
          <HelpCircle className="w-7 h-7 text-emerald-700" aria-hidden="true" /> Frequently Asked Questions
        </h1>
        <p className="text-sm text-gray-600 mt-1">
          How buying and selling on Farm Fresh Direct works. Can't find your answer?{' '}
          <Link href="/contact" className="font-semibold text-emerald-800 underline">
            Contact us
          </Link>
          .
        </p>
      </div>

      <FaqGroup title="For buyers" faqs={BUYER_FAQS} />
      <FaqGroup title="For sellers" faqs={SELLER_FAQS} />
    </div>
  );
}
