'use client';

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { postWithAuth } from '@/lib/authedFetch';
import { resizeImage } from '@/lib/resizeImage';
import { SELLER_FEE_RATE } from '@/lib/pricing';
import AddressAutocomplete from '@/components/AddressAutocomplete';
import {
  Sprout,
  AlertCircle,
  CheckCircle2,
  PlusCircle,
  LayoutDashboard,
  Trash2,
  Pencil,
  LogOut,
  User,
  ShoppingBag,
  History,
  CreditCard,
  Check,
  PackageCheck,
  Camera,
  ImageIcon,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { loadConnectAndInitialize } from '@stripe/connect-js/pure';
import type { StripeConnectInstance } from '@stripe/connect-js';
import { ConnectComponentsProvider, ConnectAccountOnboarding } from '@stripe/react-connect-js';

type DashboardTab = 'listings' | 'new' | 'orders' | 'history' | 'profile' | 'settings';

const UNIT_TYPE_OPTIONS = [
  { value: 'lbs', label: 'lbs (Pounds)' },
  { value: 'oz', label: 'oz (Ounces)' },
  { value: 'kg', label: 'kg (Kilograms)' },
  { value: 'units', label: 'Units (each, e.g. per pumpkin)' },
  { value: 'dozen', label: 'Dozen' },
  { value: 'bunches', label: 'Bunches' },
  { value: 'bags', label: 'Bags' },
  { value: 'flats', label: 'Flats' },
  { value: 'pints', label: 'Pints' },
  { value: 'quarts', label: 'Quarts' },
  { value: 'jars', label: 'Jars' },
  { value: 'packets', label: 'Packets (e.g. seed packets)' },
];

// Short labels a farmer can attach to a listing; up to MAX_LISTING_TAGS show
// on the Browse card.
const LISTING_TAG_OPTIONS = [
  'Pesticide Free',
  'Organically Grown',
  'Independent Grower',
  'Family Farm',
  'Non-GMO',
  'Heirloom Variety',
  'No Synthetic Fertilizers',
  'Hand Harvested',
  'Picked to Order',
  'Regenerative',
  'Hydroponic',
  'Raw & Unfiltered',
];
const MAX_LISTING_TAGS = 3;

export default function SellerDashboardPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<DashboardTab>('listings');
  const [loading, setLoading] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [user, setUser] = useState<any>(null);
  const [myListings, setMyListings] = useState<any[]>([]);
  const [incomingOrders, setIncomingOrders] = useState<any[]>([]);
  const [salesHistory, setSalesHistory] = useState<any[]>([]);

  // Listing Form State
  // Set while the listing form is editing an existing post instead of creating one
  const [editingListingId, setEditingListingId] = useState<string | null>(null);
  const [showInactiveListings, setShowInactiveListings] = useState(false);
  // null = the farmer hasn't opened or closed the "how selling works" guide
  // themselves, so it follows the default (open until setup is finished).
  const [guideOpen, setGuideOpen] = useState<boolean | null>(null);
  // Sellers agree to the Seller Terms once, before their first listing.
  const [sellerTermsAccepted, setSellerTermsAccepted] = useState(false);
  const [sellerTermsChecked, setSellerTermsChecked] = useState(false);
  const [defaultPickupAddress, setDefaultPickupAddress] = useState('');
  const [title, setTitle] = useState('');
  const [variety, setVariety] = useState('');
  const [category, setCategory] = useState('Vegetables');
  const [description, setDescription] = useState('');
  const [unitType, setUnitType] = useState('lbs');
  const [pricePerUnit, setPricePerUnit] = useState('');
  const [availableQuantity, setAvailableQuantity] = useState('');
  const [harvestReadyDate, setHarvestReadyDate] = useState('');
  const [harvestEndDate, setHarvestEndDate] = useState('');
  const [locationName, setLocationName] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [pickupAddress, setPickupAddress] = useState('');
  // True when the address was picked from the lookup suggestions (or was
  // already saved), rather than typed freehand.
  const [pickupAddressVerified, setPickupAddressVerified] = useState(false);
  const [listingTags, setListingTags] = useState<string[]>([]);
  const [lookingUpZip, setLookingUpZip] = useState(false);
  const [zipNotFound, setZipNotFound] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);

  const cropCameraInputRef = useRef<HTMLInputElement>(null);
  const cropLibraryInputRef = useRef<HTMLInputElement>(null);

  // Profile Form State
  const [farmName, setFarmName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  // Banner shown across the top of the farm's public page
  const [coverUrl, setCoverUrl] = useState('');
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(null);
  const [bio, setBio] = useState('');
  const [profileLocation, setProfileLocation] = useState('');
  const [profileZip, setProfileZip] = useState('');
  const [growingPractices, setGrowingPractices] = useState('No Synthetic Pesticides');

  const avatarCameraInputRef = useRef<HTMLInputElement>(null);
  const avatarLibraryInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  // Stripe Connect onboarding state
  const [stripeAccountId, setStripeAccountId] = useState<string | null>(null);
  const [stripeOnboardingComplete, setStripeOnboardingComplete] = useState(false);
  const [connectInstance, setConnectInstance] = useState<StripeConnectInstance | null>(null);
  const [settingUpPayouts, setSettingUpPayouts] = useState(false);

  // Mark Ready flow — per-order draft of the pickup message before sending
  const [readyDraftOrderId, setReadyDraftOrderId] = useState<string | null>(null);
  const [readyDraftText, setReadyDraftText] = useState('');
  const [sendingReady, setSendingReady] = useState(false);

  // Complete flow — the farmer enters the pickup code the buyer gives them
  const [completeOrderId, setCompleteOrderId] = useState<string | null>(null);
  const [completeCode, setCompleteCode] = useState('');
  const [submittingComplete, setSubmittingComplete] = useState(false);
  // Other items from the same buyer's checkout being handed over in the same
  // visit — one pickup code covers them all.
  const [completeAlsoIds, setCompleteAlsoIds] = useState<string[]>([]);

  // Cancel / Adjust flow — per-order draft of the reduced quantity (0 = cancel)
  const [adjustOrderId, setAdjustOrderId] = useState<string | null>(null);
  const [adjustQuantity, setAdjustQuantity] = useState('0');
  const [adjustNote, setAdjustNote] = useState('');
  const [adjustRestock, setAdjustRestock] = useState(false);
  const [submittingAdjust, setSubmittingAdjust] = useState(false);

  useEffect(() => {
    fetchDashboardData();
  }, [router]);

  const fetchDashboardData = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      router.push('/login?redirect=/dashboard');
      return;
    }

    const currentUserId = session.user.id;
    setUser(session.user);

    const { data: listings } = await supabase
      .from('produce_listings')
      .select('*')
      .eq('farmer_id', currentUserId)
      .order('created_at', { ascending: false });

    const { data: addressRows } = await supabase
      .from('listing_pickup_addresses')
      .select('listing_id, address')
      .eq('farmer_id', currentUserId);

    const addressByListing = new Map((addressRows || []).map((a) => [a.listing_id, a.address]));
    const listingsWithAddress = (listings || []).map((l) => ({
      ...l,
      pickup_address: addressByListing.get(l.id) || '',
    }));

    if (listings) setMyListings(listingsWithAddress);

    const { data: termsRow } = await supabase
      .from('seller_terms_acceptances')
      .select('accepted_at')
      .eq('user_id', currentUserId)
      .maybeSingle();
    setSellerTermsAccepted(Boolean(termsRow));

    // Start new listings from the most recent pickup address — most farmers
    // only ever have one.
    const lastAddress = listingsWithAddress.find((l) => l.pickup_address)?.pickup_address || '';
    setDefaultPickupAddress(lastAddress);
    setPickupAddress((current) => {
      if (current || !lastAddress) return current;
      setPickupAddressVerified(true);
      return lastAddress;
    });

    const { data: profile } = await supabase
      .from('seller_profiles')
      .select('*')
      .eq('id', currentUserId)
      .maybeSingle();

    if (profile) {
      setFarmName(profile.farm_name || '');
      setAvatarUrl(profile.avatar_url || '');
      setCoverUrl(profile.cover_image_url || '');
      setBio(profile.bio || '');
      setProfileLocation(profile.location || '');
      setProfileZip(profile.zip_code || '');
      setGrowingPractices(profile.growing_practices || 'No Synthetic Pesticides');
      // Start new listings from the farm's own location so it rarely needs typing.
      setZipCode((current) => current || profile.zip_code || '');
      setLocationName((current) => current || profile.location || '');
      setStripeAccountId(profile.stripe_account_id || null);
      setStripeOnboardingComplete(Boolean(profile.stripe_onboarding_complete));
    }

    const listingIds = (listings || []).map((l) => l.id);
    const listingLookup = (listings || []).reduce((acc, l) => {
      acc[l.id] = l;
      return acc;
    }, {} as Record<string, any>);

    if (listingIds.length > 0) {
      const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select('*')
        .in('listing_id', listingIds)
        .order('created_at', { ascending: false });

      if (ordersError) {
        console.error('Failed to fetch orders:', ordersError);
      } else if (orders) {
        const merged = orders.map((o) => ({
          ...o,
          listing_title: listingLookup[o.listing_id]?.title || 'Harvest Crop',
          listing_unit_type: listingLookup[o.listing_id]?.unit_type || 'units',
          listing_pickup_instructions: listingLookup[o.listing_id]?.pickup_instructions || '',
        }));

        setIncomingOrders(
          merged.filter((o) => o.status === 'pending_pickup' || o.status === 'ready_for_pickup')
        );
        // Pickup codes are hidden from farmers until an order is completed;
        // after that they're shown in Sales History as a record.
        let completedCodes: Record<string, string> = {};
        try {
          const codesRes = await postWithAuth('/api/orders/completed-codes');
          if (codesRes.ok) completedCodes = (await codesRes.json()).codes || {};
        } catch (codesErr) {
          console.error('Failed to fetch completed pickup codes:', codesErr);
        }

        setSalesHistory(
          merged
            .filter((o) => o.status === 'completed' || o.status === 'cancelled')
            .map((o) => ({ ...o, used_pickup_code: completedCodes[o.id] || null }))
        );
      }
    } else {
      setIncomingOrders([]);
      setSalesHistory([]);
    }

    setAuthChecking(false);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

  // Listings that have ever been ordered. These can't be deleted or have their
  // crop name, variety, category or unit changed — their orders depend on them.
  const listingIdsWithOrders = new Set(
    [...incomingOrders, ...salesHistory].map((o) => o.listing_id)
  );

  // "Your Listings" shows what's on sale. Sold-out and taken-down listings are
  // tucked behind a toggle — their sales are already in Sales History — but
  // kept reachable so the farmer can restock one instead of reposting it.
  const activeListings = myListings.filter((l) => Number(l.available_quantity ?? 0) >= 1);
  const inactiveListings = myListings.filter((l) => Number(l.available_quantity ?? 0) < 1);
  const visibleListings = showInactiveListings ? [...activeListings, ...inactiveListings] : activeListings;

  // The getting-started steps a farmer has already done, for the guide.
  const profileDone = Boolean(farmName.trim());
  const payoutsDone = stripeOnboardingComplete;
  const listingDone = myListings.length > 0;
  const setupComplete = profileDone && payoutsDone && listingDone;

  const handleDeleteListing = async (id: string) => {
    const hasOrders = listingIdsWithOrders.has(id);

    if (
      !confirm(
        hasOrders
          ? 'This listing has orders, so it will be taken down from Browse instead of deleted. Your existing orders are not affected. Continue?'
          : 'Are you sure you want to delete this harvest listing?'
      )
    ) {
      return;
    }

    try {
      const res = await postWithAuth('/api/listings/remove', { listingId: id });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not remove listing.');

      setSuccessMsg(
        data.takenDown
          ? 'Listing taken down from Browse. Edit it and set a quantity to put it back on sale.'
          : 'Listing deleted.'
      );
      await fetchDashboardData();
    } catch (err: any) {
      alert(err.message || 'Could not remove listing.');
    }
  };

  const resetListingForm = () => {
    setEditingListingId(null);
    setTitle('');
    setVariety('');
    setCategory('Vegetables');
    setDescription('');
    setUnitType('lbs');
    setPricePerUnit('');
    setAvailableQuantity('');
    setHarvestReadyDate('');
    setHarvestEndDate('');
    setPickupAddress(defaultPickupAddress);
    setPickupAddressVerified(Boolean(defaultPickupAddress));
    setListingTags([]);
    setImageFile(null);
    setImagePreviewUrl(null);
    setZipCode(profileZip);
    setLocationName(profileLocation);
  };

  const startNewListing = () => {
    if (editingListingId) resetListingForm();
    setSuccessMsg(null);
    setErrorMsg(null);
    setActiveTab('new');
  };

  const startEditListing = (item: any) => {
    setEditingListingId(item.id);
    setTitle(item.title || '');
    setVariety(item.variety || '');
    setCategory(item.category || 'Vegetables');
    setDescription(item.description || '');
    setUnitType(item.unit_type || 'lbs');
    setPricePerUnit(item.price_per_unit != null ? String(item.price_per_unit) : '');
    setAvailableQuantity(item.available_quantity != null ? String(item.available_quantity) : '');
    setHarvestReadyDate(item.harvest_ready_date || '');
    setHarvestEndDate(item.harvest_end_date || '');
    setPickupAddress(item.pickup_address || '');
    setPickupAddressVerified(Boolean(item.pickup_address));
    setListingTags(Array.isArray(item.tags) ? item.tags.slice(0, MAX_LISTING_TAGS) : []);
    setZipCode(item.zip_code || '');
    setLocationName(item.location_name || '');
    setImageFile(null);
    setImagePreviewUrl(item.image_url || null);
    setSuccessMsg(null);
    setErrorMsg(null);
    setActiveTab('new');
  };

  // "Mark Completed" goes through the API because completing an order is what
  // releases the farmer's payout for it.
  // The buyer's other open items with this farm from the same checkout.
  const sameCheckoutOrders = (order: any) =>
    order.checkout_id
      ? incomingOrders.filter((o) => o.id !== order.id && o.checkout_id === order.checkout_id)
      : [];

  const openComplete = (order: any) => {
    setReadyDraftOrderId(null);
    setAdjustOrderId(null);
    setCompleteOrderId(order.id);
    setCompleteCode('');
    // Start with the ones already marked ready ticked; the farmer unticks
    // anything the buyer isn't taking today.
    setCompleteAlsoIds(
      sameCheckoutOrders(order)
        .filter((o) => o.status === 'ready_for_pickup')
        .map((o) => o.id)
    );
  };

  const handleMarkCompleted = async (orderId: string) => {
    if (!completeCode.trim()) {
      alert("Enter the buyer's pickup code to complete this order.");
      return;
    }

    setSubmittingComplete(true);
    try {
      const res = await postWithAuth('/api/orders/complete', {
        orderId,
        code: completeCode,
        alsoOrderIds: completeAlsoIds,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not complete order.');

      const itemCount = Number(data.completedCount) || 1;
      const what = itemCount > 1 ? `${itemCount} items completed` : 'Order completed';
      setSuccessMsg(
        Number(data.payoutAmount) > 0
          ? `${what} — $${Number(data.payoutAmount).toFixed(2)} is on its way to your payout account.`
          : `${what} and moved to Sales History.`
      );
      setCompleteOrderId(null);
      setCompleteCode('');
      setCompleteAlsoIds([]);
      await fetchDashboardData();
    } catch (err: any) {
      alert(err.message || 'Could not complete order.');
    } finally {
      setSubmittingComplete(false);
    }
  };

  const openReadyDraft = (order: any) => {
    setReadyDraftOrderId(order.id);
    setReadyDraftText(
      order.pickup_address
        ? `Your order is ready! Pick up at ${order.pickup_address} during [hours]. [Any other instructions, e.g. where to park or who to ask for.]`
        : order.listing_pickup_instructions
          ? order.listing_pickup_instructions
          : 'Your order is ready! Please pick up at [location] during [hours].'
    );
  };

  const cancelReadyDraft = () => {
    setReadyDraftOrderId(null);
    setReadyDraftText('');
  };

  const confirmMarkReady = async (orderId: string) => {
    if (!readyDraftText.trim()) {
      alert('Please enter pickup details before sending.');
      return;
    }

    setSendingReady(true);
    try {
      const res = await postWithAuth('/api/orders/mark-ready', {
        orderId,
        pickupDetails: readyDraftText,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to mark order ready.');

      setSuccessMsg('Order marked ready — the buyer has been emailed the pickup details.');
      setReadyDraftOrderId(null);
      setReadyDraftText('');
      await fetchDashboardData();
    } catch (err: any) {
      alert(err.message || 'Failed to mark order ready.');
    } finally {
      setSendingReady(false);
    }
  };

  const openAdjust = (order: any) => {
    setReadyDraftOrderId(null);
    setCompleteOrderId(null);
    setAdjustOrderId(order.id);
    setAdjustQuantity('0');
    setAdjustNote('');
    setAdjustRestock(false);
  };

  // Reports a no-show for an admin to review. It moves no money by itself.
  const handleReportNoShow = async (order: any) => {
    if (
      !confirm(
        "Report that this buyer didn't show up? We'll review it. If it's confirmed, the order is closed, you're paid a restocking fee, and the produce goes back on your listing."
      )
    ) {
      return;
    }

    try {
      const res = await postWithAuth('/api/orders/report-no-show', { orderId: order.id });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not report the no-show.');

      setSuccessMsg("No-show reported. We've let the buyer know and will review it.");
      await fetchDashboardData();
    } catch (err: any) {
      alert(err.message || 'Could not report the no-show.');
    }
  };

  const confirmAdjust = async (order: any) => {
    const currentQty = Number(order.reserved_quantity ?? 0);
    const newQty = Number(adjustQuantity);

    if (adjustQuantity.trim() === '' || !Number.isInteger(newQty) || newQty < 0 || newQty >= currentQty) {
      alert(`Enter a whole number from 0 to ${currentQty - 1}. Use 0 to cancel the whole order.`);
      return;
    }

    setSubmittingAdjust(true);
    try {
      const res = await postWithAuth('/api/orders/adjust', {
        orderId: order.id,
        newQuantity: newQty,
        note: adjustNote,
        restock: adjustRestock,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to adjust order.');

      setSuccessMsg(
        `${data.cancelled ? 'Order cancelled' : 'Order updated'} — $${Number(data.refundAmount).toFixed(2)} refunded to the buyer, who has been emailed.`
      );
      setAdjustOrderId(null);
      await fetchDashboardData();
    } catch (err: any) {
      alert(err.message || 'Failed to adjust order.');
    } finally {
      setSubmittingAdjust(false);
    }
  };

  const handleSetUpPayouts = async () => {
    setSettingUpPayouts(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      if (!user) throw new Error('Authentication required.');

      const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
      if (!publishableKey) throw new Error('Stripe is not configured (missing publishable key).');

      const res = await postWithAuth('/api/connect/create-account');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create payout account.');

      setStripeAccountId(data.accountId);

      const instance = loadConnectAndInitialize({
        publishableKey,
        fetchClientSecret: async () => {
          const sessionRes = await postWithAuth('/api/connect/account-session');
          const sessionData = await sessionRes.json();
          if (!sessionRes.ok) {
            throw new Error(sessionData.error || 'Failed to start payout onboarding.');
          }
          return sessionData.client_secret;
        },
      });

      setConnectInstance(instance);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to set up payouts.');
    } finally {
      setSettingUpPayouts(false);
    }
  };

  const handleOnboardingExit = async () => {
    setConnectInstance(null);

    try {
      const res = await postWithAuth('/api/connect/account-status');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to check payout status.');

      setStripeOnboardingComplete(Boolean(data.complete));
      if (data.complete) {
        setSuccessMsg('Payouts are set up — your Stripe account is connected.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to check payout status.');
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
        const uploadFile = await resizeImage(avatarFile, 800);
        const fileExt = uploadFile.name.split('.').pop();
        const fileName = `avatars/${user.id}-${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('produce-images')
          .upload(fileName, uploadFile, { upsert: true });

        if (uploadError) throw uploadError;

        const { data: publicUrlData } = supabase.storage
          .from('produce-images')
          .getPublicUrl(fileName);

        uploadedAvatarUrl = publicUrlData.publicUrl;
        setAvatarUrl(uploadedAvatarUrl);
      }

      let uploadedCoverUrl = coverUrl;

      if (coverFile) {
        const uploadFile = await resizeImage(coverFile, 1600);
        const fileExt = uploadFile.name.split('.').pop();
        const fileName = `covers/${user.id}-${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('produce-images')
          .upload(fileName, uploadFile, { upsert: true });

        if (uploadError) throw uploadError;

        const { data: publicUrlData } = supabase.storage
          .from('produce-images')
          .getPublicUrl(fileName);

        uploadedCoverUrl = publicUrlData.publicUrl;
        setCoverUrl(uploadedCoverUrl);
      }

      const profilePayload = {
        id: user.id,
        farm_name: farmName,
        avatar_url: uploadedAvatarUrl,
        cover_image_url: uploadedCoverUrl || null,
        bio,
        location: profileLocation,
        zip_code: profileZip,
        growing_practices: growingPractices,
      };

      const { error: upsertError } = await supabase
        .from('seller_profiles')
        .upsert(profilePayload);

      if (upsertError) throw upsertError;

      setSuccessMsg('Farm profile and image successfully updated!');
      setAvatarFile(null);
      setAvatarPreviewUrl(null);
      setCoverFile(null);
      setCoverPreviewUrl(null);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update farm profile.');
    } finally {
      setLoading(false);
    }
  };

  const identityLocked = editingListingId !== null && listingIdsWithOrders.has(editingListingId);

  const handleListingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      if (!user) throw new Error('Authentication expired. Please log in again.');

      let cropImageUrl = null;

      if (imageFile) {
        const uploadFile = await resizeImage(imageFile);
        const fileExt = uploadFile.name.split('.').pop();
        const fileName = `crops/${user.id}-${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('produce-images')
          .upload(fileName, uploadFile);

        if (uploadError) throw uploadError;

        const { data: publicUrlData } = supabase.storage
          .from('produce-images')
          .getPublicUrl(fileName);

        cropImageUrl = publicUrlData.publicUrl;
      }

      if (editingListingId) {
        const res = await postWithAuth('/api/listings/update', {
          listingId: editingListingId,
          fields: {
            ...(identityLocked
              ? {}
              : { title, variety, category, unit_type: unitType }),
            description,
            price_per_unit: parseFloat(pricePerUnit),
            available_quantity: parseFloat(availableQuantity),
            harvest_ready_date: harvestReadyDate,
            harvest_end_date: harvestEndDate || null,
            location_name: locationName,
            zip_code: zipCode,
            pickup_address: pickupAddress,
            tags: listingTags,
            ...(cropImageUrl ? { image_url: cropImageUrl } : {}),
          },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not save your changes.');

        resetListingForm();
        setSuccessMsg('Listing updated.');
        await fetchDashboardData();
        setActiveTab('listings');
        return;
      }

      // Publishing goes through the server, which refuses duplicate posts of
      // the same crop and enforces the cap on listings on sale at once.
      const createRes = await postWithAuth('/api/listings/create', {
        acceptTerms: sellerTermsChecked,
        fields: {
          title,
          variety,
          category,
          description,
          unit_type: unitType,
          price_per_unit: parseFloat(pricePerUnit),
          available_quantity: parseFloat(availableQuantity),
          harvest_ready_date: harvestReadyDate,
          harvest_end_date: harvestEndDate || null,
          location_name: locationName || profileLocation,
          zip_code: zipCode || profileZip,
          pickup_address: pickupAddress,
          tags: listingTags,
          image_url: cropImageUrl,
        },
      });
      const createData = await createRes.json();
      if (!createRes.ok) throw new Error(createData.error || 'Could not publish your listing.');
      setSellerTermsAccepted(true);

      setSuccessMsg('Listing successfully published with your farm branding!');
      setTitle('');
      setVariety('');
      setDescription('');
      setPricePerUnit('');
      setAvailableQuantity('');
      setHarvestReadyDate('');
      setHarvestEndDate('');
      setListingTags([]);
      setImageFile(null);
      setImagePreviewUrl(null);

      await fetchDashboardData();
      setActiveTab('listings');
    } catch (err: any) {
      setErrorMsg(err.message || 'Something went wrong saving your listing.');
    } finally {
      setLoading(false);
    }
  };

  // Crop names from this farmer's existing posts, most recent first, offered
  // as suggestions when posting a new harvest.
  const previousListingsByTitle = myListings.reduce((acc, l) => {
    if (l.title && !acc.has(l.title)) acc.set(l.title, l);
    return acc;
  }, new Map<string, any>());
  const reusableListing = previousListingsByTitle.get(title.trim());

  // Copies the details of an earlier post of the same crop into the form, so
  // a repeat harvest only needs its quantity and dates.
  const reuseListingDetails = (previous: any) => {
    setVariety(previous.variety || '');
    setCategory(previous.category || 'Vegetables');
    setDescription(previous.description || '');
    setUnitType(previous.unit_type || 'lbs');
    setPricePerUnit(previous.price_per_unit != null ? String(previous.price_per_unit) : '');
    if (previous.pickup_address) {
      setPickupAddress(previous.pickup_address);
      setPickupAddressVerified(true);
    }
    setListingTags(Array.isArray(previous.tags) ? previous.tags.slice(0, MAX_LISTING_TAGS) : []);
    if (previous.zip_code) setZipCode(previous.zip_code);
    if (previous.location_name) setLocationName(previous.location_name);
  };

  const toggleListingTag = (tag: string) => {
    setListingTags((current) =>
      current.includes(tag)
        ? current.filter((t) => t !== tag)
        : current.length < MAX_LISTING_TAGS
          ? [...current, tag]
          : current
    );
  };

  // Fills in the city and state from a 5-digit US zip code. The city field
  // stays editable in case the lookup is unavailable or picks the wrong name.
  const handleZipChange = async (value: string) => {
    const zip = value.replace(/\D/g, '').slice(0, 5);
    setZipCode(zip);
    setZipNotFound(false);
    if (zip.length !== 5) return;

    setLookingUpZip(true);
    try {
      const res = await fetch(`https://api.zippopotam.us/us/${zip}`);
      if (!res.ok) {
        setZipNotFound(true);
        return;
      }
      const data = await res.json();
      const place = data.places?.[0];
      if (place) {
        setLocationName(`${place['place name']}, ${place['state abbreviation']}`);
      } else {
        setZipNotFound(true);
      }
    } catch {
      setZipNotFound(true);
    } finally {
      setLookingUpZip(false);
    }
  };

  const handleCropFileSelected = (file: File | null) => {
    setImageFile(file);
    setImagePreviewUrl(file ? URL.createObjectURL(file) : null);
  };

  const handleCoverFileSelected = (file: File | null) => {
    setCoverFile(file);
    setCoverPreviewUrl(file ? URL.createObjectURL(file) : null);
  };

  const handleAvatarFileSelected = (file: File | null) => {
    setAvatarFile(file);
    setAvatarPreviewUrl(file ? URL.createObjectURL(file) : null);
  };

  if (authChecking) {
    return (
      <div className="max-w-4xl mx-auto my-20 p-8 text-center text-gray-500 text-sm">
        Loading Seller Dashboard...
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto md:px-4 py-2 md:py-8">
      <div className="flex flex-col md:flex-row gap-4 md:gap-8">
        <aside className="w-full md:w-64 bg-white p-3 md:p-5 rounded-2xl border border-gray-200 shadow-sm shrink-0 self-start">
          <div className="flex items-center gap-3 pb-3 mb-3 md:pb-6 md:mb-6 border-b border-gray-100">
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

          {/* A horizontal, swipeable tab strip on phones; a vertical menu on desktop. */}
          <nav className="flex gap-2 overflow-x-auto pb-1 md:block md:space-y-1 md:overflow-visible md:pb-0">
            <button
              onClick={() => {
                setActiveTab('listings');
                setSuccessMsg(null);
                setErrorMsg(null);
              }}
              className={`shrink-0 whitespace-nowrap md:w-full flex items-center justify-between gap-2 px-3.5 py-3 md:py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                activeTab === 'listings' || activeTab === 'new'
                  ? 'bg-emerald-50 text-emerald-700 font-bold'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <LayoutDashboard className="w-4 h-4" /> Your Listings
              </span>
              <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-[10px]">
                {activeListings.length}
              </span>
            </button>

            <button
              onClick={() => {
                setActiveTab('orders');
                setSuccessMsg(null);
                setErrorMsg(null);
              }}
              className={`shrink-0 whitespace-nowrap md:w-full flex items-center justify-between gap-2 px-3.5 py-3 md:py-2.5 rounded-xl text-xs font-semibold transition-colors ${
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

            <button
              onClick={() => {
                setActiveTab('history');
                setSuccessMsg(null);
                setErrorMsg(null);
              }}
              className={`shrink-0 whitespace-nowrap md:w-full flex items-center gap-2.5 px-3.5 py-3 md:py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                activeTab === 'history'
                  ? 'bg-emerald-50 text-emerald-700 font-bold'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <History className="w-4 h-4" /> Sales History
            </button>

            <button
              onClick={() => {
                setActiveTab('profile');
                setSuccessMsg(null);
                setErrorMsg(null);
              }}
              className={`shrink-0 whitespace-nowrap md:w-full flex items-center gap-2.5 px-3.5 py-3 md:py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                activeTab === 'profile'
                  ? 'bg-emerald-50 text-emerald-700 font-bold'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <User className="w-4 h-4" /> Farm Profile & Photo
            </button>

            <button
              onClick={() => {
                setActiveTab('settings');
                setSuccessMsg(null);
                setErrorMsg(null);
              }}
              className={`shrink-0 whitespace-nowrap md:w-full flex items-center gap-2.5 px-3.5 py-3 md:py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                activeTab === 'settings'
                  ? 'bg-emerald-50 text-emerald-700 font-bold'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <CreditCard className="w-4 h-4" /> Payouts & Settings
            </button>
          </nav>

          <div className="pt-2 mt-2 md:pt-6 md:mt-6 border-t border-gray-100 space-y-2">
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" /> Sign Out
            </button>
          </div>
        </aside>

        <main className="flex-1 min-w-0 bg-white p-4 sm:p-8 rounded-2xl border border-gray-200 shadow-sm">
          {successMsg && (
            <div role="status" className="mb-6 p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <span>{successMsg}</span>
              </div>
            </div>
          )}

          {errorMsg && (
            <div role="alert" className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-center gap-2 text-sm">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {activeTab === 'listings' && (
            <details
              open={guideOpen ?? !setupComplete}
              onToggle={(e) => setGuideOpen(e.currentTarget.open)}
              className="mb-6 bg-emerald-50 border border-emerald-200 rounded-2xl"
            >
              <summary className="cursor-pointer select-none px-5 py-4 text-sm font-bold text-emerald-950">
                How selling works{setupComplete ? '' : ' — finish setting up to start selling'}
              </summary>

              <div className="px-5 pb-5 space-y-5 text-sm text-gray-700">
                <div>
                  <h2 className="text-sm font-bold text-gray-900 mb-2">Getting set up</h2>
                  <ol className="space-y-2">
                    {[
                      {
                        done: profileDone,
                        title: 'Fill in your farm profile',
                        detail: 'Your farm name, photo and story are what buyers see on every listing.',
                        action: 'Open Farm Profile',
                        onClick: () => setActiveTab('profile'),
                      },
                      {
                        done: payoutsDone,
                        title: 'Connect your payouts',
                        detail:
                          "Add your bank details through Stripe so you can be paid. Buyers can't purchase from you until this is done.",
                        action: 'Open Payouts & Settings',
                        onClick: () => setActiveTab('settings'),
                      },
                      {
                        done: listingDone,
                        title: 'Post your first harvest',
                        detail:
                          'Enter the crop, price, quantity, harvest date and pickup address. Add a photo if you can — listings with photos get noticed.',
                        action: 'Post New Harvest',
                        onClick: startNewListing,
                      },
                    ].map((step, index) => (
                      <li key={step.title} className="flex items-start gap-3">
                        <span
                          className={`mt-0.5 w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${
                            step.done ? 'bg-emerald-700 text-white' : 'bg-white border border-emerald-300 text-emerald-800'
                          }`}
                        >
                          {step.done ? <Check className="w-3.5 h-3.5" aria-hidden="true" /> : index + 1}
                        </span>
                        <div>
                          <p className="font-semibold text-gray-900">
                            {step.title}
                            {step.done && <span className="font-normal text-emerald-800"> — done</span>}
                          </p>
                          <p className="text-xs text-gray-600">{step.detail}</p>
                          {!step.done && (
                            <button
                              onClick={step.onClick}
                              className="mt-1 text-xs font-bold text-emerald-800 underline"
                            >
                              {step.action}
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>

                <div>
                  <h2 className="text-sm font-bold text-gray-900 mb-2">When you get an order</h2>
                  <ol className="list-decimal pl-5 space-y-1.5 text-xs text-gray-700">
                    <li>
                      We email you, and the order appears under <strong>Incoming Orders</strong>. The buyer has
                      already paid online — we hold the money until pickup.
                    </li>
                    <li>
                      When the produce is ready, click <strong>Mark Ready for Pickup</strong> and send the buyer
                      your pickup hours and any instructions.
                    </li>
                    <li>
                      At pickup, hand over the produce and <strong>ask the buyer for their pickup code</strong>.
                    </li>
                    <li>
                      Click <strong>Mark Completed</strong> and enter the code. That releases your payment.
                    </li>
                  </ol>
                </div>

                <div>
                  <h2 className="text-sm font-bold text-gray-900 mb-2">How you get paid</h2>
                  <ul className="list-disc pl-5 space-y-1.5 text-xs text-gray-700">
                    <li>
                      You're paid your produce price minus a {SELLER_FEE_RATE * 100}% seller fee. Each open
                      order shows the exact amount as "Your payout at pickup".
                    </li>
                    <li>
                      Entering the pickup code sends that amount to your Stripe account, and Stripe deposits
                      it to your bank once a week, on Fridays.
                    </li>
                    <li>
                      Short on produce? Use <strong>Cancel / Adjust</strong> on the order to reduce or cancel
                      it. The buyer is refunded automatically.
                    </li>
                    <li>
                      Buyer never came? Once an order is marked ready, use <strong>Buyer Did Not Show</strong>.
                      We review it, and if it's confirmed you're paid a restocking fee and the produce goes
                      back on your listing.
                    </li>
                    <li>
                      Never collect cash at pickup — every order is already paid in full online.
                    </li>
                    <li>
                      You're responsible for making sure what you sell is legal in your state. Eggs, seeds,
                      honey, jam and other prepared foods often have their own rules — see the{' '}
                      <a href="/faq" className="font-semibold text-emerald-800 underline">
                        FAQ
                      </a>{' '}
                      before listing them.
                    </li>
                    <li>
                      Quantities are whole numbers: buyers can only order whole units (1 lb, 2 lbs, not 0.5
                      lb). To sell smaller amounts, list in a smaller unit such as oz.
                    </li>
                  </ul>
                </div>
              </div>
            </details>
          )}

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
                    onClick={startNewListing}
                    className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 px-4 rounded-xl text-xs transition-colors shadow-sm"
                  >
                    <PlusCircle className="w-4 h-4" /> Post New Harvest
                  </button>
                )}
              </div>

              {activeTab === 'listings' && activeListings.length === 0 && !showInactiveListings && (
                <div className="text-center py-16 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                  <Sprout className="mx-auto h-12 w-12 text-gray-400 mb-3" />
                  <h3 className="text-base font-semibold text-gray-900">
                    {myListings.length === 0 ? 'No Active Posts Yet' : 'Nothing On Sale Right Now'}
                  </h3>
                  <button
                    onClick={startNewListing}
                    className="mt-4 inline-flex items-center gap-2 bg-emerald-600 text-white font-semibold py-2.5 px-5 rounded-lg text-xs shadow-sm hover:bg-emerald-700"
                  >
                    <PlusCircle className="w-4 h-4" />{' '}
                    {myListings.length === 0 ? 'Post Your First Produce Item' : 'Post New Harvest'}
                  </button>
                </div>
              )}

              {activeTab === 'listings' && visibleListings.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {visibleListings.map((item) => {
                    const qty = Math.floor(Number(item.available_quantity ?? 0));
                    return (
                      <div
                        key={item.id}
                        className={`p-4 border rounded-xl border-gray-200 shadow-sm flex justify-between items-start ${
                          qty <= 0 ? 'bg-gray-50' : 'bg-white'
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded">
                              {item.category}
                            </span>
                            <span className="text-xs text-gray-400">{item.location_name}</span>
                          </div>
                          <h3 className="text-lg font-bold text-gray-900">
                            {item.title}
                            {item.variety && (
                              <span className="text-sm font-medium text-gray-500"> · {item.variety}</span>
                            )}
                          </h3>
                          <p className="text-sm font-semibold text-gray-700">
                            ${Number(item.price_per_unit || 0).toFixed(2)} / {item.unit_type}
                          </p>
                          <p
                            className={`text-xs font-bold ${
                              qty <= 0 ? 'text-red-600' : 'text-emerald-700'
                            }`}
                          >
                            {qty <= 0 ? 'Sold out or taken down — edit the quantity to restock' : `${qty} ${item.unit_type} left`}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => startEditListing(item)}
                            aria-label="Edit listing"
                            title="Edit listing"
                            className="p-3 md:p-2 text-gray-400 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          {!(qty <= 0 && listingIdsWithOrders.has(item.id)) && (
                          <button
                            onClick={() => handleDeleteListing(item.id)}
                            aria-label={listingIdsWithOrders.has(item.id) ? 'Take down listing' : 'Delete listing'}
                            title={listingIdsWithOrders.has(item.id) ? 'Take down listing' : 'Delete listing'}
                            className="p-3 md:p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {activeTab === 'listings' && inactiveListings.length > 0 && (
                <button
                  onClick={() => setShowInactiveListings((current) => !current)}
                  className="mt-4 text-xs font-semibold text-gray-500 hover:text-emerald-700 hover:underline"
                >
                  {showInactiveListings
                    ? 'Hide sold-out and taken-down listings'
                    : `Show ${inactiveListings.length} sold-out or taken-down listing${inactiveListings.length === 1 ? '' : 's'}`}
                </button>
              )}

              {activeTab === 'new' && (
                <form onSubmit={handleListingSubmit} className="space-y-6">
                  {editingListingId && (
                    <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900">
                      <p className="font-bold text-sm">Editing an existing listing</p>
                      <p className="mt-0.5">
                        {identityLocked
                          ? "This listing already has orders, so its crop name, variety, category and unit can't be changed — create a new post to sell something different. A new price only applies to new orders."
                          : 'A new price only applies to new orders.'}
                      </p>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="md:col-span-2">
                      <label htmlFor="dash-crop-name" className="block text-xs font-semibold text-gray-700 mb-1">
                        Crop Name *
                      </label>
                      <input id="dash-crop-name"
                        type="text"
                        required
                        placeholder="e.g., Organic Heirloom Tomatoes"
                        list="previous-crop-names"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        disabled={identityLocked}
                        className="w-full px-4 py-2 border rounded-lg text-sm disabled:bg-gray-100 disabled:text-gray-500"
                      />
                      <datalist id="previous-crop-names">
                        {[...previousListingsByTitle.keys()].map((name) => (
                          <option key={name} value={name} />
                        ))}
                      </datalist>
                      {editingListingId ? null : reusableListing ? (
                        <button
                          type="button"
                          onClick={() => reuseListingDetails(reusableListing)}
                          className="mt-1 text-[11px] font-semibold text-emerald-700 hover:underline"
                        >
                          Fill in the variety, price, unit, description and labels from your last "{reusableListing.title}" post
                        </button>
                      ) : (
                        previousListingsByTitle.size > 0 && (
                          <p className="text-[10px] text-gray-400 mt-1">
                            Start typing or click the field to pick a crop you've posted before.
                          </p>
                        )
                      )}
                    </div>
                    <div>
                      <label htmlFor="dash-variety-optional" className="block text-xs font-semibold text-gray-700 mb-1">
                        Variety (Optional)
                      </label>
                      <input id="dash-variety-optional"
                        type="text"
                        placeholder="e.g., Yukon Gold"
                        value={variety}
                        onChange={(e) => setVariety(e.target.value)}
                        disabled={identityLocked}
                        className="w-full px-4 py-2 border rounded-lg text-sm disabled:bg-gray-100 disabled:text-gray-500"
                      />
                    </div>
                    <div>
                      <label htmlFor="dash-category" className="block text-xs font-semibold text-gray-700 mb-1">
                        Category
                      </label>
                      <select id="dash-category"
                        value={category}
                        onChange={(e) => {
                          const next = e.target.value;
                          setCategory(next);
                          // Start from the unit these are usually sold in, if the unit hasn't been chosen yet.
                          if (unitType === 'lbs' && next === 'Fresh Eggs') setUnitType('dozen');
                          if (unitType === 'lbs' && next === 'Seeds') setUnitType('packets');
                        }}
                        disabled={identityLocked}
                        className="w-full px-4 py-2 border rounded-lg text-sm bg-white disabled:bg-gray-100 disabled:text-gray-500"
                      >
                        <option>Vegetables</option>
                        <option>Fruits & Berries</option>
                        <option>Herbs & Spices</option>
                        <option>Honey & Jam</option>
                        <option>Fresh Eggs</option>
                        <option>Seeds</option>
                      </select>
                    </div>
                  </div>

                  {['Fresh Eggs', 'Seeds', 'Honey & Jam'].includes(category) && (
                    <div className="p-4 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-950">
                      <p className="font-bold text-sm">Check your state's rules before listing this</p>
                      <p className="mt-0.5">
                        {category === 'Fresh Eggs'
                          ? 'States commonly have rules for selling eggs: keeping them refrigerated, how cartons are labeled, and a license above a certain number of hens or dozens.'
                          : category === 'Seeds'
                            ? "States commonly require seed labeling (variety, germination rate, test date) and sometimes a seed dealer permit. Seed from patented or protected varieties generally can't be resold."
                            : "Honey, jam and other prepared foods usually fall under your state's cottage food laws, which decide what may be made at home and how it must be labeled."}{' '}
                        You're responsible for making sure it's legal to sell where you are.{' '}
                        <a href="/faq" target="_blank" rel="noopener" className="font-semibold underline">
                          Read more in the FAQ
                        </a>
                        .
                      </p>
                    </div>
                  )}

                  <div>
                    <label htmlFor="dash-description" className="block text-xs font-semibold text-gray-700 mb-1">
                      Description
                    </label>
                    <textarea id="dash-description"
                      rows={2}
                      placeholder="Tell buyers what makes this crop special..."
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="w-full px-4 py-2 border rounded-lg text-sm"
                    />
                  </div>

                  <div>
                    <p id="dash-highlights-label" className="block text-xs font-semibold text-gray-700 mb-1">
                      Highlights ({listingTags.length}/{MAX_LISTING_TAGS})
                    </p>
                    <div role="group" aria-labelledby="dash-highlights-label" className="flex flex-wrap gap-2">
                      {LISTING_TAG_OPTIONS.map((tag) => {
                        const selected = listingTags.includes(tag);
                        const atLimit = !selected && listingTags.length >= MAX_LISTING_TAGS;
                        return (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => toggleListingTag(tag)}
                            aria-pressed={selected}
                            disabled={atLimit}
                            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                              selected
                                ? 'bg-emerald-600 text-white border-emerald-600'
                                : atLimit
                                  ? 'bg-gray-50 text-gray-300 border-gray-200 cursor-not-allowed'
                                  : 'bg-white text-gray-600 border-gray-300 hover:border-emerald-400'
                            }`}
                          >
                            {tag}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1">
                      Pick up to {MAX_LISTING_TAGS} to show on your listing in Browse. Anything else can go in the
                      description.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-gray-50 rounded-xl border border-gray-100">
                    <div>
                      <label htmlFor="dash-unit-type" className="block text-xs font-semibold text-gray-700 mb-1">
                        Unit Type *
                      </label>
                      <select id="dash-unit-type"
                        value={unitType}
                        onChange={(e) => setUnitType(e.target.value)}
                        disabled={identityLocked}
                        className="w-full px-3 py-2 border rounded-lg text-sm bg-white disabled:bg-gray-100 disabled:text-gray-500"
                      >
                        {UNIT_TYPE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label htmlFor="dash-price-per" className="block text-xs font-semibold text-gray-700 mb-1">
                        Price per {unitType} ($) *
                      </label>
                      <input id="dash-price-per"
                        type="number"
                        step="0.01"
                        required
                        placeholder="3.50"
                        value={pricePerUnit}
                        onChange={(e) => setPricePerUnit(e.target.value)}
                        className="w-full px-3 py-2 border rounded-lg text-sm"
                      />
                      <p className="text-[10px] text-gray-400 mt-1">
                        You keep {100 - SELLER_FEE_RATE * 100}% — a {SELLER_FEE_RATE * 100}% seller fee comes
                        out of your payout.
                      </p>
                    </div>

                    <div>
                      <label htmlFor="dash-est-total" className="block text-xs font-semibold text-gray-700 mb-1">
                        Est. Total {unitType} *
                      </label>
                      <input id="dash-est-total"
                        type="number"
                        step="1"
                        min={editingListingId ? 0 : 1}
                        required
                        placeholder="25"
                        value={availableQuantity}
                        onChange={(e) => setAvailableQuantity(e.target.value)}
                        className="w-full px-3 py-2 border rounded-lg text-sm"
                      />
                      <p className="text-[10px] text-gray-400 mt-1">
                        Whole numbers only — buyers order whole {unitType}. Selling smaller amounts? Pick a
                        smaller unit, like oz.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="dash-zip-code" className="block text-xs font-semibold text-gray-700 mb-1">
                        Zip Code *
                      </label>
                      <input id="dash-zip-code"
                        type="text"
                        inputMode="numeric"
                        required
                        pattern="[0-9]{5}"
                        title="Enter a 5-digit zip code"
                        placeholder="e.g., 85001"
                        value={zipCode}
                        onChange={(e) => handleZipChange(e.target.value)}
                        className="w-full px-4 py-2 border rounded-lg text-sm"
                      />
                      <p className="text-[10px] text-gray-400 mt-1">
                        {lookingUpZip
                          ? 'Looking up city...'
                          : zipNotFound
                            ? "Couldn't find that zip code — please type the city."
                            : 'The city fills in automatically from the zip code.'}
                      </p>
                    </div>
                    <div>
                      <label htmlFor="dash-city-area" className="block text-xs font-semibold text-gray-700 mb-1">
                        City / Area *
                      </label>
                      <input id="dash-city-area"
                        type="text"
                        required
                        placeholder="Filled in from zip code"
                        value={locationName}
                        onChange={(e) => setLocationName(e.target.value)}
                        className="w-full px-4 py-2 border rounded-lg text-sm"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="dash-harvest-date" className="block text-xs font-semibold text-gray-700 mb-1">
                        Harvest Date *
                      </label>
                      <input id="dash-harvest-date"
                        type="date"
                        required
                        value={harvestReadyDate}
                        onChange={(e) => setHarvestReadyDate(e.target.value)}
                        className="w-full px-4 py-2 border rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label htmlFor="dash-available-until-optional" className="block text-xs font-semibold text-gray-700 mb-1">
                        Available Until (Optional)
                      </label>
                      <input id="dash-available-until-optional"
                        type="date"
                        value={harvestEndDate}
                        onChange={(e) => setHarvestEndDate(e.target.value)}
                        className="w-full px-4 py-2 border rounded-lg text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="dash-pickup-address" className="block text-xs font-semibold text-gray-700 mb-1">
                      Pickup Address *
                    </label>
                    <AddressAutocomplete id="dash-pickup-address"
                      required
                      placeholder="e.g., 1234 W Farm Rd, Phoenix"
                      value={pickupAddress}
                      verified={pickupAddressVerified}
                      onChange={(text) => {
                        setPickupAddress(text);
                        setPickupAddressVerified(false);
                      }}
                      onSelect={(suggestion) => {
                        setPickupAddress(suggestion.address);
                        setPickupAddressVerified(true);
                        // Keep the public city and zip in step with the address.
                        if (suggestion.zip) setZipCode(suggestion.zip.slice(0, 5));
                        if (suggestion.city) {
                          setLocationName([suggestion.city, suggestion.state].filter(Boolean).join(', '));
                        }
                      }}
                    />
                    <p className="text-[10px] text-gray-400 mt-1">
                      Only shown to buyers after they've paid — your listing shows just the city and zip
                      code. Hours and other instructions go in the message you send when you mark an order
                      ready.
                    </p>
                  </div>

                  <div>
                    <p id="dash-crop-image-label" className="block text-xs font-semibold text-gray-700 mb-1">
                      Crop Image (Optional)
                    </p>
                    <div role="group" aria-labelledby="dash-crop-image-label" className="flex items-center gap-3">
                      {imagePreviewUrl ? (
                        <div className="relative">
                          <img
                            src={imagePreviewUrl}
                            alt="Preview"
                            className="w-16 h-16 rounded-lg object-cover border"
                          />
                          <button
                            type="button"
                            onClick={() => handleCropFileSelected(null)}
                            aria-label="Remove photo"
                            className="absolute -top-2 -right-2 bg-white border rounded-full p-0.5 shadow-sm"
                          >
                            <X className="w-3.5 h-3.5 text-gray-500" />
                          </button>
                        </div>
                      ) : (
                        <div className="w-16 h-16 rounded-lg bg-gray-100 flex items-center justify-center border border-dashed">
                          <ImageIcon className="w-6 h-6 text-gray-300" />
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => cropCameraInputRef.current?.click()}
                        className="inline-flex items-center gap-1.5 px-3 py-2 border rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-50"
                      >
                        <Camera className="w-3.5 h-3.5" /> Take Photo
                      </button>
                      <button
                        type="button"
                        onClick={() => cropLibraryInputRef.current?.click()}
                        className="inline-flex items-center gap-1.5 px-3 py-2 border rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-50"
                      >
                        <ImageIcon className="w-3.5 h-3.5" /> Choose Photo
                      </button>

                      <input
                        ref={cropCameraInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={(e) => handleCropFileSelected(e.target.files?.[0] || null)}
                        className="hidden"
                      />
                      <input
                        ref={cropLibraryInputRef}
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleCropFileSelected(e.target.files?.[0] || null)}
                        className="hidden"
                      />
                    </div>
                  </div>

                  {!editingListingId && !sellerTermsAccepted && (
                    <label className="flex items-start gap-2 p-4 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-700">
                      <input
                        type="checkbox"
                        required
                        checked={sellerTermsChecked}
                        onChange={(e) => setSellerTermsChecked(e.target.checked)}
                        className="mt-0.5 w-4 h-4 shrink-0"
                      />
                      <span>
                        I have read and agree to the{' '}
                        <a href="/seller-terms" target="_blank" rel="noopener" className="font-semibold text-emerald-800 underline">
                          Seller Terms
                        </a>
                        . I'm responsible for making sure everything I sell is legal to sell in my state,
                        including any licenses, permits, labeling and food-safety requirements. Farm Fresh
                        Direct does not inspect or approve what I sell.
                      </span>
                    </label>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 px-6 rounded-xl text-sm transition-colors shadow-md disabled:bg-gray-400"
                  >
                    {editingListingId
                      ? loading
                        ? 'Saving...'
                        : 'Save Changes'
                      : loading
                        ? 'Publishing...'
                        : 'Publish Produce Listing'}
                  </button>
                  {editingListingId && (
                    <button
                      type="button"
                      onClick={() => {
                        resetListingForm();
                        setActiveTab('listings');
                      }}
                      disabled={loading}
                      className="w-full bg-white border text-gray-600 font-semibold py-3 px-6 rounded-xl text-sm hover:bg-gray-50"
                    >
                      Cancel Editing
                    </button>
                  )}
                </form>
              )}
            </div>
          )}

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
                      className="p-5 border rounded-2xl border-gray-200 shadow-sm bg-white flex flex-col gap-4"
                    >
                      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase ${
                                order.status === 'pending_pickup'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-blue-100 text-blue-800'
                              }`}
                            >
                              {order.status === 'pending_pickup' ? 'Pending Harvest' : 'Ready for Pickup'}
                            </span>
                            <span className="text-xs text-gray-400">
                              Order #{order.id.slice(0, 8)}
                            </span>
                          </div>
                          <h3 className="text-base font-bold text-gray-900">
                            {order.listing_title}
                          </h3>
                          <p className="text-xs text-gray-600">
                            Buyer: <span className="font-semibold">{order.buyer_email || 'Buyer'}</span> ({order.reserved_quantity} {order.listing_unit_type})
                          </p>
                          <p className="text-xs font-extrabold text-emerald-700">
                            {order.farmer_payout_amount != null
                              ? `Your payout at pickup: $${Number(order.farmer_payout_amount).toFixed(2)}`
                              : `Total Paid: $${Number(order.total_price || 0).toFixed(2)}`}
                          </p>
                          {sameCheckoutOrders(order).length > 0 && (
                            <p className="text-xs text-gray-600">
                              Same buyer also ordered:{' '}
                              <span className="font-semibold">
                                {sameCheckoutOrders(order)
                                  .map((o) => o.listing_title)
                                  .join(', ')}
                              </span>
                              . One pickup code covers all of it.
                            </p>
                          )}
                        </div>

                        {/* Full-width stacked buttons on phones; a row on larger screens. */}
                        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 w-full md:w-auto">
                          {order.status === 'pending_pickup' && readyDraftOrderId !== order.id && (
                            <button
                              onClick={() => openReadyDraft(order)}
                              className="inline-flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3.5 py-3 sm:py-2 rounded-xl transition-colors shadow-sm"
                            >
                              <PackageCheck className="w-4 h-4" /> Mark Ready for Pickup
                            </button>
                          )}
                          {completeOrderId !== order.id && (
                            <button
                              onClick={() => openComplete(order)}
                              className="inline-flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3.5 py-3 sm:py-2 rounded-xl transition-colors shadow-sm"
                            >
                              <Check className="w-4 h-4" /> Mark Completed
                            </button>
                          )}
                          {order.stripe_payment_intent_id && adjustOrderId !== order.id && (
                            <button
                              onClick={() => openAdjust(order)}
                              className="inline-flex items-center justify-center gap-1.5 bg-white border border-red-200 text-red-600 hover:bg-red-50 text-xs font-bold px-3.5 py-3 sm:py-2 rounded-xl transition-colors"
                            >
                              <X className="w-4 h-4" /> Cancel / Adjust
                            </button>
                          )}
                          {order.status === 'ready_for_pickup' &&
                            order.stripe_payment_intent_id &&
                            !order.no_show_reported_at && (
                              <button
                                onClick={() => handleReportNoShow(order)}
                                className="inline-flex items-center justify-center gap-1.5 bg-white border border-amber-300 text-amber-800 hover:bg-amber-50 text-xs font-bold px-3.5 py-3 sm:py-2 rounded-xl transition-colors"
                              >
                                <AlertCircle className="w-4 h-4" /> Buyer Did Not Show
                              </button>
                            )}
                        </div>
                      </div>

                      {order.no_show_reported_at && (
                        <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-xl p-3">
                          You reported this buyer as a no-show on{' '}
                          {new Date(order.no_show_reported_at).toLocaleDateString()}. The buyer has 48 hours to respond; if
                          they don't, the order is closed and you're paid a restocking fee. If the
                          buyer does turn up, you can still complete the order with their pickup code.
                        </p>
                      )}

                      {completeOrderId === order.id && (
                        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-3">
                          <label htmlFor="dash-enter-the-buyer-s-pickup-code" className="block text-xs font-semibold text-emerald-900">
                            Enter the buyer's pickup code
                          </label>
                          <input id="dash-enter-the-buyer-s-pickup-code"
                            type="text"
                            placeholder="FFD-123456"
                            value={completeCode}
                            onChange={(e) => setCompleteCode(e.target.value)}
                            className="w-44 px-3 py-2 border border-emerald-200 rounded-lg text-sm bg-white font-mono uppercase"
                          />
                          <p className="text-[11px] text-emerald-900">
                            Ask the buyer for the code from their order confirmation when they collect
                            their produce. Entering it completes the order and releases your payout.
                          </p>
                          {sameCheckoutOrders(order).length > 0 && (
                            <fieldset className="space-y-2">
                              <legend className="text-xs font-semibold text-emerald-900">
                                This buyer's code also covers these items. Tick the ones you are handing over now:
                              </legend>
                              {sameCheckoutOrders(order).map((other) => (
                                <label key={other.id} className="flex items-start gap-2 text-xs text-emerald-950">
                                  <input
                                    type="checkbox"
                                    className="mt-0.5 w-4 h-4 shrink-0"
                                    checked={completeAlsoIds.includes(other.id)}
                                    onChange={(e) =>
                                      setCompleteAlsoIds((current) =>
                                        e.target.checked ? [...current, other.id] : current.filter((id) => id !== other.id)
                                      )
                                    }
                                  />
                                  <span>
                                    {other.reserved_quantity} {other.listing_unit_type} of{' '}
                                    <span className="font-semibold">{other.listing_title}</span>
                                    {other.status !== 'ready_for_pickup' && ' (not marked ready yet)'}
                                  </span>
                                </label>
                              ))}
                              <p className="text-[11px] text-emerald-900">
                                Anything left unticked stays open, and the same code works for it later.
                              </p>
                            </fieldset>
                          )}
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleMarkCompleted(order.id)}
                              disabled={submittingComplete || !completeCode.trim()}
                              className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-400 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition-colors"
                            >
                              {submittingComplete ? 'Checking...' : 'Confirm Pickup & Release Payout'}
                            </button>
                            <button
                              onClick={() => setCompleteOrderId(null)}
                              disabled={submittingComplete}
                              className="inline-flex items-center gap-1.5 bg-white border text-gray-600 text-xs font-bold px-3.5 py-2 rounded-xl hover:bg-gray-50"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}

                      {adjustOrderId === order.id && (() => {
                        const currentQty = Number(order.reserved_quantity ?? 0);
                        const newQty = Number(adjustQuantity);
                        const validQty =
                          adjustQuantity.trim() !== '' &&
                          Number.isInteger(newQty) &&
                          newQty >= 0 &&
                          newQty < currentQty;
                        const estimatedRefund = validQty
                          ? (Number(order.total_price || 0) * (currentQty - newQty)) / currentQty
                          : 0;

                        return (
                          <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3">
                            <div>
                              <label htmlFor="dash-new-quantity-enter-to-cancel-the-whole-o" className="block text-xs font-semibold text-red-900 mb-1">
                                New quantity ({order.listing_unit_type}) — enter 0 to cancel the whole order
                              </label>
                              <input id="dash-new-quantity-enter-to-cancel-the-whole-o"
                                type="number"
                                min="0"
                                max={currentQty - 1}
                                step="1"
                                value={adjustQuantity}
                                onChange={(e) => setAdjustQuantity(e.target.value)}
                                className="w-28 px-3 py-2 border border-red-200 rounded-lg text-sm bg-white"
                              />
                              <p className="text-[11px] text-red-900 mt-1">
                                Currently {currentQty} {order.listing_unit_type}.{' '}
                                {validQty
                                  ? `The buyer will be refunded about $${estimatedRefund.toFixed(2)}, and your payout for this order shrinks to match.`
                                  : `Enter a whole number from 0 to ${currentQty - 1}.`}
                              </p>
                            </div>
                            <div>
                              <label htmlFor="dash-message-to-the-buyer-optional" className="block text-xs font-semibold text-red-900 mb-1">
                                Message to the buyer (optional)
                              </label>
                              <textarea id="dash-message-to-the-buyer-optional"
                                rows={2}
                                placeholder="e.g., Sorry — the late frost cut this week's harvest short."
                                value={adjustNote}
                                onChange={(e) => setAdjustNote(e.target.value)}
                                className="w-full px-3 py-2 border border-red-200 rounded-lg text-sm bg-white"
                              />
                            </div>
                            <label className="flex items-center gap-2 text-xs text-red-900">
                              <input
                                type="checkbox"
                                checked={adjustRestock}
                                onChange={(e) => setAdjustRestock(e.target.checked)}
                              />
                              Put the removed quantity back on the listing for other buyers
                            </label>
                            <div className="flex gap-2">
                              <button
                                onClick={() => confirmAdjust(order)}
                                disabled={submittingAdjust || !validQty}
                                className="inline-flex items-center gap-1.5 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition-colors"
                              >
                                {submittingAdjust
                                  ? 'Refunding...'
                                  : newQty === 0
                                    ? 'Cancel Order & Refund'
                                    : 'Reduce Order & Refund'}
                              </button>
                              <button
                                onClick={() => setAdjustOrderId(null)}
                                disabled={submittingAdjust}
                                className="inline-flex items-center gap-1.5 bg-white border text-gray-600 text-xs font-bold px-3.5 py-2 rounded-xl hover:bg-gray-50"
                              >
                                Keep Order
                              </button>
                            </div>
                          </div>
                        );
                      })()}

                      {readyDraftOrderId === order.id && (
                        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
                          <label htmlFor="dash-pickup-details-to-email-the-buyer" className="block text-xs font-semibold text-blue-900">
                            Pickup details to email the buyer
                          </label>
                          <textarea id="dash-pickup-details-to-email-the-buyer"
                            rows={3}
                            value={readyDraftText}
                            onChange={(e) => setReadyDraftText(e.target.value)}
                            className="w-full px-3 py-2 border border-blue-200 rounded-lg text-sm bg-white"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => confirmMarkReady(order.id)}
                              disabled={sendingReady}
                              className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition-colors"
                            >
                              {sendingReady ? 'Sending...' : 'Send & Mark Ready'}
                            </button>
                            <button
                              onClick={cancelReadyDraft}
                              disabled={sendingReady}
                              className="inline-flex items-center gap-1.5 bg-white border text-gray-600 text-xs font-bold px-3.5 py-2 rounded-xl hover:bg-gray-50"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

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
                          {order.listing_title}
                        </h4>
                        <p className="text-xs text-gray-600 break-all">
                          Buyer: <span className="font-semibold">{order.buyer_email || 'Unknown'}</span>
                          {order.reserved_quantity != null &&
                            ` (${order.reserved_quantity} ${order.listing_unit_type})`}
                        </p>
                        <p className="text-xs text-gray-500">
                          {order.status === 'cancelled' ? 'Cancelled — ordered' : 'Completed — ordered'} on{' '}
                          {new Date(order.created_at).toLocaleDateString()}
                          {Number(order.refunded_amount || 0) > 0 &&
                            ` · $${Number(order.refunded_amount).toFixed(2)} refunded`}
                          {order.used_pickup_code && (
                            <>
                              {' · '}pickup code entered:{' '}
                              <span className="font-mono font-bold text-gray-700">{order.used_pickup_code}</span>
                            </>
                          )}
                          {Number(order.no_show_fee_amount || 0) > 0 &&
                            ` · buyer no-show, $${Number(order.no_show_fee_amount).toFixed(2)} restocking fee paid to you`}
                        </p>
                      </div>
                      <span
                        className={`text-sm font-black ${
                          order.status === 'cancelled' ? 'text-gray-400' : 'text-emerald-800'
                        }`}
                      >
                        ${Number(order.total_price || 0).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'profile' && (
            <form onSubmit={handleProfileSubmit} className="space-y-6">
              <div className="pb-4 border-b border-gray-100">
                <h1 className="text-2xl font-bold text-gray-900">Your Farm Profile & Branding</h1>
                <p className="text-xs text-gray-500 mt-0.5">
                  Set your farm photo and name to appear automatically on all postings.
                </p>
              </div>

              <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl border border-gray-100 flex-wrap">
                {avatarPreviewUrl || avatarUrl ? (
                  <img
                    src={avatarPreviewUrl || avatarUrl}
                    alt="Farm avatar"
                    className="w-20 h-20 rounded-2xl object-cover border-2 border-emerald-500 shadow-sm shrink-0"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                    <Sprout className="w-10 h-10" />
                  </div>
                )}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-700">Upload Farm / Farmer Photo</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => avatarCameraInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 px-3 py-2 border rounded-lg text-xs font-semibold text-gray-700 hover:bg-white bg-white"
                    >
                      <Camera className="w-3.5 h-3.5" /> Take Photo
                    </button>
                    <button
                      type="button"
                      onClick={() => avatarLibraryInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 px-3 py-2 border rounded-lg text-xs font-semibold text-gray-700 hover:bg-white bg-white"
                    >
                      <ImageIcon className="w-3.5 h-3.5" /> Choose Photo
                    </button>
                    <input
                      ref={avatarCameraInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={(e) => handleAvatarFileSelected(e.target.files?.[0] || null)}
                      className="hidden"
                    />
                    <input
                      ref={avatarLibraryInputRef}
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleAvatarFileSelected(e.target.files?.[0] || null)}
                      className="hidden"
                    />
                  </div>
                  <p className="text-[10px] text-gray-400">
                    This photo will display beside every harvest listing you publish.
                  </p>
                </div>
              </div>

              <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 space-y-3">
                <div>
                  <p id="dash-banner-label" className="text-xs font-semibold text-gray-700">
                    Farm Banner Photo (Optional)
                  </p>
                  <p className="text-[10px] text-gray-400">
                    A wide photo shown across the top of your public farm page — your fields, your stand or
                    your harvest. Landscape photos work best; the middle of the photo is what shows.
                  </p>
                </div>

                {/* Previewed at the same shape it has on the public page. */}
                <div className="h-32 sm:h-40 rounded-xl overflow-hidden bg-emerald-700 flex items-center justify-center text-white">
                  {coverPreviewUrl || coverUrl ? (
                    <img
                      src={coverPreviewUrl || coverUrl}
                      alt="Farm banner preview"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="flex items-center gap-2 opacity-80">
                      <Sprout className="w-8 h-8" aria-hidden="true" />
                      <span className="text-sm font-bold">No banner yet</span>
                    </div>
                  )}
                </div>

                <div role="group" aria-labelledby="dash-banner-label" className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => coverInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3 py-2 border rounded-lg text-xs font-semibold text-gray-700 hover:bg-white bg-white"
                  >
                    <ImageIcon className="w-3.5 h-3.5" /> {coverPreviewUrl || coverUrl ? 'Change Banner' : 'Choose Banner'}
                  </button>
                  {(coverPreviewUrl || coverUrl) && (
                    <button
                      type="button"
                      onClick={() => {
                        handleCoverFileSelected(null);
                        setCoverUrl('');
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-2 border rounded-lg text-xs font-semibold text-gray-700 hover:bg-white bg-white"
                    >
                      <X className="w-3.5 h-3.5" /> Remove
                    </button>
                  )}
                  <input
                    ref={coverInputRef}
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleCoverFileSelected(e.target.files?.[0] || null)}
                    className="hidden"
                  />
                </div>
                <p className="text-[10px] text-gray-400">Click "Save Profile &amp; Branding" below to apply.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="dash-farm-stand-name" className="block text-xs font-semibold text-gray-700 mb-1">
                    Farm / Stand Name *
                  </label>
                  <input id="dash-farm-stand-name"
                    type="text"
                    required
                    placeholder="e.g., Sunrise Acres Garden"
                    value={farmName}
                    onChange={(e) => setFarmName(e.target.value)}
                    className="w-full px-4 py-2 border rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="dash-location" className="block text-xs font-semibold text-gray-700 mb-1">
                    Location *
                  </label>
                  <input id="dash-location"
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
                <label htmlFor="dash-farm-bio" className="block text-xs font-semibold text-gray-700 mb-1">Farm Bio</label>
                <textarea id="dash-farm-bio"
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

          {activeTab === 'settings' && (
            <div className="space-y-6">
              <div className="pb-4 border-b border-gray-100">
                <h1 className="text-2xl font-bold text-gray-900">Payouts & Settings</h1>
                <p className="text-xs text-gray-500 mt-0.5">
                  Connect a payout account so your earnings can be deposited directly to your bank.
                </p>
              </div>

              {stripeOnboardingComplete ? (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-2 text-xs text-emerald-900">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  <div>
                    <p className="font-bold text-sm">Payouts connected</p>
                    <p className="mt-0.5">
                      Your Stripe account is verified and ready to receive payouts.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2 text-xs text-amber-900">
                  <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
                  <div>
                    <p className="font-bold text-sm">
                      {stripeAccountId ? 'Payout setup incomplete' : 'Payouts not connected'}
                    </p>
                    <p className="mt-0.5">
                      {stripeAccountId
                        ? 'Finish the remaining steps with Stripe to start receiving direct payouts.'
                        : 'Set up a Stripe payout account to receive your earnings by direct deposit.'}
                    </p>
                  </div>
                </div>
              )}

              {!stripeOnboardingComplete && !connectInstance && (
                <button
                  type="button"
                  onClick={handleSetUpPayouts}
                  disabled={settingUpPayouts}
                  className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 px-5 rounded-xl text-sm transition-colors shadow-sm disabled:bg-gray-400"
                >
                  <CreditCard className="w-4 h-4" />
                  {settingUpPayouts
                    ? 'Starting...'
                    : stripeAccountId
                      ? 'Continue Payout Setup'
                      : 'Set Up Payouts'}
                </button>
              )}

              {connectInstance && (
                <div className="p-4 border border-gray-200 rounded-xl">
                  <ConnectComponentsProvider connectInstance={connectInstance}>
                    <ConnectAccountOnboarding onExit={handleOnboardingExit} />
                  </ConnectComponentsProvider>
                </div>
              )}

              <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900">
                Buyers pay in full online when they reserve your produce — there's no cash or
                Venmo collected at pickup. Your earnings for an order are released to your
                connected payout account when you enter the buyer's pickup code at pickup, less a{' '}
                {SELLER_FEE_RATE * 100}% seller fee on your produce sales. Buyers can't
                purchase your listings until payout setup is complete.
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}