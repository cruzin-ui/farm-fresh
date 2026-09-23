import Link from 'next/link';
import { Sprout, ShoppingBag, ArrowRight, ShieldCheck, HeartHandshake, MapPin } from 'lucide-react';

export default function SplashLandingPage() {
  return (
    <div className="min-h-screen bg-emerald-50/50 flex flex-col justify-between">
      {/* Header Navigation */}
      <header className="max-w-7xl mx-auto w-full px-6 py-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-green-600 text-white rounded-lg">
            <Sprout className="w-6 h-6" />
          </div>
          <span className="text-xl font-bold text-gray-900 tracking-tight">Farm Fresh Direct</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/about" className="text-sm font-medium text-gray-600 hover:text-green-700">
            Our Mission
          </Link>
          <Link
            href="/browse"
            className="text-sm font-semibold text-green-700 bg-white border border-green-200 px-4 py-2 rounded-lg shadow-sm hover:bg-green-50 transition-colors"
          >
            Browse Food
          </Link>
        </div>
      </header>

      {/* Main Hero Section */}
      <main className="max-w-5xl mx-auto px-6 py-12 text-center">
        <div className="inline-flex items-center gap-2 bg-green-100 text-green-800 text-xs font-semibold px-3 py-1.5 rounded-full mb-6">
          <MapPin className="w-3.5 h-3.5" /> Direct From Neighbor Gardens & Small Local Farms
        </div>

        <h1 className="text-4xl sm:text-6xl font-extrabold text-gray-900 tracking-tight leading-tight">
          Connect directly with <span className="text-green-600">local growers</span> in your neighborhood.
        </h1>

        <p className="mt-4 text-lg text-gray-600 max-w-2xl mx-auto">
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
              href="/sell"
              className="mt-6 inline-flex items-center justify-center gap-2 bg-gray-900 hover:bg-gray-800 text-white font-semibold py-3 px-6 rounded-xl transition-colors shadow-sm"
            >
              Post Harvest Listing
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {/* Value Props */}
        <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-6 text-left border-t border-gray-200/60 pt-10">
          <div className="flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-gray-900 text-sm">Verified at Pickup</h3>
              <p className="text-xs text-gray-500 mt-0.5">Pay only after inspecting items in person with adjustable weights.</p>
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