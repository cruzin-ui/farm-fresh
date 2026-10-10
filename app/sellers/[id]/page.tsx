'use client';

import React, { useState, useEffect } from 'react';
import { friendlyDate } from '@/lib/dates';
import { supabase } from '@/lib/supabaseClient';
import { Sprout, MapPin, Star, Calendar, ShoppingBag, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import AddToCartButton from '@/components/AddToCartButton';
import { LISTING_CATEGORIES } from '@/lib/categories';
import { describeUsualPickup } from '@/lib/pickupRules';
import FollowFarmButton from '@/components/FollowFarmButton';
import { useParams } from 'next/navigation';

export default function PublicSellerProfilePage() {
  const params = useParams();
  const sellerId = params.id as string;

  const [profile, setProfile] = useState<any>(null);
  const [listings, setListings] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Average Rating Calculation
  const avgRating =
    reviews.length > 0
      ? (reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length).toFixed(1)
      : 'New';

  useEffect(() => {
    if (sellerId) {
      fetchSellerData();
    }
  }, [sellerId]);

  const fetchSellerData = async () => {
    setLoading(true);

    // Fetch Seller Profile
    const { data: profileData } = await supabase
      .from('seller_profiles')
      .select('*')
      .eq('id', sellerId)
      .maybeSingle();

    // Fetch Seller Active Produce Listings
    const { data: listingsData } = await supabase
      .from('produce_listings')
      .select('*')
      .eq('farmer_id', sellerId)
      .eq('status', 'active')
      .gte('available_quantity', 1)
      .in('category', LISTING_CATEGORIES)
      .order('created_at', { ascending: false });

    // Fetch Seller Reviews
    const { data: reviewsData } = await supabase
      .from('seller_reviews')
      .select('*')
      .eq('seller_id', sellerId)
      .is('removed_at', null)
      .order('created_at', { ascending: false });

    setProfile(profileData);
    // Nothing is shown for sale until the farmer has finished payout setup,
    // since nobody can buy it before then.
    setListings(profileData?.stripe_onboarding_complete ? listingsData || [] : []);
    setReviews(reviewsData || []);
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto my-20 p-8 text-center text-gray-500">
        Loading farm profile...
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Cover Banner & Profile Card */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm mb-8">
        <div className="h-48 bg-emerald-700 relative flex items-center justify-center text-white">
          {profile?.cover_image_url ? (
            <img
              src={profile.cover_image_url}
              alt={`${profile.farm_name || 'Farm'} banner`}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="flex items-center gap-2 opacity-80">
              <Sprout className="w-10 h-10" />
              <span className="text-2xl font-bold tracking-wide">{profile?.farm_name || 'Local Farm Partner'}</span>
            </div>
          )}
        </div>

        <div className="p-6 relative pt-4 sm:pt-6">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-gray-100">
            <div>
              {profile?.avatar_url && (
                <img
                  src={profile.avatar_url}
                  alt={profile.farm_name || 'Farm'}
                  className="w-20 h-20 rounded-2xl object-cover border-2 border-white shadow-md -mt-16 mb-3 relative bg-white"
                />
              )}
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-3xl font-extrabold text-gray-900">
                  {profile?.farm_name || 'Local Farm'}
                </h1>
                <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200 text-xs font-bold px-2.5 py-1 rounded-full">
                  <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" /> {avgRating} ({reviews.length} reviews)
                </span>
              </div>

              {profile?.location && (
                <p className="text-sm text-gray-500 flex items-center gap-1 mt-1">
                  <MapPin className="w-4 h-4 text-green-600" /> {profile.location} {profile.zip_code ? `(${profile.zip_code})` : ''}
                </p>
              )}
              {describeUsualPickup(profile?.pickup_days, profile?.pickup_times) && (
                <p className="text-sm text-gray-500 flex items-center gap-1 mt-1">
                  <Calendar className="w-4 h-4 text-green-600" /> Usual pickup times:{' '}
                  {describeUsualPickup(profile?.pickup_days, profile?.pickup_times)}
                </p>
              )}
              {profile?.id && (
                <div className="mt-3">
                  <FollowFarmButton farmerId={profile.id} farmName={profile.farm_name || 'this farm'} />
                </div>
              )}
            </div>

            {profile?.growing_practices && (
              <span className="inline-flex items-center gap-1 bg-green-100 text-green-800 text-xs font-bold px-3 py-1.5 rounded-lg w-fit">
                <CheckCircle2 className="w-4 h-4 text-green-700" /> {profile.growing_practices}
              </span>
            )}
          </div>

          {/* Farm Story / Bio */}
          <div className="py-4">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">About the Farm</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              {profile?.bio || 'This grower has not added a detailed bio yet, but produces fresh local crops for pickup!'}
            </p>
          </div>

          {/* Farm Photos Gallery */}
          {profile?.gallery_urls && profile.gallery_urls.length > 0 && (
            <div className="pt-4 border-t border-gray-100">
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Farm & Harvest Photos</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {profile.gallery_urls.map((url: string, index: number) => (
                  <img
                    key={index}
                    src={url}
                    alt={`Farm photo ${index + 1}`}
                    className="h-28 w-full object-cover rounded-xl border border-gray-200"
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Available Produce Section */}
      <div className="mb-12">
        <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
          <ShoppingBag className="w-6 h-6 text-green-600" /> Fresh Harvest Available Now
        </h2>

        {listings.length === 0 ? (
          <div className="p-8 bg-white text-center rounded-2xl border border-dashed border-gray-200 text-gray-500 text-sm">
            No active produce listings available at this moment. Check back soon for upcoming harvests!
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {listings.map((item) => (
              <div key={item.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col justify-between">
                <Link href={`/listings/${item.id}`}>
                  {item.image_url ? (
                    <img src={item.image_url} alt={item.title} className="h-40 w-full object-cover" />
                  ) : (
                    <div className="h-40 w-full bg-green-50 flex items-center justify-center text-green-700">
                      <Sprout className="w-10 h-10 opacity-50" />
                    </div>
                  )}
                </Link>
                <div className="p-5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-green-800 bg-green-100 px-2.5 py-0.5 rounded-full">
                    {item.category}
                  </span>
                  <h3 className="text-lg font-bold text-gray-900 mt-2">
                    <Link href={`/listings/${item.id}`} className="hover:text-green-700">
                      {item.title}
                    </Link>
                  </h3>
                  {item.variety && (
                    <p className="text-xs font-semibold text-gray-500">Variety: {item.variety}</p>
                  )}
                  <p className="text-sm font-bold text-gray-800 mt-1">
                    ${Number(item.price_per_unit || 0).toFixed(2)} / {item.unit_type}
                  </p>
                  <p className="text-xs text-gray-500 flex items-center gap-1 mt-2">
                    <Calendar className="w-3.5 h-3.5" /> Harvest date: {friendlyDate(item.harvest_ready_date) || 'Available Now'}
                  </p>
                </div>
                <div className="p-5 pt-0">
                  <AddToCartButton
                    listingId={item.id}
                    available={Number(item.available_quantity ?? 0)}
                    className="w-full"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Reviews & Ratings Section */}
      <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
        <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
          <Star className="w-6 h-6 text-amber-500 fill-amber-500" /> Customer Reviews ({reviews.length})
        </h2>

        {reviews.length === 0 ? (
          <p className="text-sm text-gray-500 py-4">No customer reviews written yet for this seller.</p>
        ) : (
          <div className="space-y-4 divide-y divide-gray-100">
            {reviews.map((rev) => (
              <div key={rev.id} className="pt-4 first:pt-0">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1">
                    {[...Array(5)].map((_, i) => (
                      <Star
                        key={i}
                        className={`w-4 h-4 ${
                          i < rev.rating
                            ? 'text-amber-400 fill-amber-400'
                            : 'text-gray-200'
                        }`}
                      />
                    ))}
                  </div>
                  <span className="text-xs text-gray-400">
                    {new Date(rev.created_at).toLocaleDateString()}
                  </span>
                </div>
                {rev.comment && <p className="text-sm text-gray-700 mt-1">{rev.comment}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}