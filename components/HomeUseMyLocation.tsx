'use client';

import { useRouter } from 'next/navigation';
import UseMyLocation from '@/components/UseMyLocation';

// The home page banner's "Use my location": opens Browse near the zip code
// the device is in, like typing it into the search box.
export default function HomeUseMyLocation() {
  const router = useRouter();
  return <UseMyLocation tone="dark" onZip={(zip) => router.push(`/browse?zip=${zip}`)} className="mt-2 items-center" />;
}
