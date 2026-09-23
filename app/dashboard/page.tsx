'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Sprout, Upload, AlertCircle, CheckCircle2, PlusCircle, LayoutDashboard, Trash2, Calendar, LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function SellerDashboardPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'listings' | 'new'>('listings');
  const [loading, setLoading] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Seller State
  const [user, setUser] = useState<any>(null);
  const [myListings, setMyListings] = useState<any[]>([]);

  // Form State
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

  useEffect(() => {
    fetchListings();
  }, [router]);

  const fetchListings = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      router.push('/login?redirectTo=/dashboard');
      return;
    }

    setUser(session.user);

    const { data: listings, error } = await supabase
      .from('produce_listings')
      .select('*')
      .eq('farmer_id', session.user.id)
      .order('created_at', { ascending: false });

    if (!error) {
      setMyListings(listings || []);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();

      if (userError || !user) {
        router.push('/login?redirectTo=/dashboard');
        throw new Error('You must be logged in as a grower to publish a listing.');
      }

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

      setSuccess(true);
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

      await fetchListings();
      setActiveTab('listings');
    } catch (err: any) {
      setErrorMsg(err.message || 'Something went wrong saving your listing.');
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
    <div className="max-w-5xl mx-auto p-6 bg-white shadow-md rounded-xl my-10 border border-green-100">
      {/* Top Title Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-green-100 text-green-700 rounded-lg">
            <Sprout className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Seller Dashboard</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Logged in as <span className="font-semibold text-gray-700">{user?.email}</span>
            </p>
          </div>
        </div>

        {/* Tab & Auth Controls */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg">
            <button
              onClick={() => { setActiveTab('listings'); setSuccess(false); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                activeTab === 'listings'
                  ? 'bg-white text-green-700 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5" /> My Posts ({myListings.length})
            </button>
            <button
              onClick={() => { setActiveTab('new'); setSuccess(false); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                activeTab === 'new'
                  ? 'bg-green-600 text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <PlusCircle className="w-3.5 h-3.5" /> Post New Harvest
            </button>
          </div>

          <button
            onClick={handleSignOut}
            className="p-2 border border-gray-200 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            title="Sign Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {success && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 text-green-800 rounded-lg flex items-center gap-2 text-sm">
          <CheckCircle2 className="w-5 h-5 text-green-600" />
          <span>Listing successfully published to <strong>Farm Fresh Direct</strong>!</span>
        </div>
      )}

      {/* Tab 1: Manage Posts */}
      {activeTab === 'listings' && (
        <div>
          {myListings.length === 0 ? (
            <div className="text-center py-16 bg-gray-50 rounded-xl border border-dashed border-gray-200">
              <Sprout className="mx-auto h-12 w-12 text-gray-400 mb-3" />
              <h3 className="text-base font-semibold text-gray-900">No Harvest Listings Posted Yet</h3>
              <p className="text-xs text-gray-500 mt-1 mb-6">
                Turn your extra garden yields or farm crops into income.
              </p>
              <button
                onClick={() => setActiveTab('new')}
                className="inline-flex items-center gap-2 bg-green-600 text-white font-semibold py-2.5 px-5 rounded-lg text-xs shadow-sm hover:bg-green-700"
              >
                <PlusCircle className="w-4 h-4" /> Create Your First Produce Post
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {myListings.map((item) => (
                <div key={item.id} className="p-4 border rounded-xl border-gray-200 shadow-sm bg-white flex justify-between items-start">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-green-800 bg-green-100 px-2 py-0.5 rounded">
                        {item.category}
                      </span>
                      <span className="text-xs text-gray-400">{item.location_name} ({item.zip_code})</span>
                    </div>
                    <h3 className="text-lg font-bold text-gray-900">{item.title}</h3>
                    <p className="text-sm font-semibold text-gray-700">
                      ${item.price_per_unit.toFixed(2)} / {item.unit_type}
                    </p>
                    <p className="text-xs text-gray-500 flex items-center gap-1 pt-1">
                      <Calendar className="w-3.5 h-3.5" /> Ready: {item.harvest_ready_date}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDeleteListing(item.id)}
                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete Post"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Publish Form */}
      {activeTab === 'new' && (
        <div>
          {errorMsg && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg flex items-center gap-2 text-sm">
              <AlertCircle className="w-5 h-5 text-red-500" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Crop / Product Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Organic Heirloom Tomatoes"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 focus:outline-none bg-white"
                >
                  <option>Vegetables</option>
                  <option>Fruits & Berries</option>
                  <option>Herbs & Spices</option>
                  <option>Microgreens</option>
                  <option>Honey & Jam</option>
                  <option>Eggs & Dairy</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg border border-gray-100">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Unit Type *</label>
                <select
                  value={unitType}
                  onChange={(e) => setUnitType(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 bg-white"
                >
                  <option value="lbs">lbs (Pounds)</option>
                  <option value="bunches">Bunches</option>
                  <option value="flats">Flats / Trays</option>
                  <option value="pints">Pints / Quart</option>
                  <option value="pieces">Individual Pieces</option>
                  <option value="bag">Bag</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Price per {unitType} ($) *</label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-gray-400">$</span>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="3.50"
                    value={pricePerUnit}
                    onChange={(e) => setPricePerUnit(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Est. Total {unitType} *</label>
                <input
                  type="number"
                  step="0.1"
                  required
                  placeholder="25"
                  value={availableQuantity}
                  onChange={(e) => setAvailableQuantity(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">City / Area *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Phoenix, AZ"
                  value={locationName}
                  onChange={(e) => setLocationName(e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Zip Code *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., 85001"
                  value={zipCode}
                  onChange={(e) => setZipCode(e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ready for Pickup Date *</label>
                <input
                  type="date"
                  required
                  value={harvestReadyDate}
                  onChange={(e) => setHarvestReadyDate(e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Available Until (Optional)</label>
                <input
                  type="date"
                  value={harvestEndDate}
                  onChange={(e) => setHarvestEndDate(e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description / Growing Methods</label>
              <textarea
                rows={3}
                placeholder="Tell buyers how it was grown (e.g., pesticide-free, no chemical fertilizers)..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Pickup Instructions & Location *</label>
              <textarea
                rows={2}
                required
                placeholder="e.g., Porch pickup at driveway, or meet at Farm Stand on Saturday 8am-12pm."
                value={pickupInstructions}
                onChange={(e) => setPickupInstructions(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Produce Photo</label>
              <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-lg hover:border-green-400 transition-colors">
                <div className="space-y-1 text-center">
                  {imagePreview ? (
                    <div className="flex flex-col items-center">
                      <img src={imagePreview} alt="Preview" className="h-32 object-cover rounded-lg mb-2" />
                      <button
                        type="button"
                        onClick={() => { setImageFile(null); setImagePreview(null); }}
                        className="text-xs text-red-600 underline"
                      >
                        Remove image
                      </button>
                    </div>
                  ) : (
                    <>
                      <Upload className="mx-auto h-10 w-10 text-gray-400" />
                      <div className="flex text-sm text-gray-600">
                        <label className="relative cursor-pointer bg-white rounded-md font-medium text-green-600 hover:text-green-500">
                          <span>Upload a file</span>
                          <input type="file" accept="image/*" className="sr-only" onChange={handleImageChange} />
                        </label>
                        <p className="pl-1">or drag and drop</p>
                      </div>
                      <p className="text-xs text-gray-500">PNG, JPG, WEBP up to 5MB</p>
                    </>
                  )}
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors shadow-md disabled:bg-gray-400"
            >
              {loading ? 'Publishing Listing...' : 'Publish Produce Listing'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}