import type { Metadata } from 'next';
import Link from 'next/link';
import { SELLER_FEE_RATE, FREE_CANCELLATION_HOURS } from '@/lib/pricing';
import { SELLER_TERMS_VERSION } from '@/lib/sellerTerms';
import { OPERATOR_DESCRIPTION } from '@/lib/legal';
import { LISTING_CATEGORIES } from '@/lib/categories';
import { SELLER_READY_DAYS, BUYER_PICKUP_DAYS, AUTO_CANCEL_DAYS } from '@/lib/pickupRules';
import { CHARGE_DAYS_BEFORE, CONFIRM_DAYS_BEFORE } from '@/lib/csaSchedule';
import { ORDER_CUTOFF_HOUR, formatTime } from '@/lib/appearances';
import {
  HOST_PACKING_LABEL,
  SHARED_BOX_CANCEL_LIMIT,
  SHARED_BOX_WINDOW_DAYS,
  SHARED_BOX_MAX_PARTNERS,
  SHARED_BOX_MILES,
} from '@/lib/sharedBoxTerms';

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
            inspections, labeling, packaging, food-safety and plant-health requirements. Rules for items such as
            eggs, honey, jam, other prepared foods and plants vary by state; it is your responsibility to check
            them before you list.
          </p>
          <p className="mt-2">
            <strong>Your farm&apos;s web address.</strong> You may choose a short web address for your farm
            page. It must reflect your own farm and must not use someone else&apos;s name or brand. You can set
            it once; we may change or remove an address that is misleading or that we need for the site.
          </p>
          <p className="mt-2">
            <strong>What you can list.</strong> Farm Fresh Direct is for things grown locally. You may only
            list items that belong in one of our categories ({LISTING_CATEGORIES.join(', ')}), and that you
            grew, raised or made yourself. Mushrooms must be ones you cultivated; mushrooms gathered from the
            wild may not be listed. Plants must be ones you grew or propagated yourself; plants dug up or taken
            from the wild may not be listed, and neither may any plant that the law where you sell does not allow
            to be sold, such as a prohibited invasive or noxious species. Cut flowers and plants are the only
            categories that are not food. Seeds, meat, dairy, baked goods, crafts and anything else outside our
            categories may not be listed. We may remove any listing that does not belong, without notice, and
            cancel and refund any open orders for it.
          </p>
          <p className="mt-2">
            <strong>Plants.</strong> Many states require a license, registration or inspection to sell plants,
            and restrict pests, diseases and certain species. Some native plants are protected by state law and
            may only be sold with a permit, tag or other paperwork. Check your state&apos;s agriculture
            department regulations before you list a plant. You are responsible for meeting these requirements,
            and for any permit or tag a plant needs. If you mark a plant as native, it must be native to the
            state shown on your listing.
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
            &quot;organic&quot;, that you are legally entitled to make. The same goes for what you show buyers on your
            farm page about what you&apos;re growing: list only crops you are really growing, with your honest best
            guess of when they&apos;ll be ready. We may remove anything that is inaccurate or misleading.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-1">4. Fees and payment</h2>
          <p>
            Posting is free. Farm Fresh Direct keeps a seller fee of {SELLER_FEE} of the item price on each
            completed sale. Buyers pay online, and we hold the payment until pickup. Your payout for an item is
            released when you scan or enter the buyer&apos;s pickup code and mark that item as handed over, and
            is paid to your connected payout account. Only mark an item as handed over if the buyer has
            received it. Do not collect cash or any additional payment at pickup, and do not arrange for an
            order made through the site to be paid for in any other way. You may not buy from your own
            listings.
          </p>
          <p className="mt-2">
            If a buyer tells us they did not receive an item you marked as handed over, or a buyer&apos;s bank
            disputes a payment, we may hold the payout for that order, or recover a payout already made, while
            we look into it and if we find the item was not supplied as described.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-1">5. Fulfilling orders</h2>
          <p>
            You agree to have the items you list available for pickup at the address and times you give the
            buyer. You must mark each order ready for pickup within {SELLER_READY_DAYS} days of the order, or of
            your listing&apos;s harvest date if that is later. If you do not, the buyer may cancel for a full
            refund, and an order still not marked ready after {AUTO_CANCEL_DAYS} days is cancelled and refunded
            automatically; you are not paid for it. Once you mark an order ready, the buyer has{' '}
            {BUYER_PICKUP_DAYS} days to collect it, and you must offer pickup times within those days. You may
            report an order as not collected only after that time has passed. If you cannot fulfill an order in
            full, reduce or cancel it through your Seller Dashboard so
            the buyer is refunded. When you cancel or reduce any part of a buyer&apos;s order, the buyer may
            cancel the rest of that order for a full refund, and you are not paid a restocking fee for it. If
            several of your orders in a short period are cancelled by you or not made ready, we may pause your
            listings automatically until we have been in touch with you. If your cancellations had a good reason, such as a crop lost to weather, contact us: we may reset the count that applies to these limits. Every cancellation, and every reset, stays on your record. If a buyer does not collect an order, we may close it and pay you a restocking
            fee. A buyer may cancel an order before pickup: if they cancel within {FREE_CANCELLATION_HOURS} hours of ordering you are
            not paid for it, and if they cancel later you are paid a restocking fee.
          </p>
          <p className="mt-2">
            <strong>Contacting buyers.</strong> Use the messaging on each order to arrange a pickup. A
            buyer&apos;s email address is shown to you once their order is picked up or closed. Use buyers&apos;
            contact details only for the orders they placed with you, and not for marketing unless they have
            agreed to it.
          </p>
        </section>

        <section id="csa">
          <h2 className="text-lg font-bold text-gray-900 mb-1">6. Farm Boxes and Flower Boxes (CSA-style subscriptions)</h2>
          <p>
            You can offer a Farm Box, which works like a CSA: a box on a set day, every week or every other week, through a season you
            choose. A Flower Box works the same way and holds only cut flowers you grew; it is taxed like other non-food items. Members pay for each box separately, charged to their saved card {CHARGE_DAYS_BEFORE} days
            before pickup. Each paid box is an ordinary order: the same {SELLER_FEE} seller fee applies, you mark it
            ready and enter the member&apos;s pickup code, and you are paid when it is collected. Everything in
            section 5 applies to boxes, with the box&apos;s pickup date as its ready-by date.
          </p>
          <ul className="list-disc pl-5 space-y-1.5 mt-2">
            <li>
              <strong>Describe the box honestly</strong>, and give members a box of fair value for its price each
              week. Your weekly note should say what is in it.
            </li>
            <li>
              <strong>If you can&apos;t provide a box,</strong> call that week off in your Seller Dashboard before it
              is charged; members are told and are not charged. After it is charged, cancel each box in your
              Orders; members are refunded in full, and it counts as a cancellation by you.
            </li>
            <li>
              <strong>Buyers can also buy a single box</strong> for your next pickup that hasn&apos;t been charged
              yet, without signing up. It is an ordinary order, and counts toward any member limit you set.
            </li>
            <li>
              <strong>Members can skip, pause or cancel</strong> at any time before a box is charged. Members who
              joined at an earlier price keep it; a new price applies to new members only. The pickup day, how
              often, and the start of the season can&apos;t be changed once anyone has joined.
            </li>
            <li>
              <strong>Ending a Farm Box early</strong> cancels every membership; tell members why. Boxes already
              paid for must still be provided or cancelled and refunded.
            </li>
          </ul>
        </section>

        <section id="shared">
          <h2 className="text-lg font-bold text-gray-900 mb-1">7. Shared Farm Boxes</h2>
          <p>
            A shared box is a Farm Box or Flower Box filled by a host farm together with up to {SHARED_BOX_MAX_PARTNERS} partner
            farms within {SHARED_BOX_MILES} miles of it. Buyers join or buy from the host and pick up at the host farm. Everything
            in section 6 applies to a shared box, and section 5 applies to the host for each paid box. When you set up or join a
            shared box you also agree to a short written summary of these rules, which is saved with your place in the box.
          </p>
          <ul className="list-disc pl-5 space-y-1.5 mt-2">
            <li>
              <strong>Who can take part.</strong> Any farm that has finished setting up payouts and is not paused from selling,
              unless in the last {SHARED_BOX_WINDOW_DAYS} days it has had {SHARED_BOX_CANCEL_LIMIT} or more orders cancelled by
              the farm (a missed shared-box delivery counts as one), or had a buyer&apos;s bank dispute a payment. We may take a farm out of a shared box if this stops being
              true.
            </li>
            <li>
              <strong>Your part.</strong> Each farm says what it puts in every box and sets the price of that part; the box price
              is all the parts added together. Describe your part honestly and supply it at fair value. Once buyers have joined, the
              farms in a box and the price of each part can&apos;t change.
            </li>
            <li>
              <strong>Each week.</strong> Partners confirm their part for each pickup by the end of the day{' '}
              {CONFIRM_DAYS_BEFORE} days before it. A partner that doesn&apos;t confirm in time, or says it can&apos;t, is left out
              of that week&apos;s box: buyers pay less and that partner is not paid for it. Partners bring their part for every
              paid box to the host by the drop-off time the host sets. The host receives each part, keeps it fresh and, where
              needed, cold, packs every box, and hands boxes over only with the buyer&apos;s pickup code.
            </li>
            <li>
              <strong>Payment.</strong> At pickup each farm is paid its own part, less the {SELLER_FEE} seller fee. Each partner
              pays the host a packing fee of {HOST_PACKING_LABEL} of its part, taken from its payout automatically. A restocking
              fee for a box a buyer cancels late or doesn&apos;t collect is shared between the farms in proportion to their parts.
            </li>
            <li>
              <strong>A part that doesn&apos;t arrive.</strong> The host must report it in the Seller Dashboard before handing out
              the boxes. Buyers are then refunded that part or, if the host offered to when setting up the box, the host fills in
              with its own produce of at least the same value and is paid for that part instead. The partner is not paid for it,
              and it counts as a cancellation by the partner under section 5. Reporting a part as missing when it arrived is a
              breach of these terms.
            </li>
            <li>
              <strong>Your products, your responsibility.</strong> Each farm is responsible for its own products meeting every law
              that applies to them, including licenses, labeling and food-safety rules. Eggs must be clean and uncracked, kept at
              45°F or below until pickup, and packed and labeled as your state requires; check your state&apos;s agriculture
              department regulations before adding eggs. The host must handle other farms&apos; products with reasonable care while
              it has them. Farms should settle disagreements between themselves fairly; we may look into a report and adjust
              refunds or payouts.
            </li>
            <li>
              <strong>Leaving.</strong> A partner may leave a shared box at any time, and the host may take a partner out. The box
              carries on without that part at a lower price; members are told and may cancel at no cost. Boxes already paid for
              still include that part, and the partner must still supply it. The host may end the box as in section 6.
            </li>
          </ul>
        </section>

        <section id="markets">
          <h2 className="text-lg font-bold text-gray-900 mb-1">8. Markets, events and pickup there</h2>
          <p>
            You can post the farmers markets, festivals, pop-ups and other events you&apos;ll be at. They appear on your farm
            page, and buyers who follow you and asked to hear about your markets are emailed when you post (at most one such
            email a day) and the day before each date. The rules for listings apply to these posts: they must be accurate,
            and we may remove a post that is inaccurate, misleading or breaks these terms. Give the venue&apos;s address, never
            a private one.
          </p>
          <ul className="list-disc pl-5 space-y-1.5 mt-2">
            <li>
              <strong>Ordering ahead.</strong> If you let buyers order ahead for pickup at a market or event, ordering for a
              date closes at {formatTime(`${ORDER_CUTOFF_HOUR}:00`)} the day before. Bring every order for that date, mark
              it ready there, and hand it over only when the buyer gives you their pickup code, as at your farm. The buyer
              has until the event ends to collect it; after that you may report a no-show under section 5.
            </li>
            <li>
              <strong>If you can&apos;t be there,</strong> mark that date as not there, or take the post down, in your Seller
              Dashboard as soon as you know. Orders for pickup there are then cancelled and refunded in full, and count as
              cancellations by you under section 5. While orders are booked, the place, dates and times of a post can&apos;t
              be changed.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-1">9. Removing listings and accounts</h2>
          <p>
            We may remove a listing, cancel and refund an order, or suspend a seller&apos;s account if we believe
            a product is not permitted, a listing is inaccurate, or these terms have been broken.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-1">10. Your responsibility for claims</h2>
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
