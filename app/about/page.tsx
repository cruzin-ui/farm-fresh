import type { Metadata } from 'next';
import Link from 'next/link';
import { SELLER_KEEPS_PERCENT } from '@/lib/pricing';
import { ArrowLeft } from 'lucide-react';

// Where the Mission letter's figures come from (each is linked in the text).
const SOURCES = {
  // USDA ERS: farm share 11.8 cents of each food dollar in 2024 (revised method).
  foodDollar: 'https://www.ers.usda.gov/data-products/food-dollar-series/quick-facts',
  // USDA 2022 Census of Agriculture: 1,900,487 farms, down from 2,042,220 in 2017.
  farmsLost: 'https://www.fb.org/intel/markets/over-140-000-farms-lost-in-5-years',
  // Congressional Research Service on USDA low-income, low-access areas.
  foodDesert: 'https://www.everycrsreport.com/reports/IF11841.html',
  // 55 food deserts in Maricopa County, 43 in Phoenix (older USDA locator).
  phoenixDeserts: 'https://coppercourier.com/local/local-news/maricopa-county-food-deserts/',
  // $43 of every $100 at a local business stays local, $13 at a non-local one.
  localFirst: 'https://localfirstaz.com/find',
};
const EXTERNAL = { target: '_blank', rel: 'noopener noreferrer' } as const;
const LINK = 'underline decoration-emerald-300 underline-offset-2 hover:text-emerald-200';

export const metadata: Metadata = {
  title: 'The Mission',
  description: 'Why Farm Fresh Direct exists: breaking the food system loop, food deserts, and keeping food dollars local.',
};

export default function AboutPage() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <Link href="/" className="inline-flex items-center gap-1 text-sm font-medium text-green-700 hover:underline mb-8">
        <ArrowLeft className="w-4 h-4" /> Back to Home
      </Link>

      {/* The Mission: a letter from the founder. Each claim links to where its
          number comes from. */}
      <section
        id="mission"
        className="bg-emerald-800 text-white rounded-3xl px-6 py-10 sm:px-12 sm:py-12 shadow-sm scroll-mt-24"
      >
        <h1 className="text-3xl sm:text-4xl font-bold text-center">The Mission</h1>

        <div className="mt-8 max-w-2xl mx-auto space-y-5 text-base sm:text-lg leading-relaxed text-white/95">
          <p>
            Thank you for being here. I started Farm Fresh Direct because I believe the way most of us buy food is
            broken, and that the fix is closer to home than we think.
          </p>

          <h3 className="pt-4 text-2xl font-bold text-center text-white">The food system loop</h3>
          <p>
            Right now, most of us are caught in a loop. We buy our food from large chains, and much of that produce
            was picked early and shipped hundreds or thousands of miles to reach the shelf. Most of the money we spend
            leaves our community. Of every dollar Americans spend on food,{' '}
            <a href={SOURCES.foodDollar} {...EXTERNAL} className={LINK}>
              only about 12 cents goes back to the farm
            </a>
            ; the rest goes to processing, shipping, packaging and retail. Small local growers can&apos;t compete with
            that scale, so fewer of them keep growing. Between 2017 and 2022 alone, the United States{' '}
            <a href={SOURCES.farmsLost} {...EXTERNAL} className={LINK}>
              lost more than 140,000 farms
            </a>
            . With fewer local growers, we depend even more on the long supply chain, and the loop starts again.
          </p>

          <h3 className="pt-4 text-2xl font-bold text-center text-white">Food deserts</h3>
          <p>
            For some neighbors, that loop has left a hole. A{' '}
            <a href={SOURCES.foodDesert} {...EXTERNAL} className={LINK}>
              food desert
            </a>{' '}
            is an area where many people live far from a full grocery store: more than a mile away in a
            city, or more than ten miles away in the country. In those places, fresh fruit and vegetables are hard to
            find, and the nearest food is often a convenience store or a fast-food counter. The Phoenix area has{' '}
            <a href={SOURCES.phoenixDeserts} {...EXTERNAL} className={LINK}>
              dozens of neighborhoods like this
            </a>
            .
          </p>
          <p>
            We can&apos;t build a supermarket on every corner. But nearly every neighborhood already has people
            growing food: in backyards, community gardens, but especially on small farms. Farm Fresh Direct lets any
            of those growers become a fresh-food stop for their neighbors. A tomato grown three streets away
            doesn&apos;t need a truck, a warehouse or a store. It needs a way for you to find it.
          </p>

          <h3 className="pt-4 text-2xl font-bold text-center text-white">Local dollars</h3>
          <p>
            The impact of money spent in your own community is hard to overstate. According to{' '}
            <a href={SOURCES.localFirst} {...EXTERNAL} className={LINK}>
              Local First Arizona
            </a>
            , for every $100 you spend at a locally owned business, about $43 stays in the local economy, compared
            with about $13 at a business owned elsewhere. That money pays local wages, gets spent at other local
            shops, and stays working where you live.
          </p>
          <p>
            Every week, our community sends a large share of its grocery money to national corporations, even when a
            better local option is just down the street. Local farmers and gardeners are small businesses, and
            important ones. Without them, we lose more than fresh food. We lose farmland to development, the
            knowledge of how to grow food in our own climate, and the ability to feed ourselves when the long supply
            chain breaks down, as it did when grocery shelves went empty in 2020.
          </p>
          <p>
            That&apos;s why Farm Fresh Direct is built for growers first. It&apos;s{' '}
            <Link href="/why/sellers" className={LINK}>
              free to list, and sellers keep {SELLER_KEEPS_PERCENT}% of every sale
            </Link>
            . Every order is paid up front, so growers harvest what has already sold, and they&apos;re protected when
            a buyer doesn&apos;t show. Each grower gets their own online farm stand, pre-orders for their farmers
            market stall, Farm Boxes they can run alone or with neighboring farms, and simple records for tax time.
            We want to take away the cost, the technology and the paperwork that keep good growers from selling.
          </p>

          <h3 className="pt-4 text-2xl font-bold text-center text-white">The goal</h3>
          <p>
            We want to bridge the gap in the food system, so there is one less barrier between your community and
            delicious, healthy, locally grown food. Every order you place keeps a neighbor growing, and keeps your
            dollars close to home.
          </p>
          <p>
            Thank you for being part of it. I hope you&apos;ll find a grower you love and keep going back to them.
          </p>

          <p className="pt-2">With gratitude,</p>
          <p>
            <span className="font-bold">Bryant Cruz</span>
            <br />
            Founder, Farm Fresh Direct
          </p>
        </div>
      </section>
    </div>
  );
}