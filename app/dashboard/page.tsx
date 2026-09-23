'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import {
  Sprout,
  Upload,
  AlertCircle,
  CheckCircle2,
  PlusCircle,
  LayoutDashboard,
  Trash2,
  Calendar,
  LogOut,
  User,
  ShoppingBag,
  History,
  Settings,
  CreditCard,
  Clock,
  DollarSign,
  Check,
  PackageCheck,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function SellerDashboardPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<
    'listings' | 'new' | 'orders' | 'history' | 'profile' | 'settings'
  >('listings');
  const [loading, setLoading] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // User & Seller Data State
  const [user, setUser] = useState<any>(null);
  const [myListings, setMyListings] = useState<any[]>([]);
  const [incomingOrders, setIncomingOrders] = useState<any[]>([]);
  const [salesHistory, setSalesHistory] = useState<any[]>([]);

  // Listing Form State
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Vegetables');
  const [description, setDescription] = useState('');
  const [unitType, setUnitType] = useState('lbs');
  const [pricePerUnit, setPricePerUnit] = useState('');
  const [availableQuantity, setAvailableQuantity] = useState('');
  const [harvestReadyDate, setHarvestReadyDate] = useState('');
  const [harvestEndDate, setHarvestEndDate] = useState('');
  const [locationName, setLocationName] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [pickupInstructions, setPickupInstructions] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);

  // Profile Form State
  const [farmName, setFarmName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [bio, setBio] = useState('');
  const [profileLocation, setProfileLocation] = useState('');
  const [profileZip, setProfileZip] = useState('');
  const [growingPractices, setGrowingPractices] = useState('No Synthetic Pesticides');

  // Settings & Payout State
  const [paymentMethod, setPaymentMethod] = useState('Cash / Venmo at Pickup');
  const [venmoHandle, setVenmoHandle] = useState('');

  useEffect(() => {
    fetchDashboardData();
  }, [router]);

  const fetchDashboardData = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      router.push('/login?redirectTo=/dashboard');
      return;
    }

    const currentUserId = session.user.id;
    setUser(session.user);

    // Fetch Seller Listings
    const { data: listings } = await supabase
      .from('produce_listings')
      .select('*')
      .eq('farmer_id', currentUserId)
      .order('created_at', { ascending: false });

    if (listings) setMyListings(listings);

    // Fetch Seller Profile
    const { data: profile } = await supabase
      .from('seller_profiles')
      .select('*')
      .eq('id', currentUserId)
      .maybeSingle();

    if (profile) {
      setFarmName(profile.farm_name || '');
      setAvatarUrl(profile.avatar_url || '');
      setBio(profile.bio || '');
      setProfileLocation(profile.location || '');
      setProfileZip(profile.zip_code || '');
      setGrowingPractices(profile.growing_practices || 'No Synthetic Pesticides');
      setPaymentMethod(profile.payment_method || 'Cash / Venmo at Pickup');
      setVenmoHandle(profile.venmo_handle || '');
    }

    // Fetch Incoming Orders
    const { data: orders } = await supabase
      .from('orders')
      .select('*, produce_listings(title, unit_type, price_per_unit)')
      .eq('seller_id', currentUserId)
      .order('created_at', { ascending: false });

    if (orders) {
      setIncomingOrders(orders.filter((o) => o.status === 'pending' || o.status === 'ready'));
      setSalesHistory(orders.filter((o) => o.status === 'completed' || o.status === 'cancelled'));
    }

    setAuthChecking(false);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

  const handleDeleteListing = async (id: string) => {
    if (!confirm('Are you sure you want to remove this harvest listing?')) return;

    const { error } = await supabase
      .from('produce_listings')
      .delete()
      .eq('id', id)
      .eq('farmer_id', user.id);

    if (error) {
      alert(`Could not delete listing: ${error.message}`);
    } else {
      setMyListings((prev) => prev.filter((item) => item.id !== id));
      await fetchDashboardData();
    }
  };

  const handleOrderStatusUpdate = async (orderId: string, newStatus: string) => {
    const { error } = await supabase
      .from('orders')
      .update({ status: newStatus })
      .eq('id', orderId);

    if (error) {
      alert(`Could not update order status: ${error.message}`);
    } else {
      setSuccessMsg(`Order marked as ${newStatus}!`);
      await fetchDashboardData();
    }
  };

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      if (!user) throw new Error('Authentication required.');

      let uploadedAvatarUrl = avatarUrl;

      if (avatarFile) {
        const fileExt = avatarFile.name.split('.').pop();
        const fileName = `avatars/${user.id}-${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('produce-images')
          .upload(fileName, avatarFile, { upsert: true });

        if (uploadError) throw uploadError;

        const { data: publicUrlData } = supabase.storage
          .from('produce-images')
          .getPublicUrl(fileName);

        uploadedAvatarUrl = publicUrlData.publicUrl;
        setAvatarUrl(uploadedAvatarUrl);
      }

      const profilePayload = {
        id: user.id,
        farm_name: farmName,
        avatar_url: uploadedAvatarUrl,
        bio,
        location: profileLocation,
        zip_code: profileZip,
        growing_practices: growingPractices,
        payment_method: paymentMethod,
        venmo_handle: venmoHandle,
      };

      const { error: upsertError } = await supabase
        .from('seller_profiles')
        .upsert(profilePayload);

      if (upsertError) throw upsertError;

      setSuccessMsg('Farm profile and image successfully updated!');
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update farm profile.');
    } finally {
      setLoading(false);
    }
  };

  const handleListingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      if (!user) throw new Error('Authentication expired. Please log in again.');

      let cropImageUrl = null;

      if (imageFile) {
        const fileExt = imageFile.name.split('.').pop();
        const fileName = `crops/${user.id}-${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('produce-images')
          .upload(fileName, imageFile);

        if (uploadError) throw uploadError;

        const { data: publicUrlData } = supabase.storage
          .from('produce-images')
          .getPublicUrl(fileName);

        cropImageUrl = publicUrlData.publicUrl;
      }

      const { error: insertError } = await supabase
        .from('produce_listings')
        .insert([
          {
            farmer_id: user.id,
            farm_name: farmName || 'Local Grower',
            farmer_avatar_url: avatarUrl || null,
            title,
            category,
            description,
            unit_type: unitType,
            price_per_unit: parseFloat(pricePerUnit),
            available_quantity: parseFloat(availableQuantity),
            harvest_ready_date: harvestReadyDate,
            harvest_end_date: harvestEndDate || null,
            location_name: locationName || profileLocation,
            zip_code: zipCode || profileZip,
            pickup_instructions: pickupInstructions,
            image_url: cropImageUrl,
            status: 'active',
          },
        ]);

      if (insertError) throw insertError;

      setSuccessMsg('Listing successfully published with your farm branding!');
      setTitle('');
      setDescription('');
      setPricePerUnit('');
      setAvailableQuantity('');
      setHarvestReadyDate('');
      setImageFile(null);

      await fetchDashboardData();
      setActiveTab('listings');
    } catch (err: any) {
      setErrorMsg(err.message || 'Something went wrong saving your listing.');
    } finally {
      setLoading(false);
    }
  };

  if (authChecking) {
    return (
      <div className="max-w-4xl mx-auto my-20 p-8 text-center text-gray-500 text-sm">
        Loading Seller Dashboard...
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex flex-col md:flex-row gap-8">
        {/* SIDEBAR NAVIGATION WITH ALL TABS RESTORED */}
        <aside className="w-full md:w-64 bg-white p-5 rounded-2xl border border-gray-200 shadow-sm shrink-0 self-start">
          <div className="flex items-center gap-3 pb-6 mb-6 border-b border-gray-100">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={farmName}
                className="w-11 h-11 rounded-xl object-cover border border-emerald-200"
              />
            ) : (
              <div className="p-2.5 bg-emerald-100 text-emerald-700 rounded-xl">
                <Sprout className="w-6 h-6" />
              </div>
            )}
            <div className="overflow-hidden">
              <h2 className="font-extrabold text-gray-900 text-base truncate">
                {farmName || 'My Farm'}
              </h2>
              <p className="text-xs text-gray-400 truncate">{user?.email}</p>
            </div>
          </div>

          <nav className="space-y-1">
            {/* TAB 1: YOUR LISTINGS */}
            <button
              onClick={() => {
                setActiveTab('listings');
                setSuccessMsg(null);
                setErrorMsg(null);
              }}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                activeTab === 'listings' || activeTab === 'new'
                  ? 'bg-emerald-50 text-emerald-700 font-bold'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <LayoutDashboard className="w-4 h-4" /> Your Listings
              </span>
              <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-[10px]">
                {myListings.length}
              </span>
            </button>

            {/* TAB 2: INCOMING ORDERS */}
            <button
              onClick={() => {
                setActiveTab('orders');
                setSuccessMsg(null);
                setErrorMsg(null);
              }}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                activeTab === 'orders'
                  ? 'bg-emerald-50 text-emerald-700 font-bold'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <ShoppingBag className="w-4 h-4" /> Incoming Orders
              </span>
              {incomingOrders.length > 0 && (
                <span className="bg-amber-500 text-white px-2 py-0.5 rounded-full text-[10px] font-bold">
                  {incomingOrders.length}
                </span>
              )}
            </button>

            {/* TAB 3: SALES HISTORY */}
            <button
              onClick={() => {
                setActiveTab('history');
                setSuccessMsg(null);
                setErrorMsg(null);
              }}
              className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                activeTab === 'history'
                  ? 'bg-emerald-50 text-emerald-700 font-bold'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <History className="w-4 h-4" /> Sales History
            </button>

            {/* TAB 4: FARM PROFILE & PHOTO */}
            <button
              onClick={() => {
                setActiveTab('profile');
                setSuccessMsg(null);
                setErrorMsg(null);
              }}
              className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                activeTab === 'profile'
                  ? 'bg-emerald-50 text-emerald-700 font-bold'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <User className="w-4 h-4" /> Farm Profile & Photo
            </button>

            {/* TAB 5: PAYOUTS & SETTINGS */}
            <button
              onClick={() => {
                setActiveTab('settings');
                setSuccessMsg(null);
                setErrorMsg(null);
              }}
              className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                activeTab === 'settings'
                  ? 'bg-emerald-50 text-emerald-700 font-bold'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <CreditCard className="w-4 h-4" /> Payouts & Settings
            </button>
          </nav>

          <div className="pt-6 mt-6 border-t border-gray-100 space-y-2">
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" /> Sign Out
            </button>
          </div>
        </aside>

        {/* MAIN DASHBOARD CONTENT PANEL */}
        <main className="flex-1 bg-white p-6 sm:p-8 rounded-2xl border border-gray-200 shadow-sm">
          {successMsg && (
            <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <span>{successMsg}</span>
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-center gap-2 text-sm">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* TAB 1: YOUR LISTINGS */}
          {(activeTab === 'listings' || activeTab === 'new') && (
            <div>
              <div className="flex items-center justify-between pb-6 mb-6 border-b border-gray-100">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">Your Harvest Listings</h1>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Manage active produce posts or publish a new crop yield.
                  </p>
                </div>
                {activeTab === 'listings' && (
                  <button
                    onClick={() => setActiveTab('new')}
                    className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 px-4 rounded-xl text-xs transition-colors shadow-sm"
                  >
                    <PlusCircle className="w-4 h-4" /> Post New Harvest
                  </button>
                )}
              </div>

              {activeTab === 'listings' && myListings.length === 0 && (
                <div className="text-center py-16 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                  <Sprout className="mx-auto h-12 w-12 text-gray-400 mb-3" />
                  <h3 className="text-base font-semibold text-gray-900">No Active Posts Yet</h3>
                  <button
                    onClick={() => setActiveTab('new')}
                    className="mt-4 inline-flex items-center gap-2 bg-emerald-600 text-white font-semibold py-2.5 px-5 rounded-lg text-xs shadow-sm hover:bg-emerald-700"
                  >
                    <PlusCircle className="w-4 h-4" /> Post Your First Produce Item
                  </button>
                </div>
              )}

              {activeTab === 'listings' && myListings.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {myListings.map((item) => (
                    <div
                      key={item.id}
                      className="p-4 border rounded-xl border-gray-200 shadow-sm bg-white flex justify-between items-start"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded">
                            {item.category}
                          </span>
                          <span className="text-xs text-gray-400">{item.location_name}</span>
                        </div>
                        <h3 className="text-lg font-bold text-gray-900">{item.title}</h3>
                        <p className="text-sm font-semibold text-gray-700">
                          ${Number(item.price_per_unit || 0).toFixed(2)} / {item.unit_type}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDeleteListing(item.id)}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* POST NEW HARVEST FORM */}
              {activeTab === 'new' && (
                <form onSubmit={handleListingSubmit} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Crop Name *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g., Organic Heirloom Tomatoes"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="w-full px-4 py-2 border rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Category
                      </label>
                      <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        className="w-full px-4 py-2 border rounded-lg text-sm bg-white"
                      >
                        <option>Vegetables</option>
                        <option>Fruits & Berries</option>
                        <option>Herbs & Spices</option>
                        <option>Honey & Jam</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-gray-50 rounded-xl border border-gray-100">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Unit Type *
                      </label>
                      <select
                        value={unitType}
                        onChange={(e) => setUnitType(e.target.value)}
                        className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
                      >
                        <option value="lbs">lbs (Pounds)</option>
                        <option value="bunches">Bunches</option>
                        <option value="flats">Flats</option>
                        <option value="pints">Pints</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Price per {unitType} ($) *
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        placeholder="3.50"
                        value={pricePerUnit}
                        onChange={(e) => setPricePerUnit(e.target.value)}
                        className="w-full px-3 py-2 border rounded-lg text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Est. Total {unitType} *
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        required
                        placeholder="25"
                        value={availableQuantity}
                        onChange={(e) => setAvailableQuantity(e.target.value)}
                        className="w-full px-3 py-2 border rounded-lg text-sm"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        City / Area *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g., Phoenix, AZ"
                        value={locationName}
                        onChange={(e) => setLocationName(e.target.value)}
                        className="w-full px-4 py-2 border rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Ready Date *
                      </label>
                      <input
                        type="date"
                        required
                        value={harvestReadyDate}
                        onChange={(e) => setHarvestReadyDate(e.target.value)}
                        className="w-full px-4 py-2 border rounded-lg text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Crop Image (Optional)
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => setImageFile(e.target.files?.[0] || null)}
                      className="w-full px-3 py-2 border rounded-lg text-xs"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 px-6 rounded-xl text-sm transition-colors shadow-md disabled:bg-gray-400"
                  >
                    {loading ? 'Publishing...' : 'Publish Produce Listing'}
                  </button>
                </form>
              )}
            </div>
          )}

          {/* TAB 2: INCOMING ORDERS */}
          {activeTab === 'orders' && (
            <div className="space-y-6">
              <div className="pb-4 border-b border-gray-100">
                <h1 className="text-2xl font-bold text-gray-900">Incoming Buyer Reservations</h1>
                <p className="text-xs text-gray-500 mt-0.5">
                  Confirm orders and mark when harvested produce is ready for pickup.
                </p>
              </div>

              {incomingOrders.length === 0 ? (
                <div className="text-center py-16 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                  <ShoppingBag className="mx-auto h-12 w-12 text-gray-400 mb-3" />
                  <h3 className="text-base font-semibold text-gray-900">No Active Reservations</h3>
                  <p className="text-xs text-gray-500 mt-1">
                    When buyers reserve crops from your listings, they will show up here.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {incomingOrders.map((order) => (
                    <div
                      key={order.id}
                      className="p-5 border rounded-2xl border-gray-200 shadow-sm bg-white flex flex-col md:flex-row justify-between md:items-center gap-4"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase ${
                              order.status === 'pending'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-blue-100 text-blue-800'
                            }`}
                          >
                            {order.status === 'pending' ? 'Pending Harvest' : 'Ready for Pickup'}
                          </span>
                          <span className="text-xs text-gray-400">
                            Order #{order.id.slice(0, 8)}
                          </span>
                        </div>
                        <h3 className="text-base font-bold text-gray-900">
                          {order.produce_listings?.title || 'Harvest Crop'}
                        </h3>
                        <p className="text-xs text-gray-600">
                          Buyer: <span className="font-semibold">{order.buyer_name || order.buyer_email || 'Buyer'}</span> ({order.quantity_reserved} {order.produce_listings?.unit_type || 'units'})
                        </p>
                        <p className="text-xs font-extrabold text-emerald-700">
                          Total Due at Pickup: ${Number(order.total_price || 0).toFixed(2)}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 self-start md:self-auto">
                        {order.status === 'pending' && (
                          <button
                            onClick={() => handleOrderStatusUpdate(order.id, 'ready')}
                            className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition-colors shadow-sm"
                          >
                            <PackageCheck className="w-4 h-4" /> Mark Ready for Pickup
                          </button>
                        )}
                        <button
                          onClick={() => handleOrderStatusUpdate(order.id, 'completed')}
                          className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition-colors shadow-sm"
                        >
                          <Check className="w-4 h-4" /> Mark Completed
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: SALES HISTORY */}
          {activeTab === 'history' && (
            <div className="space-y-6">
              <div className="pb-4 border-b border-gray-100">
                <h1 className="text-2xl font-bold text-gray-900">Sales & Order History</h1>
                <p className="text-xs text-gray-500 mt-0.5">
                  View past fulfilled reservations and completed harvest sales.
                </p>
              </div>

              {salesHistory.length === 0 ? (
                <div className="text-center py-16 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                  <History className="mx-auto h-12 w-12 text-gray-400 mb-3" />
                  <h3 className="text-base font-semibold text-gray-900">No Historical Sales Yet</h3>
                  <p className="text-xs text-gray-500 mt-1">
                    Completed orders will be logged here for your accounting records.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {salesHistory.map((order) => (
                    <div
                      key={order.id}
                      className="p-4 border rounded-xl border-gray-200 bg-gray-50/50 flex justify-between items-center"
                    >
                      <div>
                        <h4 className="text-sm font-bold text-gray-800">
                          {order.produce_listings?.title || 'Produce Sale'}
                        </h4>
                        <p className="text-xs text-gray-500">
                          Completed on {new Date(order.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <span className="text-sm font-black text-emerald-800">
                        ${Number(order.total_price || 0).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: FARM PROFILE & PHOTO */}
          {activeTab === 'profile' && (
            <form onSubmit={handleProfileSubmit} className="space-y-6">
              <div className="pb-4 border-b border-gray-100">
                <h1 className="text-2xl font-bold text-gray-900">Your Farm Profile & Branding</h1>
                <p className="text-xs text-gray-500 mt-0.5">
                  Set your farm photo and name to appear automatically on all postings.
                </p>
              </div>

              <div className="flex items-center gap-6 p-4 bg-gray-50 rounded-xl border border-gray-100">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt="Farm avatar"
                    className="w-20 h-20 rounded-2xl object-cover border-2 border-emerald-500 shadow-sm shrink-0"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                    <Sprout className="w-10 h-10" />
                  </div>
                )}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Upload Farm / Farmer Photo
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setAvatarFile(e.target.files?.[0] || null)}
                    className="text-xs text-gray-500"
                  />
                  <p className="text-[10px] text-gray-400 mt-1">
                    This photo will display beside every harvest listing you publish.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Farm / Stand Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., Sunrise Acres Garden"
                    value={farmName}
                    onChange={(e) => setFarmName(e.target.value)}
                    className="w-full px-4 py-2 border rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Location *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., Phoenix, AZ"
                    value={profileLocation}
                    onChange={(e) => setProfileLocation(e.target.value)}
                    className="w-full px-4 py-2 border rounded-lg text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Farm Bio</label>
                <textarea
                  rows={3}
                  placeholder="Tell buyers about your growing practices..."
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg text-sm"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 px-6 rounded-xl text-sm transition-colors shadow-md disabled:bg-gray-400"
              >
                {loading ? 'Saving Profile...' : 'Save Profile & Branding'}
              </button>
            </form>
          )}

          {/* TAB 5: PAYOUTS & SETTINGS */}
          {activeTab === 'settings' && (
            <form onSubmit={handleProfileSubmit} className="space-y-6">
              <div className="pb-4 border-b border-gray-100">
                <h1 className="text-2xl font-bold text-gray-900">Payout & Payment Preferences</h1>
                <p className="text-xs text-gray-500 mt-0.5">
                  Configure how buyers settle payments when picking up produce.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Accepted Pickup Payment Methods
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full px-4 py-2.5 border rounded-xl text-sm bg-white"
                  >
                    <option value="Cash / Venmo at Pickup">Cash / Venmo at Pickup</option>
                    <option value="Cash Only at Pickup">Cash Only at Pickup</option>
                    <option value="Venmo / Zelle Pre-payment">Venmo / Zelle Pre-payment</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Venmo / Zelle Handle or Phone Number (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="@your-farm-handle or (602) 555-0199"
                    value={venmoHandle}
                    onChange={(e) => setVenmoHandle(e.target.value)}
                    className="w-full px-4 py-2 border rounded-lg text-sm"
                  />
                  <p className="text-[10px] text-gray-400 mt-1">
                    Revealed to buyers on their order confirmation page for easy payment settlement.
                  </p>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 px-6 rounded-xl text-sm transition-colors shadow-md disabled:bg-gray-400"
              >
                {loading ? 'Saving Settings...' : 'Save Payout Preferences'}
              </button>
            </form>
          )}
        </main>
      </div>
    </div>
  );
}