import Link from 'next/link';
import { Sprout, ArrowLeft, Heart, Globe, Users } from 'lucide-react';

export default function AboutPage() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <Link href="/" className="inline-flex items-center gap-1 text-sm font-medium text-green-700 hover:underline mb-8">
        <ArrowLeft className="w-4 h-4" /> Back to Home
      </Link>

      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-green-100 text-green-700 rounded-xl">
          <Sprout className="w-8 h-8" />
        </div>
        <h1 className="text-3xl font-extrabold text-gray-900">About Farm Fresh Direct</h1>
      </div>

      <div className="prose prose-green max-w-none text-gray-700 space-y-6">
        <p className="text-lg leading-relaxed text-gray-600">
          <strong>Farm Fresh Direct</strong> was created with a single core mission: to rebuild local food resilience by removing middlemen between small-scale growers and local food lovers.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 my-8">
          <div className="bg-gray-50 p-6 rounded-xl border border-gray-100">
            <Heart className="w-6 h-6 text-red-500 mb-2" />
            <h2 className="font-bold text-gray-900 mb-1">Zero Waste</h2>
            <p className="text-xs text-gray-600">Allow backyard gardeners and homesteaders to turn extra yields into local income rather than food waste.</p>
          </div>
          <div className="bg-gray-50 p-6 rounded-xl border border-gray-100">
            <Globe className="w-6 h-6 text-blue-500 mb-2" />
            <h2 className="font-bold text-gray-900 mb-1">Low Carbon Footprint</h2>
            <p className="text-xs text-gray-600">Shorten food travel miles from thousands of cross-country shipping miles down to mere city blocks.</p>
          </div>
          <div className="bg-gray-50 p-6 rounded-xl border border-gray-100">
            <Users className="w-6 h-6 text-green-600 mb-2" />
            <h2 className="font-bold text-gray-900 mb-1">Community Trust</h2>
            <p className="text-xs text-gray-600">Know exactly who grows your food, how it was raised, and when it was picked.</p>
          </div>
        </div>
      </div>
    </div>
  );
}