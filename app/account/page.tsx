'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { CircleUser, Upload, Camera, Trash2, ArrowLeft, CheckCircle2, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { resizeImage } from '@/lib/resizeImage';
import { PROFILE_PHOTO_KEY } from '@/lib/accountEvents';
import CameraCapture from '@/components/CameraCapture';
import { postWithAuth } from '@/lib/authedFetch';

// Account settings for any signed-in user, buyer or seller: the profile
// picture shown on their account button, and deleting the account.
export default function AccountPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState('');
  const [email, setEmail] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [usingCamera, setUsingCamera] = useState(false);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Deleting the account: opened, what must be finished first, and the
  // word typed to confirm.
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBlockers, setDeleteBlockers] = useState<string[] | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleted, setDeleted] = useState(false);

  const openDelete = async () => {
    setDeleteOpen(true);
    setDeleteError(null);
    setDeleteBlockers(null);
    try {
      const res = await postWithAuth('/api/account/delete', { check: true });
      const data = await res.json();
      setDeleteBlockers(data.blockers || []);
    } catch {
      setDeleteBlockers([]);
    }
  };

  const deleteMyAccount = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await postWithAuth('/api/account/delete', { confirm: deleteConfirm.trim().toUpperCase() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Your account could not be deleted.');
      await supabase.auth.signOut();
      setDeleted(true);
    } catch (err: any) {
      setDeleteError(err.message || 'Your account could not be deleted.');
      setDeleting(false);
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.push('/login?redirect=/account');
        return;
      }
      setUserId(session.user.id);
      setEmail(session.user.email || '');
      setPhotoUrl((session.user.user_metadata?.[PROFILE_PHOTO_KEY] as string) || null);
      setLoading(false);
    });
  }, [router]);

  // Saves the address of the picture (or nothing, to remove it) on the user's
  // sign-in record. The account button in the header picks the change up by
  // itself.
  const savePhotoUrl = async (url: string | null) => {
    const { error } = await supabase.auth.updateUser({ data: { [PROFILE_PHOTO_KEY]: url } });
    if (error) throw error;
    setPhotoUrl(url);
  };

  const usePhoto = async (file: File) => {
    setUsingCamera(false);
    setSuccessMsg(null);
    setErrorMsg(null);

    if (!file.type.startsWith('image/')) {
      setErrorMsg('Please choose a picture file, such as a JPG or PNG.');
      return;
    }

    setSaving(true);
    try {
      // The picture is only ever shown small, so a small copy is uploaded.
      const smallCopy = await resizeImage(file, 512);
      const extension = smallCopy.name.split('.').pop() || 'jpg';
      const fileName = `profile-photos/${userId}-${Date.now()}.${extension}`;

      const { error: uploadError } = await supabase.storage.from('produce-images').upload(fileName, smallCopy, { upsert: true });
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('produce-images').getPublicUrl(fileName);
      await savePhotoUrl(data.publicUrl);
      setSuccessMsg('Your profile picture has been updated.');
    } catch (err: any) {
      setErrorMsg(err.message || 'Could not save that picture. Please try again.');
    } finally {
      setSaving(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removePhoto = async () => {
    setSuccessMsg(null);
    setErrorMsg(null);
    setSaving(true);
    try {
      await savePhotoUrl(null);
      setSuccessMsg('Your profile picture has been removed.');
    } catch (err: any) {
      setErrorMsg(err.message || 'Could not remove the picture. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (deleted) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center space-y-4">
        <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" aria-hidden="true" />
        <h1 className="text-2xl font-bold text-gray-900">Your account has been deleted</h1>
        <p className="text-sm text-gray-600">
          Thank you for being part of Farm Fresh Direct. You&apos;re welcome back any time with a new account.
        </p>
        <Link href="/" className="inline-block font-semibold text-emerald-800 underline">
          Go to the home page
        </Link>
      </div>
    );
  }

  if (loading) {
    return <div className="max-w-xl mx-auto my-20 p-8 text-center text-gray-500 text-sm">Loading your account...</div>;
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <CircleUser className="w-6 h-6 text-emerald-600" aria-hidden="true" /> My Account
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">Signed in as {email}</p>
        </div>
        <Link
          href="/browse"
          className="inline-flex items-center gap-2 bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-50 font-bold py-2.5 px-4 rounded-xl text-xs"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" /> Back to Browsing
        </Link>
      </div>

      {successMsg && (
        <div role="status" className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl flex items-center gap-2 text-sm">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" aria-hidden="true" />
          <span>{successMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div role="alert" className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-center gap-2 text-sm">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0" aria-hidden="true" />
          <span>{errorMsg}</span>
        </div>
      )}

      <Link
        href="/account/csa"
        className="flex items-center justify-between gap-3 bg-white border border-gray-200 rounded-2xl shadow-sm p-5 hover:border-emerald-300"
      >
        <span>
          <span className="block text-lg font-bold text-gray-900">My Farm Shares</span>
          <span className="block text-xs text-gray-600 mt-0.5">
            Your CSA boxes: skip a week, pause, cancel, or change the card they're charged to.
          </span>
        </span>
        <span className="text-sm font-semibold text-emerald-800" aria-hidden="true">→</span>
      </Link>

      <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 space-y-5">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Profile picture</h2>
          <p className="text-xs text-gray-600 mt-0.5">
            Shown on your account button at the top of the site. Only you see it there.
          </p>
        </div>

        {usingCamera ? (
          <CameraCapture onCapture={usePhoto} onClose={() => setUsingCamera(false)} />
        ) : (
          <>
            <div className="flex justify-center">
              {photoUrl ? (
                <img src={photoUrl} alt="Your profile picture" className="w-32 h-32 rounded-full object-cover border-2 border-emerald-200" />
              ) : (
                <div className="w-32 h-32 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center border-2 border-emerald-100">
                  <CircleUser className="w-16 h-16" aria-hidden="true" />
                  <span className="sr-only">No profile picture yet</span>
                </div>
              )}
            </div>

            <div className="flex gap-2 justify-center flex-wrap">
              <input
                ref={fileInputRef}
                id="account-photo-file"
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) usePhoto(file);
                }}
              />
              <label
                htmlFor="account-photo-file"
                className={`inline-flex items-center gap-1.5 text-white text-sm font-bold px-4 py-2.5 rounded-xl cursor-pointer focus-within:ring-2 focus-within:ring-emerald-500 ${
                  saving ? 'bg-gray-400 pointer-events-none' : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                <Upload className="w-4 h-4" aria-hidden="true" /> {saving ? 'Saving...' : 'Upload a Photo'}
              </label>
              <button
                type="button"
                onClick={() => {
                  setSuccessMsg(null);
                  setErrorMsg(null);
                  setUsingCamera(true);
                }}
                disabled={saving}
                className="inline-flex items-center gap-1.5 bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-50 disabled:opacity-50 text-sm font-bold px-4 py-2.5 rounded-xl"
              >
                <Camera className="w-4 h-4" aria-hidden="true" /> Take a Photo
              </button>
              {photoUrl && (
                <button
                  type="button"
                  onClick={removePhoto}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 bg-white border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50 text-sm font-bold px-4 py-2.5 rounded-xl"
                >
                  <Trash2 className="w-4 h-4" aria-hidden="true" /> Remove
                </button>
              )}
            </div>
          </>
        )}
      </section>

      <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 space-y-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Delete my account</h2>
          <p className="text-xs text-gray-600 mt-0.5">Close your Farm Fresh Direct account for good.</p>
        </div>

        {!deleteOpen ? (
          <button
            type="button"
            onClick={openDelete}
            className="inline-flex items-center gap-1.5 bg-white border border-red-200 text-red-700 hover:bg-red-50 text-sm font-bold px-4 py-2.5 rounded-xl"
          >
            <Trash2 className="w-4 h-4" aria-hidden="true" /> Delete My Account
          </button>
        ) : deleteBlockers === null ? (
          <p className="text-sm text-gray-500">Checking your account...</p>
        ) : deleteBlockers.length > 0 ? (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-gray-900">There&apos;s something to finish first:</p>
            <ul className="list-disc pl-5 space-y-1 text-sm text-gray-700">
              {deleteBlockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
            <p className="text-xs text-gray-500">
              This is so nobody is left with an order nobody can complete. Once it&apos;s done, come back here.
            </p>
            <button type="button" onClick={() => setDeleteOpen(false)} className="text-sm font-semibold text-gray-600 underline">
              Close
            </button>
          </div>
        ) : (
          <div className="space-y-3 text-sm text-gray-700">
            <p className="font-semibold text-gray-900">If you delete your account:</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>You can no longer sign in, and this can&apos;t be undone.</li>
              <li>Your profile picture and Favorite Farms are removed.</li>
              <li>
                If you sell here, your listings come off sale and your farm page&apos;s photos, story and web
                address are removed. Your Stripe account stays open so any money still owed to you reaches your
                bank; you can close it with Stripe afterwards.
              </li>
              <li>
                Records of orders you&apos;ve already bought or sold are kept, without your account, because the
                other person and our accounts depend on them.
              </li>
            </ul>
            <div>
              <label htmlFor="delete-confirm" className="block text-xs font-semibold text-gray-700 mb-1">
                Type DELETE to confirm
              </label>
              <input
                id="delete-confirm"
                type="text"
                autoCapitalize="characters"
                autoComplete="off"
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                className="w-40 px-3 py-2 border rounded-lg text-sm"
              />
            </div>
            {deleteError && (
              <p role="alert" className="text-sm font-semibold text-red-700">
                {deleteError}
              </p>
            )}
            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                onClick={deleteMyAccount}
                disabled={deleting || deleteConfirm.trim().toUpperCase() !== 'DELETE'}
                className="inline-flex items-center gap-1.5 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 text-white text-sm font-bold px-4 py-2.5 rounded-xl"
              >
                {deleting ? 'Deleting...' : 'Delete My Account for Good'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setDeleteOpen(false);
                  setDeleteConfirm('');
                }}
                disabled={deleting}
                className="bg-white border text-gray-700 hover:bg-gray-50 text-sm font-bold px-4 py-2.5 rounded-xl"
              >
                Keep My Account
              </button>
            </div>
          </div>
        )}
      </section>

      <p className="text-xs text-gray-500 text-center">
        Selling here? Your farm's photo and banner are set separately, under Farm Profile in your{' '}
        <Link href="/dashboard" className="font-semibold text-emerald-800 underline">
          Seller Dashboard
        </Link>
        .
      </p>
    </div>
  );
}
