import type { Metadata } from 'next';
import Link from 'next/link';
import { HelpCircle } from 'lucide-react';
import { BUYER_FEE_LABEL, SELLER_FEE_RATE } from '@/lib/pricing';
import { PRODUCE_ONLY_NOTICE } from '@/lib/categories';
import { SELLER_READY_DAYS, BUYER_PICKUP_DAYS, AUTO_CANCEL_DAYS } from '@/lib/pickupRules';

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
      'Online at checkout, by card, Apple Pay or Google Pay. Payments are processed by Stripe. Every order is paid in full up front, so you never need to bring cash to a pickup.',
  },
  {
    question: 'Can I order part of a unit, like half a pound?',
    answer:
      'No. Orders are in whole units of whatever the farmer lists: whole pounds, whole dozens, whole bunches. If a farmer lists in ounces, you can order any whole number of ounces.',
  },
  {
    question: 'Are there any fees?',
    answer: `Buyers pay a service fee of ${BUYER_FEE_LABEL} on top of the produce price. The fee is charged once per checkout, however many items are in your cart. Where sales tax applies, it is added too. You'll see the exact amounts at checkout before you pay.`,
  },
  {
    question: 'Can I buy from more than one farm at once?',
    answer:
      'Yes. Add items from as many listings and farms as you like to your cart, then pay for everything in one checkout. Each farm is still a separate pickup, at its own address, and you get one pickup code per farm that covers everything you bought from it.',
  },
  {
    question: "What if only some of my items are ready, or one gets cancelled?",
    answer:
      "Each item is handled on its own. You're emailed as each one is ready, and you can collect them on different days. A pickup code only works for one visit: if you collect part of what you bought from a farm, we email you a new code for the rest. If a farmer has to cancel or reduce one item, only that item is refunded and the rest of your order carries on as normal.",
  },
  {
    question: 'When does the farmer get my money?',
    answer:
      "Not until you've picked up your order. We hold your payment and only release it to the farmer when they enter the pickup code you give them at pickup.",
  },
  {
    question: 'What is the pickup code?',
    answer:
      "A code you receive when you order, shown on your order page as both a QR code and a short code. Once your produce is in your hands, let the farmer scan the QR code or read them the short code — it confirms the handover and releases their payment. Don't share either before then, by text, phone or email.",
  },
  {
    question: 'Where and when do I pick up?',
    answer:
      "Listings show the farmer's city and zip code, and the days and times they're usually available, and that's what you see when you order. The full pickup address comes in our \"ready for pickup\" email, along with the days and times you can come and any instructions. Many sellers are home gardeners, so we only share their address once there's something to collect.",
  },
  {
    question: 'Can I find out when a farm has something new?',
    answer:
      "Yes, with an account. Click Follow This Farm on a farm's page, a listing or one of your orders, then open Followed Farms from the My Account menu to see what each of your farms has for sale, with new listings marked. We don't send emails about it.",
  },
  {
    question: 'How do I contact the farmer?',
    answer:
      "Use Message the Farmer on your order page. We email them your message and they reply the same way, so neither of you has to share an email address or phone number. It's for things like running late or finding the right gate; if something has gone wrong, use Report a problem instead, which comes to us.",
  },
  {
    question: 'The farmer marked my order as picked up, but I never got it. What do I do?',
    answer:
      "Your order page asks you to confirm each picked-up item. Choose No, I Didn't Get It and tell us what happened. That comes straight to us, and we'll look into it with you and the farmer.",
  },
  {
    question: 'How long do I have to pick up?',
    answer: `${BUYER_PICKUP_DAYS} days from the "ready for pickup" email, which gives the exact date. We send a reminder the day before. If you can't make it, cancel from your order page; an order that isn't collected in time can be closed as not picked up, with a restocking fee.`,
  },
  {
    question: 'How long does the farmer have to get my order ready?',
    answer: `${SELLER_READY_DAYS} days from your order, or from the listing's harvest date if the crop isn't ready yet. Your order page shows the date. If the farmer misses it, you can cancel for a full refund including the service fee, and an order that still isn't ready after ${AUTO_CANCEL_DAYS} days is cancelled and refunded automatically.`,
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
        Cancel the order as early as you can, using the <strong>Cancel this item</strong> button on your
        order page (in My Orders, or the link in your confirmation email). You're refunded what you paid for
        the produce; the service fee isn't refunded. Cancel within 48 hours of ordering and that's all. After
        48 hours the farmer also keeps a {NO_SHOW_FEE} restocking fee. If you can't cancel it yourself,{' '}
        <Link href="/contact" className="font-semibold text-emerald-800 underline">
          contact us
        </Link>
        . If a farmer reports that you didn't pick up an order, we email you and you have 48
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
        If there's a problem at pickup, don't hand over your pickup code — that's what releases your payment.
        Then use <strong>Report a problem</strong> on that item in your order page and tell us what happened.
        It comes to us, not to the farmer. You can also{' '}
        <Link href="/contact" className="font-semibold text-emerald-800 underline">
          contact us
        </Link>
        .
      </>
    ),
  },
];

const SELLER_FAQS: Faq[] = [
  {
    question: 'Who can sell on Farm Fresh Direct?',
    answer:
      "Home gardeners and small local farms. You're responsible for making sure what you sell is allowed where you live — see the next three questions.",
  },
  {
    question: 'What can I list?',
    answer: `${PRODUCE_ONLY_NOTICE} That also rules out things like meat, dairy, baked goods, crafts and anything that isn't food. If you're not sure whether something fits, contact us before listing it.`,
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
      "At pickup, tap Buyer Is Here: Scan Code on the order in your Seller Dashboard, then scan the QR code on the buyer's phone or type their pickup code. If the buyer bought several items from you, tick the ones you're handing over. That releases your payment to your Stripe account, and Stripe deposits it to your bank once a week, on Fridays. Each open order shows the exact amount you'll receive.",
  },
  {
    question: 'Is my address public?',
    answer:
      "No. Listings show only your city and zip code, and that's all a buyer sees when they order. Your pickup address is sent to a buyer only when you mark their order ready for pickup.",
  },
  {
    question: "What if I end up with less produce than I listed?",
    answer:
      'Use Cancel / Adjust on the order in your dashboard to reduce the quantity or cancel it. The buyer is refunded automatically, and your payout is adjusted to match.',
  },
  {
    question: 'How quickly do I have to get an order ready?',
    answer: `Within ${SELLER_READY_DAYS} days of the order, or of your listing's harvest date if that's later. Each order in your dashboard shows its date, and we email a reminder the day before. After that date the buyer can cancel for a full refund, and an order still not marked ready after ${AUTO_CANCEL_DAYS} days is cancelled and refunded automatically. Once you mark an order ready, the buyer has ${BUYER_PICKUP_DAYS} days to collect it, so offer pickup times on those days.`,
  },
  {
    question: 'How do I tell buyers when I am available for pickup?',
    answer:
      'Set your usual pickup days and times in Farm Profile. Shoppers see them on your listings and at checkout, before they buy, so they only order if the times work. The same days and times are ticked for you when you mark an order ready, and you can change them for that order. With them saved, you can also mark all your waiting orders ready in one go.',
  },
  {
    question: 'How do I contact a buyer?',
    answer:
      "Use Message Buyer on the order in your Seller Dashboard. We email the buyer your message and they reply the same way. You won't see the buyer's email address while an order is open; it appears in your Sales History once the order is picked up or closed.",
  },
  {
    question: 'What happens if a buyer cancels?',
    answer: `Buyers can cancel an order themselves any time before pickup. We email you straight away so you don't prepare it, and the quantity goes back on your listing. If they cancel within 48 hours of ordering, there's no payment to you. If they cancel later than that, you're paid a ${NO_SHOW_FEE} restocking fee.`,
  },
  {
    question: "What if a buyer doesn't show up?",
    answer: (
      <>
        The buyer has {BUYER_PICKUP_DAYS} days to collect an order after you mark it ready. Once those days
        have passed, a Buyer Did Not Show button appears on the order in your Seller Dashboard. The buyer is
        emailed and has 48 hours to respond; if they don't, the order is closed automatically, and if
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
      "We're glad when a sale here turns into a lasting relationship with a buyer. Any order placed through the site needs to be paid for through the site, and we hope you'll keep listing here when you have produce to share.",
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
