import Link from 'next/link';
import { Sprout, ShoppingBag, ArrowRight, ShieldCheck, HeartHandshake } from 'lucide-react';

export default function SplashLandingPage() {
  return (
    <div className="min-h-screen bg-emerald-50/50 flex flex-col justify-between">
      {/* Main Hero Section */}
      <main className="max-w-5xl mx-auto px-6 py-12 text-center">
        <h1 className="text-5xl sm:text-7xl font-extrabold text-gray-900 tracking-tight leading-tight">
          Farm Fresh <span className="text-green-700">Direct</span>
        </h1>

        <p className="mt-3 text-2xl sm:text-4xl font-bold text-green-800 tracking-tight">
          Your Virtual Farmer's Market
        </p>

        <p className="mt-5 text-lg sm:text-xl font-medium text-gray-700 max-w-2xl mx-auto">
          Connect directly with Neighbor Gardens &amp; Small Local Farms in your neighborhood
        </p>

        <p className="mt-4 text-base text-gray-600 max-w-2xl mx-auto">
          Buy ultra-fresh produce harvested at peak flavor, or sell surplus crops from your home garden or small farm with zero setup friction.
        </p>

        {/* Dual Buyer / Seller Action Cards */}
        <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
          {/* Buyer Choice */}
          <div className="bg-white p-8 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between">
            <div>
              <div className="w-12 h-12 bg-green-100 text-green-700 rounded-xl flex items-center justify-center mb-4">
                <ShoppingBag className="w-6 h-6" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900">I Want to Buy</h2>
              <p className="text-sm text-gray-500 mt-2">
                Discover homegrown produce, eggs, berries, and honey available for local pickup near your zip code.
              </p>
            </div>
            <Link
              href="/browse"
              className="mt-6 inline-flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-6 rounded-xl transition-colors shadow-sm"
            >
              Browse Produce Nearby
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          {/* Seller Choice */}
          <div className="bg-white p-8 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between">
            <div>
              <div className="w-12 h-12 bg-emerald-100 text-emerald-700 rounded-xl flex items-center justify-center mb-4">
                <Sprout className="w-6 h-6" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900">I Want to Sell</h2>
              <p className="text-sm text-gray-500 mt-2">
                List your upcoming or harvested crops, set custom unit prices, and earn money from your surplus.
              </p>
            </div>
            <Link
              href="/dashboard"
              className="mt-6 inline-flex items-center justify-center gap-2 bg-gray-900 hover:bg-gray-800 text-white font-semibold py-3 px-6 rounded-xl transition-colors shadow-sm"
            >
              Post Harvest Listing
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {/* The Mission */}
        <section className="mt-16 max-w-3xl mx-auto text-left bg-white border border-green-200 rounded-2xl p-6 sm:p-8 shadow-sm">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 text-center">The Mission</h2>

          <p className="mt-4 text-lg font-semibold text-green-800 text-center">
            When local growers meet local buyers, we all win.
          </p>

          <div className="mt-4 space-y-4 text-base text-gray-700 leading-relaxed">
            <p>
              We're here to connect you with the people growing food in your area. Fixing our food system
              starts with making local connections, one neighbor at a time.
            </p>
            <p>
              Our mission isn't to make massive profits. It's to introduce you to a local grower you can go
              back to again and again. If you build a relationship with them outside this platform, that's
              great! We want you directly connected to your food, even if that means without us.
            </p>
            <p>
              All we ask is that you think of us whenever you're looking for fresh, delicious, locally grown
              food. And if you'd like to help keep the lights on,{' '}
              <Link href="/contact" className="font-semibold text-green-800 underline">
                get in touch
              </Link>
              .
            </p>
          </div>
        </section>

        {/* Value Props */}
        <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-6 text-left border-t border-gray-200/60 pt-10">
          <div className="flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-gray-900 text-sm">Protected Until Pickup</h3>
              <p className="text-xs text-gray-500 mt-0.5">Your payment is held until you collect your order and hand over your pickup code.</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <HeartHandshake className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-gray-900 text-sm">Support Local Growers</h3>
              <p className="text-xs text-gray-500 mt-0.5">Keep food dollars within your local community and neighborhood economy.</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Sprout className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-gray-900 text-sm">Peak Harvest Quality</h3>
              <p className="text-xs text-gray-500 mt-0.5">Skip long grocery store supply chains and eat food picked fresh today.</p>
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-gray-200 py-6 text-center text-xs text-gray-500">
        © {new Date().getFullYear()} Farm Fresh Direct. Connecting local food communities.
      </footer>
    </div>
  );
}