import Link from 'next/link';
import { Sprout, ShoppingBag, ArrowRight, ShieldCheck, HeartHandshake } from 'lucide-react';
import FreshListingsWheel from '@/components/FreshListingsWheel';

const HOW_IT_WORKS = [
  {
    heading: 'If you want to buy',
    steps: [
      ["Browse what's growing nearby", 'See fresh listings from gardens and small farms in your area.'],
      ['Reserve and pay online', 'No account needed. We hold your payment until you have your produce.'],
      ['Wait for the "ready" email', 'The farmer tells you when and where to pick up.'],
      ['Pick up and share your code', 'Hand over your pickup code once the produce is in your hands.'],
    ],
  },
  {
    heading: 'If you want to sell',
    steps: [
      ['Set up your farm profile', 'Add your farm name and photo, and connect a payout account.'],
      ['Post your harvest', 'List the crop, price, quantity and pickup address. Posting is free.'],
      ['Mark orders ready', 'When the produce is ready, send the buyer your pickup hours.'],
      ['Enter the pickup code to get paid', 'The buyer gives you a code at pickup. Entering it releases your payment.'],
    ],
  },
];

export default function SplashLandingPage() {
  return (
    <div className="pb-8">
      {/* Hero: market stall photo with the headline over it */}
      <section className="relative rounded-3xl overflow-hidden shadow-sm">
        <img
          src="/hero-market.jpg"
          alt="Crates of colorful fresh fruit and vegetables at a farmers' market stall"
          // The photo is square and the hero is wide, so only a band of it
          // shows; this keeps the band on the produce, below the tent roof.
          className="absolute inset-0 w-full h-full object-cover object-[center_62%]"
        />
        {/* Darkens the photo so the white text stays readable over it. */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/65 via-black/55 to-black/70" aria-hidden="true" />

        <div className="relative px-6 py-9 sm:py-12 text-center text-white">
          <h1 className="text-5xl sm:text-7xl font-extrabold tracking-tight leading-tight">
            Farm Fresh <span className="text-emerald-300">Direct</span>
          </h1>

          <p className="mt-3 text-2xl sm:text-4xl font-bold tracking-tight">Your Online Farm Stand</p>

          <p className="mt-5 text-lg sm:text-xl font-medium max-w-2xl mx-auto">
            Connect directly with Neighbor Gardens &amp; Small Local Farms in your neighborhood
          </p>

          {/* A plain form, so it works even before the page's scripts load:
              it opens Browse with the zip code in the link. */}
          <form
            action="/browse"
            method="get"
            // Stacked on phones (the field above the button) so neither is squeezed; side by side on wider screens.
            className="mt-6 mx-auto w-full max-w-xs sm:max-w-none flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-2"
          >
            <label htmlFor="home-zip" className="sr-only">
              Your zip code
            </label>
            <input
              id="home-zip"
              name="zip"
              type="text"
              inputMode="numeric"
              autoComplete="postal-code"
              pattern="[0-9]{5}"
              maxLength={5}
              required
              placeholder="Your zip code"
              className="w-full sm:w-40 px-4 py-3 rounded-xl bg-white text-gray-900 text-sm font-medium text-center sm:text-left placeholder:text-gray-500"
            />
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-5 rounded-xl shadow-md transition-colors whitespace-nowrap"
            >
              Find Local Produce
            </button>
          </form>

        </div>
      </section>

      {/* Buy / Sell: the two ways in, as short wide cards. The whole card is
          the link. These replace the buttons that used to sit in the hero. */}
      <section className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link
          href="/browse"
          className="flex items-center gap-4 bg-white px-5 py-4 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md hover:border-emerald-400 transition-all text-left"
        >
          <div className="w-12 h-12 shrink-0 bg-emerald-100 text-emerald-700 rounded-xl flex items-center justify-center">
            <ShoppingBag className="w-6 h-6" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold text-gray-900">I Want to Buy</h2>
            <p className="text-sm text-gray-500">Fresh produce, eggs and honey for pickup near you.</p>
          </div>
          <span className="shrink-0 inline-flex items-center gap-1.5 bg-emerald-600 text-white text-sm font-semibold py-2 px-3 rounded-xl whitespace-nowrap">
            Browse
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </span>
        </Link>

        <Link
          href="/dashboard"
          className="flex items-center gap-4 bg-white px-5 py-4 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md hover:border-emerald-400 transition-all text-left"
        >
          <div className="w-12 h-12 shrink-0 bg-emerald-100 text-emerald-700 rounded-xl flex items-center justify-center">
            <Sprout className="w-6 h-6" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold text-gray-900">I Want to Sell</h2>
            <p className="text-sm text-gray-500">List your harvest and earn from your surplus.</p>
          </div>
          <span className="shrink-0 inline-flex items-center gap-1.5 bg-gray-900 text-white text-sm font-semibold py-2 px-3 rounded-xl whitespace-nowrap">
            Sell
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </span>
        </Link>
      </section>

      {/* Current listings, drifting right to left */}
      <FreshListingsWheel />

      {/* The Mission, in brief — the full version is on the About page. A
          full-width tinted band, to break up the run of white cards. */}
      <section className="mt-14 bg-emerald-800 text-white rounded-3xl px-6 py-12 text-center">
        <h2 className="text-2xl sm:text-3xl font-bold">The Mission</h2>
        <p className="mt-4 text-xl sm:text-2xl font-semibold max-w-2xl mx-auto">
          When local growers meet local buyers, we all win.
        </p>
        <p className="mt-4 text-base text-emerald-50 max-w-2xl mx-auto leading-relaxed">
          Fixing our food system starts with making local connections. We aren't here to make massive profits;
          we're here to introduce you to a local grower you can go back to again and again.
        </p>
        <Link href="/about" className="mt-5 inline-block font-semibold underline">
          Read our full mission
        </Link>
      </section>

      {/* How It Works */}
      <section className="mt-14 max-w-5xl mx-auto px-6">
        <div className="max-w-3xl mx-auto text-left">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 text-center">How It Works</h2>

          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            {HOW_IT_WORKS.map((column) => (
              <div key={column.heading} className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
                <h3 className="text-lg font-bold text-gray-900">{column.heading}</h3>
                <ol className="mt-4 space-y-4">
                  {column.steps.map(([title, detail], index) => (
                    <li key={title} className="flex items-start gap-3">
                      <span className="w-7 h-7 shrink-0 rounded-full bg-emerald-700 text-white text-sm font-bold flex items-center justify-center">
                        {index + 1}
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{title}</p>
                        <p className="text-sm text-gray-600">{detail}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>

          <p className="mt-6 text-center text-sm text-gray-600">
            More questions?{' '}
            <Link href="/faq" className="font-semibold text-emerald-800 underline">
              Read the FAQ
            </Link>
          </p>
        </div>

        {/* Value Props */}
        <div className="mt-14 grid grid-cols-1 sm:grid-cols-3 gap-6 text-left border-t border-gray-200/60 pt-10">
          <div className="flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <h3 className="font-semibold text-gray-900 text-sm">Protected Until Pickup</h3>
              <p className="text-xs text-gray-500 mt-0.5">Your payment is held until you collect your order and hand over your pickup code.</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <HeartHandshake className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <h3 className="font-semibold text-gray-900 text-sm">Support Local Growers</h3>
              <p className="text-xs text-gray-500 mt-0.5">Keep food dollars within your local community and neighborhood economy.</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Sprout className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <h3 className="font-semibold text-gray-900 text-sm">Peak Harvest Quality</h3>
              <p className="text-xs text-gray-500 mt-0.5">Skip long grocery store supply chains and eat food picked fresh today.</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
