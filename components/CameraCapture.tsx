'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, X } from 'lucide-react';

// Opens the device's camera and takes one still photo. Works on phones and on
// computers with a webcam. The picture is handed back as a file; nothing is
// uploaded here.
export default function CameraCapture({
  onCapture,
  onClose,
}: {
  onCapture: (photo: File) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let stopped = false;

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("This browser can't use the camera here. Upload a photo instead.");
        return;
      }

      try {
        // The front camera on a phone; whatever is available on a computer.
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'user' } },
          audio: false,
        });
        if (stopped) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        setReady(true);
      } catch (err: any) {
        setError(
          err?.name === 'NotAllowedError'
            ? 'Camera access was blocked. Allow the camera for this site in your browser settings, or upload a photo instead.'
            : "The camera couldn't be started. Upload a photo instead."
        );
      }
    }

    start();

    return () => {
      stopped = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const takePhoto = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;

    // A square from the middle of the frame, since the picture is shown in a circle.
    const side = Math.min(video.videoWidth, video.videoHeight);
    const canvas = document.createElement('canvas');
    canvas.width = side;
    canvas.height = side;
    const context = canvas.getContext('2d');
    if (!context) return;

    context.drawImage(video, (video.videoWidth - side) / 2, (video.videoHeight - side) / 2, side, side, 0, 0, side, side);
    canvas.toBlob(
      (blob) => {
        if (blob) onCapture(new File([blob], 'profile-photo.jpg', { type: 'image/jpeg' }));
      },
      'image/jpeg',
      0.9
    );
  };

  return (
    <div className="space-y-3">
      {error ? (
        <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 p-3 rounded-lg">
          {error}
        </p>
      ) : (
        <video
          ref={videoRef}
          muted
          playsInline
          aria-label="Camera view for your profile photo"
          className="w-56 h-56 object-cover rounded-full bg-black mx-auto"
        />
      )}
      <div className="flex gap-2 justify-center flex-wrap">
        {!error && (
          <button
            type="button"
            onClick={takePhoto}
            disabled={!ready}
            className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-400 text-white text-sm font-bold px-4 py-2.5 rounded-xl"
          >
            <Camera className="w-4 h-4" aria-hidden="true" /> {ready ? 'Take Photo' : 'Starting camera...'}
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-1.5 bg-white border text-gray-700 text-sm font-bold px-4 py-2.5 rounded-xl hover:bg-gray-50"
        >
          <X className="w-4 h-4" aria-hidden="true" /> {error ? 'Close' : 'Cancel'}
        </button>
      </div>
    </div>
  );
}
