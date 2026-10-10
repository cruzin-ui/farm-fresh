'use client';

import React, { useState, useEffect } from 'react';
import { friendlyDate, pickupAvailability } from '@/lib/dates';
import { SELLER_READY_DAYS } from '@/lib/pickupRules';
import { supabase } from '@/lib/supabaseClient';
import { fetchSuspendedSellerIds } from '@/lib/suspendedSellers';
import { Sprout, MapPin, Calendar, Clock, ShoppingBag, ShoppingCart, CheckCircle2, ArrowLeft, User, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { BUYER_FEE_LABEL } from '@/lib/pricing';
import { addToCart, useCart } from '@/lib/cart';
import { describeUsualPickup } from '@/lib/pickupRules';
import FollowFarmButton from '@/components/FollowFarmButton';
import Photo from '@/components/Photo';
import { ListingPageSkeleton } from '@/components/Skeletons';

// Public listing detail page — no sign-in needed to view, or to buy: items go
// into the cart, and checkout works for guests as well as signed-in buyers.
export default function ListingDetailPage() {
  const params = useParams();
  const listingId = params.id as string;

  const [listing, setListing] = useState<any>(null);
  const [seller, setSeller] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const { items: cartItems } = useCart();
  const [addQuantity, setAddQuantity] = useState('1');
  const [cartMessage, setCartMessage] = useState<string | null>(null);

  // On phones a slim bar with the price and Add to Cart is pinned to the
  // bottom of the screen whenever the main button has scrolled out of view.
  const [addButtonEl, setAddButtonEl] = useState<HTMLElement | null>(null);
  const [addButtonInView, setAddButtonInView] = useState(true);
  useEffect(() => {
    if (!addButtonEl || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setAddButtonInView(entry.isIntersecting));
    observer.observe(addButtonEl);
    return () => observer.disconnect();
  }, [addButtonEl]);

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
          .select('id, farm_name, avatar_url, location, bio, growing_practices, pickup_days, pickup_times, stripe_onboarding_complete')
          .eq('id', listingData.farmer_id)
          .maybeSingle();

        const { data: reviews } = await supabase
          .from('seller_reviews')
          .select('rating')
          .eq('seller_id', listingData.farmer_id)
          .is('removed_at', null);

        const suspended = await fetchSuspendedSellerIds(supabase, [listingData.farmer_id]);

        const ratings = (reviews || []).map((r) => Number(r.rating));
        setSeller(
          sellerData && {
            ...sellerData,
            suspended: suspended.has(listingData.farmer_id),
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
    return <ListingPageSkeleton />;
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

  // What can still be added: what's available, less what is already in the cart.
  const maxQty = availableQty;
  const inCart = cartItems.find((item) => item.listingId === listing.id)?.quantity || 0;
  const roomLeft = availableQty - inCart;
  const chosenQty = Math.min(Math.max(1, parseInt(addQuantity, 10) || 1), Math.max(1, roomLeft));

  const availability = pickupAvailability(listing.harvest_ready_date);
  const usualPickup = describeUsualPickup(seller?.pickup_days, seller?.pickup_times);

  const handleAddToCart = () => {
    if (roomLeft < 1) return;
    if (addToCart(listing.id, chosenQty)) {
      setCartMessage(`Added — ${inCart + chosenQty} ${unitType} in your cart.`);
      setAddQuantity('1');
    } else {
      setCartMessage('Your cart is full. Check out, or remove something, before adding more.');
    }
  };

  const canBuy = !soldOut && Boolean(seller?.stripe_onboarding_complete) && !seller?.suspended;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {canBuy && !addButtonInView && (
        <div className="md:hidden print:hidden fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-40 bg-white/95 backdrop-blur-md border-t border-emerald-100 shadow-[0_-2px_8px_rgba(0,0,0,0.06)] px-4 py-2.5 flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-gray-900 truncate">{listing.title}</p>
            <p className="text-xs text-gray-600">
              <span className="font-bold text-gray-900">${Number(listing.price_per_unit || 0).toFixed(2)}</span> /{' '}
              {unitType}
              {inCart > 0 && ` · ${inCart} in cart`}
            </p>
          </div>
          {inCart > 0 && (
            <Link
              href="/checkout"
              className="shrink-0 inline-flex items-center justify-center bg-white border border-emerald-300 text-emerald-800 font-bold px-3 py-3 rounded-xl text-xs"
            >
              View Cart
            </Link>
          )}
          <button
            type="button"
            onClick={handleAddToCart}
            disabled={roomLeft < 1}
            className="shrink-0 inline-flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white font-bold px-4 py-3 rounded-xl text-sm"
          >
            <ShoppingCart className="w-4 h-4" aria-hidden="true" /> {inCart > 0 ? 'Add Another' : 'Add to Cart'}
          </button>
        </div>
      )}
      <Link
        href="/browse"
        className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-emerald-600 mb-4 font-medium"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back to Produce
      </Link>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-emerald-50 rounded-2xl border border-gray-200 overflow-hidden flex items-center justify-center min-h-64 md:min-h-96">
          {listing.image_url ? (
            <Photo
              src={listing.image_url}
              alt={listing.title}
              sizes="(max-width: 767px) 100vw, 480px"
              eager
              className="w-full h-full object-cover"
            />
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
              <p className="text-lg font-semibold text-gray-700 mt-1">{listing.variety}</p>
            )}
            <p className="mt-2">
              <span className="text-3xl font-black text-gray-900">
                ${Number(listing.price_per_unit || 0).toFixed(2)}
              </span>
              <span className="text-sm text-gray-500 font-medium"> / {unitType}</span>
            </p>
            <p className={`text-sm font-bold mt-1 ${soldOut ? 'text-red-600' : 'text-emerald-700'}`}>
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

          {/* The things a shopper needs to decide: when, where, and what times. */}
          <dl className="bg-white border border-gray-200 rounded-2xl divide-y divide-gray-100">
            <div className="flex items-start gap-3 p-4">
              <Calendar className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <dt className="sr-only">When</dt>
                <dd>
                  <span className={`inline-block text-base font-bold px-2.5 py-0.5 rounded-lg ${availability.tagClass}`}>
                    {availability.label}
                  </span>
                </dd>
                <dd className="text-xs text-gray-500 mt-1.5">
                  {availability.availableNow
                    ? `The farmer has up to ${SELLER_READY_DAYS} days after you order to get it ready, and emails you when it is.`
                    : `Harvest date: ${friendlyDate(listing.harvest_ready_date)}. You can order now, and the farmer emails you when it is ready.`}
                  {listing.harvest_end_date ? ` On sale until ${friendlyDate(listing.harvest_end_date)}.` : ''}
                </dd>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4">
              <MapPin className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <dt className="sr-only">Where</dt>
                <dd className="text-base font-bold text-gray-900">
                  Pickup in {listing.location_name || seller?.location || 'the local area'}
                  {listing.zip_code ? ` (${listing.zip_code})` : ''}
                </dd>
                <dd className="text-xs text-gray-500 mt-0.5">
                  You get the exact address when your order is ready.
                </dd>
              </div>
            </div>
            {usualPickup && (
              <div className="flex items-start gap-3 p-4">
                <Clock className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <dt className="text-xs text-gray-500">Usual pickup times</dt>
                  <dd className="text-base font-bold text-gray-900">{usualPickup}</dd>
                </div>
              </div>
            )}
          </dl>

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
            ) : seller?.suspended ? (
              <p className="w-full bg-gray-100 border border-gray-200 text-gray-700 text-xs font-semibold p-3 rounded-xl text-center">
                This farm isn't taking orders right now.
              </p>
            ) : !seller?.stripe_onboarding_complete ? (
              <p className="w-full bg-amber-50 border border-amber-200 text-amber-900 text-xs font-semibold p-3 rounded-xl text-center">
                Not available to buy yet. This farmer is still setting up payouts.
              </p>
            ) : (
              <>
                <div ref={setAddButtonEl} className="flex items-stretch gap-2">
                  <div className="flex items-center gap-2 bg-white border px-3 rounded-xl">
                    <label htmlFor="listing-qty" className="text-xs text-gray-600 font-semibold">
                      Qty:
                    </label>
                    <input
                      id="listing-qty"
                      type="number"
                      inputMode="numeric"
                      min="1"
                      max={maxQty}
                      value={addQuantity}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => setAddQuantity(e.target.value.replace(/\D/g, ''))}
                      onBlur={() => setAddQuantity(String(chosenQty))}
                      className="w-14 text-center text-sm font-bold bg-white border rounded p-1 focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleAddToCart}
                    disabled={roomLeft < 1}
                    className="flex-1 inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white font-bold py-3 rounded-xl text-sm shadow-md transition-colors"
                  >
                    <ShoppingCart className="w-4 h-4" aria-hidden="true" /> Add to Cart
                  </button>
                </div>

                {inCart > 0 && (
                  <div role="status" className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-sm text-emerald-950 space-y-2">
                    <p className="flex items-center gap-1.5 font-semibold">
                      <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" aria-hidden="true" />
                      {cartMessage || `${inCart} ${listing.unit_type || 'units'} in your cart.`}
                    </p>
                    <div className="flex gap-2">
                      <Link
                        href="/checkout"
                        className="flex-1 inline-flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-xl text-xs"
                      >
                        <ShoppingBag className="w-3.5 h-3.5" aria-hidden="true" /> View Cart & Check Out
                      </Link>
                      <Link
                        href="/browse"
                        className="flex-1 inline-flex items-center justify-center bg-white border text-gray-700 font-bold py-2.5 rounded-xl text-xs hover:bg-gray-50"
                      >
                        Keep Shopping
                      </Link>
                    </div>
                  </div>
                )}

                {cartMessage && inCart === 0 && (
                  <p role="alert" className="text-xs text-red-700 bg-red-50 border border-red-200 p-2 rounded-lg">
                    {cartMessage}
                  </p>
                )}
              </>
            )}
            <p className="text-xs text-gray-400 text-center">
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
                <Photo
                  src={seller.avatar_url}
                  alt={seller.farm_name || 'Farm'}
                  sizes="48px"
                  className="w-12 h-12 rounded-xl object-cover border border-emerald-200 shrink-0"
                />
              ) : (
                <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                  <User className="w-6 h-6" />
                </div>
              )}
              <div className="flex-1 overflow-hidden">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Grown by</p>
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

          {seller && <FollowFarmButton farmerId={seller.id} farmName={seller.farm_name || 'this farm'} />}
        </div>
      </div>
    </div>
  );
}
