'use client';

import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { X } from 'lucide-react';

// Opens the device's camera and reads a QR code from it. Used by farmers to
// scan the pickup code on a buyer's phone instead of typing it. The picture
// never leaves the device: each frame is read in the browser and thrown away.
export default function QrScanner({
  onResult,
  onClose,
}: {
  // Called once with the text in the first QR code found.
  onResult: (text: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let frame = 0;
    let stopped = false;
    const canvas = document.createElement('canvas');

    const scan = () => {
      if (stopped) return;
      const video = videoRef.current;

      if (video && video.readyState >= 2 && video.videoWidth > 0) {
        // A smaller picture is plenty for a QR code and much quicker to read.
        const scale = Math.min(1, 640 / video.videoWidth);
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);

        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (context) {
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          const image = context.getImageData(0, 0, canvas.width, canvas.height);
          const found = jsQR(image.data, image.width, image.height);

          if (found?.data) {
            stopped = true;
            onResult(found.data);
            return;
          }
        }
      }

      frame = requestAnimationFrame(scan);
    };

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("This browser can't use the camera here. Type the code instead.");
        return;
      }

      try {
        // The back camera on a phone; whatever is available on a computer.
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
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
        frame = requestAnimationFrame(scan);
      } catch (err: any) {
        setError(
          err?.name === 'NotAllowedError'
            ? 'Camera access was blocked. Allow the camera for this site in your browser settings, or type the code instead.'
            : "The camera couldn't be started. Type the code instead."
        );
      }
    }

    start();

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-2">
      {error ? (
        <p role="alert" className="text-xs text-red-700 bg-red-50 border border-red-200 p-3 rounded-lg">
          {error}
        </p>
      ) : (
        <>
          <video
            ref={videoRef}
            muted
            playsInline
            aria-label="Camera view for scanning the buyer's QR code"
            className="w-full max-w-xs aspect-square object-cover rounded-xl bg-black"
          />
          <p role="status" className="text-xs text-emerald-900">
            Point the camera at the QR code on the buyer's phone.
          </p>
        </>
      )}
      <button
        type="button"
        onClick={onClose}
        className="inline-flex items-center gap-1.5 bg-white border text-gray-600 text-xs font-bold px-3.5 py-2 rounded-xl hover:bg-gray-50"
      >
        <X className="w-3.5 h-3.5" aria-hidden="true" /> {error ? 'Close' : 'Stop Scanning'}
      </button>
    </div>
  );
}
