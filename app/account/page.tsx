'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { CircleUser, Upload, Camera, Trash2, ArrowLeft, CheckCircle2, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { resizeImage } from '@/lib/resizeImage';
import { PROFILE_PHOTO_KEY } from '@/lib/accountEvents';
import CameraCapture from '@/components/CameraCapture';

// Account settings for any signed-in user, buyer or seller. For now that is
// the profile picture shown on their account button: upload one, take one with
// the camera, or remove it.
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
