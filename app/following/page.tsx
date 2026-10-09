'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Heart, MapPin, Clock, ArrowLeft, Sprout, User } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { postWithAuth } from '@/lib/authedFetch';
import AddToCartButton from '@/components/AddToCartButton';

type FollowedFarm = {
  id: string;
  farm_name: string;
  avatar_url: string | null;
  location: string;
  usual_pickup: string;
  listing_count: number;
  listings: {
    id: string;
    title: string;
    variety: string | null;
    price_per_unit: number;
    unit_type: string;
    image_url: string | null;
    available_quantity: number;
    created_at: string;
  }[];
};

// A listing counts as new for this long after it is posted.
const NEW_FOR_DAYS = 7;
const isNew = (postedAt: string) => Date.now() - new Date(postedAt).getTime() < NEW_FOR_DAYS * 24 * 60 * 60 * 1000;

// The farms a shopper follows, each with what it has for sale right now.
export default function FollowedFarmsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [farms, setFarms] = useState<FollowedFarm[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busyFarmId, setBusyFarmId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login?redirect=/following');
        return;
      }

      try {
        const res = await postWithAuth('/api/follows', { action: 'list' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not load your followed farms.');
        setFarms(data.farms);
      } catch (err: any) {
        setErrorMsg(err.message || 'Could not load your followed farms.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [router]);

  const unfollow = async (farm: FollowedFarm) => {
    if (!confirm(`Stop following ${farm.farm_name}?`)) return;

    setBusyFarmId(farm.id);
    setErrorMsg(null);
    try {
      const res = await postWithAuth('/api/follows', { action: 'unfollow', farmerId: farm.id });
      if (!res.ok) throw new Error('Could not stop following that farm.');
      setFarms((current) => current.filter((f) => f.id !== farm.id));
    } catch (err: any) {
      setErrorMsg(err.message || 'Could not stop following that farm.');
    } finally {
      setBusyFarmId(null);
    }
  };

  if (loading) {
    return <div className="max-w-4xl mx-auto my-20 p-8 text-center text-gray-500 text-sm">Loading your farms...</div>;
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Heart className="w-6 h-6 text-emerald-600" aria-hidden="true" /> Followed Farms
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            The farms you follow and what each has for sale right now. Check back to see what's new.
          </p>
        </div>
        <Link
          href="/browse"
          className="inline-flex items-center gap-2 bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-50 font-bold py-2.5 px-4 rounded-xl text-xs"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" /> Back to Browsing
        </Link>
      </div>

      {errorMsg && (
        <div role="alert" className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
          {errorMsg}
        </div>
      )}

      {!errorMsg && farms.length === 0 && (
        <div className="text-center py-16 bg-white rounded-xl border border-dashed border-gray-200 px-4">
          <Heart className="mx-auto h-12 w-12 text-gray-400 mb-3" aria-hidden="true" />
          <h2 className="text-base font-semibold text-gray-900">You aren't following any farms yet</h2>
          <p className="text-sm text-gray-600 mt-1">
            Click <strong>Follow This Farm</strong> on a farm's page, a listing or one of your orders to keep it
            here.
          </p>
          <Link
            href="/browse"
            className="mt-4 inline-flex items-center gap-2 bg-emerald-600 text-white font-semibold py-2.5 px-5 rounded-lg text-xs shadow-sm hover:bg-emerald-700"
          >
            Browse Fresh Produce
          </Link>
        </div>
      )}

      <div className="space-y-4">
        {farms.map((farm) => (
          <section key={farm.id} className="p-5 bg-white border border-gray-200 rounded-2xl shadow-sm space-y-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <Link href={`/sellers/${farm.id}`} className="flex items-center gap-3 min-w-0 group">
                {farm.avatar_url ? (
                  <img
                    src={farm.avatar_url}
                    alt=""
                    className="w-12 h-12 rounded-xl object-cover border border-emerald-200 shrink-0"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                    <User className="w-6 h-6" aria-hidden="true" />
                  </div>
                )}
                <div className="min-w-0">
                  <h2 className="text-base font-bold text-gray-900 group-hover:underline break-words">{farm.farm_name}</h2>
                  {farm.location && (
                    <p className="text-xs text-gray-600 flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" /> {farm.location}
                    </p>
                  )}
                  {farm.usual_pickup && (
                    <p className="text-xs text-gray-600 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" /> Usual pickup: {farm.usual_pickup}
                    </p>
                  )}
                </div>
              </Link>
              <button
                type="button"
                onClick={() => unfollow(farm)}
                disabled={busyFarmId === farm.id}
                className="shrink-0 bg-white border text-gray-600 hover:bg-gray-50 disabled:opacity-50 text-xs font-bold px-3.5 py-2 rounded-xl"
              >
                {busyFarmId === farm.id ? 'Removing...' : 'Stop Following'}
              </button>
            </div>

            {farm.listings.length === 0 ? (
              <p className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-xl p-3">
                Nothing for sale right now. Check back soon.
              </p>
            ) : (
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {farm.listings.map((listing) => (
                  <li key={listing.id} className="border border-gray-200 rounded-xl p-3 flex gap-3">
                    <Link href={`/listings/${listing.id}`} className="shrink-0">
                      {listing.image_url ? (
                        <img src={listing.image_url} alt="" className="w-16 h-16 rounded-lg object-cover" />
                      ) : (
                        <div className="w-16 h-16 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                          <Sprout className="w-7 h-7" aria-hidden="true" />
                        </div>
                      )}
                    </Link>
                    <div className="min-w-0 flex-1 space-y-1">
                      <Link href={`/listings/${listing.id}`} className="block font-bold text-sm text-gray-900 hover:underline break-words">
                        {listing.title}
                        {listing.variety ? ` — ${listing.variety}` : ''}
                      </Link>
                      <p className="text-xs text-gray-600">
                        ${listing.price_per_unit.toFixed(2)} per {listing.unit_type}
                        {isNew(listing.created_at) && (
                          <span className="ml-2 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase bg-amber-100 text-amber-900">
                            New
                          </span>
                        )}
                      </p>
                      <AddToCartButton listingId={listing.id} available={listing.available_quantity} className="!py-2" />
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {farm.listing_count > farm.listings.length && (
              <Link href={`/sellers/${farm.id}`} className="inline-block text-xs font-semibold text-emerald-700 underline">
                See all {farm.listing_count} listings from {farm.farm_name}
              </Link>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
