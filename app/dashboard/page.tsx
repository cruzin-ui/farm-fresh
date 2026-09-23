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
  Image as ImageIcon,
  ExternalLink,
  ShoppingBag,
  History,
  Settings,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function SellerDashboardPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'listings' | 'new' | 'orders' | 'history' | 'profile' | 'settings'>('listings');
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
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  // Profile Form State
  const [farmName, setFarmName] = useState('');
  const [bio, setBio] = useState('');
  const [profileLocation, setProfileLocation] = useState('');
  const [profileZip, setProfileZip] = useState('');
  const [growingPractices, setGrowingPractices] = useState('No Synthetic Pesticides');
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [galleryUrls, setGalleryUrls] = useState<string[]>([]);
  const [uploadingGallery, setUploadingGallery] = useState(false);

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

    // 1. Fetch Seller Listings
    const { data: listings } = await supabase
      .from('produce_listings')
      .select('*')
      .eq('farmer_id', currentUserId)
      .order('created_at', { ascending: false });

    if (listings) setMyListings(listings);

    // 2. Fetch Orders
    const { data: orders } = await supabase
      .from('orders')
      .select('*, produce_listings(title, unit_type)')
      .order('created_at', { ascending: false });

    if (orders) {
      setIncomingOrders(orders.filter((o) => o.status !== 'completed'));
      setSalesHistory(orders.filter((o) => o.status === 'completed'));
    }

    // 3. Fetch Seller Profile
    const { data: profile } = await supabase
      .from('seller_profiles')
      .select('*')
      .eq('id', currentUserId)
      .maybeSingle();

    if (profile) {
      setFarmName(profile.farm_name || '');
      setBio(profile.bio || '');
      setProfileLocation(profile.location || '');
      setProfileZip(profile.zip_code || '');
      setGrowingPractices(profile.growing_practices || 'No Synthetic Pesticides');
      setCoverPreview(profile.cover_image_url || null);
      setGalleryUrls(profile.gallery_urls || []);
    }

    setAuthChecking(false);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setCoverFile(file);
      setCoverPreview(URL.createObjectURL(file));
    }
  };

  const handleGalleryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0 || !user) return;
    setUploadingGallery(true);
    setErrorMsg(null);

    try {
      const files = Array.from(e.target.files);
      const newUrls: string[] = [];

      for (const file of files) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${user.id}/gallery_${Date.now()}_${Math.random()
          .toString(36)
          .substring(2, 7)}.${fileExt}`;

        const { error: uploadErr } = await supabase.storage
          .from('produce-images')
          .upload(fileName, file);

        if (uploadErr) throw uploadErr;

        const { data: publicData } = supabase.storage
          .from('produce-images')
          .getPublicUrl(fileName);

        if (publicData?.publicUrl) {
          newUrls.push(publicData.publicUrl);
        }
      }

      setGalleryUrls((prev) => [...prev, ...newUrls]);
    } catch (err: any) {
      setErrorMsg(`Failed uploading gallery photos: ${err.message}`);
    } finally {
      setUploadingGallery(false);
    }
  };

  const removeGalleryImage = (indexToRemove: number) => {
    setGalleryUrls((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const handleDeleteListing = async (id: string) => {
    if (!confirm('Are you sure you want to remove this harvest listing?')) return;

    const { error } = await supabase
      .from('produce_listings')
      .delete()
      .eq('id', id);

    if (error) {
      alert(`Could not delete listing: ${error.message}`);
    } else {
      setMyListings((prev) => prev.filter((item) => item.id !== id));
    }
  };

  const handleListingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      if (!user) throw new Error('Authentication expired. Please log in again.');

      let imageUrl = null;

      if (imageFile) {
        const fileExt = imageFile.name.split('.').pop();
        const fileName = `${user.id}/${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('produce-images')
          .upload(fileName, imageFile);

        if (uploadError) throw new Error(`Image upload failed: ${uploadError.message}`);

        const { data: publicUrlData } = supabase.storage
          .from('produce-images')
          .getPublicUrl(fileName);

        imageUrl = publicUrlData.publicUrl;
      }

      const { error: insertError } = await supabase
        .from('produce_listings')
        .insert([
          {
            farmer_id: user.id,
            title,
            category,
            description,
            unit_type: unitType,
            price_per_unit: parseFloat(pricePerUnit),
            available_quantity: parseFloat(availableQuantity),
            harvest_ready_date: harvestReadyDate,
            harvest_end_date: harvestEndDate || null,
            location_name: locationName,
            zip_code: zipCode,
            pickup_instructions: pickupInstructions,
            image_url: imageUrl,
            status: 'active',
          },
        ]);

      if (insertError) throw insertError;

      setSuccessMsg('Listing successfully published to Farm Fresh Direct!');
      setTitle('');
      setDescription('');
      setPricePerUnit('');
      setAvailableQuantity('');
      setHarvestReadyDate('');
      setHarvestEndDate('');
      setLocationName('');
      setZipCode('');
      setPickupInstructions('');
      setImageFile(null);
      setImagePreview(null);

      await fetchDashboardData();
      setActiveTab('listings');
    } catch (err: any) {
      setErrorMsg(err.message || 'Something went wrong saving your listing.');
    } finally {
      setLoading(false);
    }
  };

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      if (!user) throw new Error('Authentication required.');

      let coverUrl = coverPreview;

      if (coverFile) {
        const fileExt = coverFile.name.split('.').pop();
        const fileName = `${user.id}/cover_${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('produce-images')
          .upload(fileName, coverFile);

        if (uploadError) throw uploadError;

        const { data: publicUrlData } = supabase.storage
          .from('produce-images')
          .getPublicUrl(fileName);

        coverUrl = publicUrlData.publicUrl;
      }

      const profilePayload = {
        id: user.id,
        farm_name: farmName,
        bio,
        location: profileLocation,
        zip_code: profileZip,
        growing_practices: growingPractices,
        cover_image_url: coverUrl,
        gallery_urls: galleryUrls,
      };

      const { error: upsertError } = await supabase
        .from('seller_profiles')
        .upsert(profilePayload);

      if (upsertError) throw upsertError;

      setSuccessMsg('Farm profile successfully updated!');
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update farm profile.');
    } finally {
      setLoading(false);
    }
  };

  if (authChecking) {
    return (
      <div className="max-w-4xl mx-auto my-20 p-8 text-center text-gray-500">
        Loading Seller Dashboard...
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex flex-col md:flex-row gap-8">
        {/* SIDEBAR NAVIGATION */}
        <aside className="w-full md:w-64 bg-white p-5 rounded-2xl border border-gray-200 shadow-sm shrink-0 self-start">
          <div className="flex items-center gap-3 pb-6 mb-6 border-b border-gray-100">
            <div className="p-2.5 bg-green-100 text-green-700 rounded-xl">
              <Sprout className="w-6 h-6" />
            </div>
            <div className="overflow-hidden">
              <h2 className="font-extrabold text-gray-900 text-base truncate">{farmName || 'My Farm'}</h2>
              <p className="text-xs text-gray-400 truncate">{user?.email}</p>
            </div>
          </div>

          <nav className="space-y-1">
            <button
              onClick={() => { setActiveTab('listings'); setSuccessMsg(null); setErrorMsg(null); }}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                activeTab === 'listings' || activeTab === 'new'
                  ? 'bg-green-50 text-green-700 font-bold'
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

            <button
              onClick={() => { setActiveTab('orders'); setSuccessMsg(null); setErrorMsg(null); }}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                activeTab === 'orders'
                  ? 'bg-green-50 text-green-700 font-bold'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <ShoppingBag className="w-4 h-4" /> Orders & Pickups
              </span>
              {incomingOrders.length > 0 && (
                <span className="bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full text-[10px]">
                  {incomingOrders.length}
                </span>
              )}
            </button>

            <button
              onClick={() => { setActiveTab('history'); setSuccessMsg(null); setErrorMsg(null); }}
              className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                activeTab === 'history'
                  ? 'bg-green-50 text-green-700 font-bold'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <History className="w-4 h-4" /> Order History
            </button>

            <button
              onClick={() => { setActiveTab('profile'); setSuccessMsg(null); setErrorMsg(null); }}
              className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                activeTab === 'profile'
                  ? 'bg-green-50 text-green-700 font-bold'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <User className="w-4 h-4" /> Your Profile
            </button>

            <button
              onClick={() => { setActiveTab('settings'); setSuccessMsg(null); setErrorMsg(null); }}
              className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                activeTab === 'settings'
                  ? 'bg-green-50 text-green-700 font-bold'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Settings className="w-4 h-4" /> Settings & Payouts
            </button>
          </nav>

          <div className="pt-6 mt-6 border-t border-gray-100 space-y-2">
            {user?.id && (
              <Link
                href={`/sellers/${user.id}`}
                target="_blank"
                className="w-full flex items-center justify-between px-3.5 py-2 text-xs font-semibold text-green-700 bg-green-50/50 hover:bg-green-50 rounded-lg transition-colors"
              >
                <span>View Public Page</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>
            )}

            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" /> Sign Out
            </button>
          </div>
        </aside>

        {/* MAIN DASHBOARD CONTENT */}
        <main className="flex-1 bg-white p-6 sm:p-8 rounded-2xl border border-gray-200 shadow-sm">
          {successMsg && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 text-green-800 rounded-xl flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
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
                  <p className="text-xs text-gray-500 mt-0.5">Manage active produce posts or publish a new crop yield.</p>
                </div>
                {activeTab === 'listings' && (
                  <button
                    onClick={() => setActiveTab('new')}
                    className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded-xl text-xs transition-colors shadow-sm"
                  >
                    <PlusCircle className="w-4 h-4" /> Post New Harvest
                  </button>
                )}
              </div>

              {activeTab === 'listings' && myListings.length === 0 && (
                <div className="text-center py-16 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                  <Sprout className="mx-auto h-12 w-12 text-gray-400 mb-3" />
                  <h3 className="text-base font-semibold text-gray-900">No Active Posts Yet</h3>
                  <p className="text-xs text-gray-500 mt-1 mb-6">Start selling your surplus produce locally.</p>
                  <button
                    onClick={() => setActiveTab('new')}
                    className="inline-flex items-center gap-2 bg-green-600 text-white font-semibold py-2.5 px-5 rounded-lg text-xs shadow-sm hover:bg-green-700"
                  >
                    <PlusCircle className="w-4 h-4" /> Post Your First Produce Item
                  </button>
                </div>
              )}

              {activeTab === 'listings' && myListings.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {myListings.map((item) => (
                    <div key={item.id} className="p-4 border rounded-xl border-gray-200 shadow-sm bg-white flex justify-between items-start">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-green-800 bg-green-100 px-2 py-0.5 rounded">
                            {item.category}
                          </span>
                          <span className="text-xs text-gray-400">{item.location_name}</span>
                        </div>
                        <h3 className="text-lg font-bold text-gray-900">{item.title}</h3>
                        <p className="text-sm font-semibold text-gray-700">
                          ${item.price_per_unit.toFixed(2)} / {item.unit_type}
                        </p>
                        <p className="text-xs text-gray-500 flex items-center gap-1 pt-1">
                          <Calendar className="w-3.5 h-3.5" /> Stock: {item.available_quantity} {item.unit_type} remaining
                        </p>
                      </div>
                      <button
                        onClick={() => handleDeleteListing(item.id)}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete Listing"
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
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Crop Name *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g., Organic Heirloom Tomatoes"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="w-full px-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-green-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Category</label>
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
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Unit Type *</label>
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
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Price per {unitType} ($) *</label>
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
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Est. Total {unitType} *</label>
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
                      <label className="block text-xs font-semibold text-gray-700 mb-1">City / Area *</label>
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
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Zip Code *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g., 85001"
                        value={zipCode}
                        onChange={(e) => setZipCode(e.target.value)}
                        className="w-full px-4 py-2 border rounded-lg text-sm"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Ready for Pickup Date *</label>
                      <input
                        type="date"
                        required
                        value={harvestReadyDate}
                        onChange={(e) => setHarvestReadyDate(e.target.value)}
                        className="w-full px-4 py-2 border rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Pickup Instructions *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g., Porch pickup at driveway"
                        value={pickupInstructions}
                        onChange={(e) => setPickupInstructions(e.target.value)}
                        className="w-full px-4 py-2 border rounded-lg text-sm"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-6 rounded-xl text-sm transition-colors shadow-md disabled:bg-gray-400"
                  >
                    {loading ? 'Publishing...' : 'Publish Produce Listing'}
                  </button>
                </form>
              )}
            </div>
          )}

          {/* TAB 2: ORDERS & PICKUPS */}
          {activeTab === 'orders' && (
            <div>
              <div className="pb-6 mb-6 border-b border-gray-100">
                <h1 className="text-2xl font-bold text-gray-900">Incoming Buyer Reservations</h1>
                <p className="text-xs text-gray-500 mt-0.5">Manage pending pickups and verify orders from local buyers.</p>
              </div>

              {incomingOrders.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-xl text-gray-500 text-sm">
                  No pending pickup reservations at this moment.
                </div>
              ) : (
                <div className="space-y-4">
                  {incomingOrders.map((order) => (
                    <div key={order.id} className="p-4 border rounded-xl border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full uppercase">
                          {order.status || 'Pending Pickup'}
                        </span>
                        <h3 className="font-bold text-gray-900 mt-1">{order.produce_listings?.title}</h3>
                        <p className="text-xs text-gray-500">
                          Reserved: {order.reserved_quantity} {order.produce_listings?.unit_type}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="text-lg font-extrabold text-gray-900">${order.authorized_amount}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: ORDER HISTORY */}
          {activeTab === 'history' && (
            <div>
              <div className="pb-6 mb-6 border-b border-gray-100">
                <h1 className="text-2xl font-bold text-gray-900">Completed Order History</h1>
                <p className="text-xs text-gray-500 mt-0.5">Log of all completed sales and fulfilled buyer pickups.</p>
              </div>

              {salesHistory.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-xl text-gray-500 text-sm">
                  No completed transactions recorded in your history yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {salesHistory.map((item) => (
                    <div key={item.id} className="p-4 border border-gray-100 rounded-xl flex justify-between items-center text-sm">
                      <div>
                        <h4 className="font-bold text-gray-900">{item.produce_listings?.title}</h4>
                        <p className="text-xs text-gray-400">{new Date(item.created_at).toLocaleDateString()}</p>
                      </div>
                      <span className="font-bold text-green-700">+${item.authorized_amount}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: FARM PROFILE */}
          {activeTab === 'profile' && (
            <form onSubmit={handleProfileSubmit} className="space-y-6">
              <div className="pb-4 border-b border-gray-100">
                <h1 className="text-2xl font-bold text-gray-900">Your Farm Profile</h1>
                <p className="text-xs text-gray-500 mt-0.5">Edit public farm details, bio, and gallery pictures for buyers.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Farm / Stand Name *</label>
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
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Growing Practices</label>
                  <select
                    value={growingPractices}
                    onChange={(e) => setGrowingPractices(e.target.value)}
                    className="w-full px-4 py-2 border rounded-lg text-sm bg-white"
                  >
                    <option value="No Synthetic Pesticides">No Synthetic Pesticides</option>
                    <option value="Certified Organic">Certified Organic</option>
                    <option value="Hydroponic">Hydroponic</option>
                    <option value="Home Garden Surplus">Home Garden Surplus</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">City / Location *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., Phoenix, AZ"
                    value={profileLocation}
                    onChange={(e) => setProfileLocation(e.target.value)}
                    className="w-full px-4 py-2 border rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Zip Code *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., 85001"
                    value={profileZip}
                    onChange={(e) => setProfileZip(e.target.value)}
                    className="w-full px-4 py-2 border rounded-lg text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Farm Story / Bio</label>
                <textarea
                  rows={3}
                  placeholder="Tell buyers about your growing setup and history..."
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg text-sm"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-6 rounded-xl text-sm transition-colors shadow-md disabled:bg-gray-400"
              >
                {loading ? 'Saving Profile...' : 'Save Profile Changes'}
              </button>
            </form>
          )}

          {/* TAB 5: SETTINGS & PAYOUTS */}
          {activeTab === 'settings' && (
            <div>
              <div className="pb-6 mb-6 border-b border-gray-100">
                <h1 className="text-2xl font-bold text-gray-900">Settings & Payout Preferences</h1>
                <p className="text-xs text-gray-500 mt-0.5">Manage how you receive payments from local buyers.</p>
              </div>

              <div className="bg-gray-50 p-6 rounded-xl border border-gray-200 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-gray-900 text-sm">Direct Local Payouts</h3>
                    <p className="text-xs text-gray-500">Collect payment via cash or preferred digital methods at pickup.</p>
                  </div>
                  <span className="text-xs font-bold text-green-700 bg-green-100 px-3 py-1 rounded-full">
                    Enabled
                  </span>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}