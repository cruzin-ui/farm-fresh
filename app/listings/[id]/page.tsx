'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Sprout, MapPin, Calendar, ShoppingBag, ArrowLeft, User, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { BUYER_FEE_LABEL } from '@/lib/pricing';

// Public listing detail page — no sign-in needed to view. Buyers only have to
// log in when they click Reserve, which sends them through /checkout.
export default function ListingDetailPage() {
  const params = useParams();
  const listingId = params.id as string;

  const [listing, setListing] = useState<any>(null);
  const [seller, setSeller] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchListing() {
      setLoading(true);

      const { data: listingData, error } = await supabase
        .from('produce_listings')
        .select('*')
        .eq('id', listingId)
        .maybeSingle();

      if (error) console.error('Supabase Fetch Error (listing):', error.message);

      if (listingData?.farmer_id) {
        const { data: sellerData } = await supabase
          .from('seller_profiles')
          .select('id, farm_name, avatar_url, location, bio, growing_practices')
          .eq('id', listingData.farmer_id)
          .maybeSingle();

        const { data: reviews } = await supabase
          .from('seller_reviews')
          .select('rating')
          .eq('seller_id', listingData.farmer_id);

        const ratings = (reviews || []).map((r) => Number(r.rating));
        setSeller(
          sellerData && {
            ...sellerData,
            review_count: ratings.length,
            average_rating: ratings.length ? ratings.reduce((sum, r) => sum + r, 0) / ratings.length : null,
          }
        );
      }

      setListing(listingData);
      setLoading(false);
    }

    if (listingId) fetchListing();
  }, [listingId]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto my-20 p-8 text-center text-gray-500 text-sm">
        Loading harvest listing...
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="max-w-md mx-auto my-12 p-6 bg-white border rounded-2xl text-center space-y-4 shadow-sm">
        <p className="text-gray-600">This listing is no longer available.</p>
        <Link
          href="/browse"
          className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white font-medium rounded-xl text-sm"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Marketplace
        </Link>
      </div>
    );
  }

  // Whole units only: buyers can't order a fraction, so one isn't shown as available.
  const availableQty = Math.floor(Number(listing.available_quantity ?? 0));
  const unitType = listing.unit_type || 'lbs';
  const soldOut = availableQty <= 0;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <Link
        href="/browse"
        className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-emerald-600 mb-4 font-medium"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back to Produce
      </Link>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-emerald-50 rounded-2xl border border-gray-200 overflow-hidden flex items-center justify-center min-h-64 md:min-h-96">
          {listing.image_url ? (
            <img src={listing.image_url} alt={listing.title} className="w-full h-full object-cover" />
          ) : (
            <div className="text-center text-emerald-700/60 font-semibold text-sm p-4">
              <Sprout className="w-14 h-14 mx-auto mb-1 opacity-50" />
              Fresh Local Yield
            </div>
          )}
        </div>

        <div className="space-y-5">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 bg-emerald-100 px-2.5 py-1 rounded-full">
              {listing.category || 'Produce'}
            </span>
            <h1 className="text-3xl font-extrabold text-gray-900 mt-3">{listing.title}</h1>
            {listing.variety && (
              <p className="text-sm font-semibold text-gray-500 mt-1">Variety: {listing.variety}</p>
            )}
            <p className="mt-2">
              <span className="text-3xl font-black text-gray-900">
                ${Number(listing.price_per_unit || 0).toFixed(2)}
              </span>
              <span className="text-sm text-gray-500 font-medium"> / {unitType}</span>
            </p>
            <p className={`text-xs font-bold mt-1 ${soldOut ? 'text-red-600' : 'text-emerald-700'}`}>
              {soldOut ? 'Sold Out' : `${availableQty} ${unitType} available`}
            </p>
          </div>

          {Array.isArray(listing.tags) && listing.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {listing.tags.map((tag: string) => (
                <span
                  key={tag}
                  className="text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {listing.description && (
            <div>
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">About this harvest</h2>
              <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{listing.description}</p>
            </div>
          )}

          <div className="space-y-2 text-sm text-gray-600">
            <p className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-emerald-600 shrink-0" />
              Pickup in {listing.location_name || seller?.location || 'the local area'}
              {listing.zip_code ? ` (${listing.zip_code})` : ''}
            </p>
            <p className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-400 shrink-0" />
              Harvest date: {listing.harvest_ready_date || 'Available Now'}
              {listing.harvest_end_date ? ` · Available until ${listing.harvest_end_date}` : ''}
            </p>
          </div>

          {listing.category === 'Fresh Eggs' && (
            <p className="text-xs text-amber-950 bg-amber-50 border border-amber-300 rounded-xl p-3">
              Eggs are sold directly by the farmer and aren't inspected by Farm Fresh Direct. Refrigerate them
              promptly after pickup and cook them thoroughly.
            </p>
          )}

          <div className="space-y-2">
            {soldOut ? (
              <span className="w-full inline-flex items-center justify-center bg-gray-200 text-gray-500 font-bold py-3 rounded-xl text-sm">
                Sold Out
              </span>
            ) : (
              <Link
                href={`/checkout?id=${listing.id}`}
                className="w-full inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl text-sm shadow-md transition-colors"
              >
                <ShoppingBag className="w-4 h-4" /> Reserve
              </Link>
            )}
            <p className="text-[11px] text-gray-400 text-center">
              No account needed — check out as a guest or sign in. Paid in full online, plus a {BUYER_FEE_LABEL} service
              fee — exact pickup details are sent once the farmer marks your order ready.
            </p>
          </div>

          {seller && (
            <Link
              href={`/sellers/${seller.id}`}
              className="flex items-center gap-3 p-4 bg-white border border-gray-200 rounded-2xl shadow-sm hover:border-emerald-300 hover:shadow-md transition-all"
            >
              {seller.avatar_url ? (
                <img
                  src={seller.avatar_url}
                  alt={seller.farm_name || 'Farm'}
                  className="w-12 h-12 rounded-xl object-cover border border-emerald-200 shrink-0"
                />
              ) : (
                <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                  <User className="w-6 h-6" />
                </div>
              )}
              <div className="flex-1 overflow-hidden">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Grown by</p>
                <p className="text-sm font-bold text-gray-900 truncate">{seller.farm_name || 'Local Farm'}</p>
                {seller.review_count > 0 && (
                  <p className="text-xs font-semibold text-amber-700">
                    ★ {seller.average_rating.toFixed(1)} · {seller.review_count} review
                    {seller.review_count === 1 ? '' : 's'}
                  </p>
                )}
                {seller.growing_practices && (
                  <p className="text-xs text-gray-500 truncate">{seller.growing_practices}</p>
                )}
              </div>
              <span className="text-xs font-semibold text-emerald-700 flex items-center gap-0.5 shrink-0">
                View farm <ChevronRight className="w-4 h-4" />
              </span>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
