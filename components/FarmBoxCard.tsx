import Link from 'next/link';
import { Package, MapPin, Repeat, User } from 'lucide-react';
import Photo from '@/components/Photo';
import { describeFrequency, formatBoxDate } from '@/lib/csaSchedule';

// A Farm Box as Browse shows it, from /api/csa/plans.
export type BrowseFarmBox = {
  id: string;
  farmerId: string;
  farmName: string;
  farmAvatar: string | null;
  farmLocation: string;
  name: string;
  description: string;
  imageUrl: string | null;
  cost: { priceCents: number; totalCents: number };
  frequency: string;
  pickupWeekday: number;
  pickupWindow: string;
  firstBox: string | null;
  // For distances, in the same shape as a listing.
  zip_code: string;
  latitude: number | null;
  longitude: number | null;
};

// A Farm Box card for Browse: the whole card leads to the Farm Box page,
// where buyers sign up or buy just one.
export default function FarmBoxCard({ box, milesAway }: { box: BrowseFarmBox; milesAway: number | null }) {
  return (
    <div className="bg-white rounded-2xl border border-emerald-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col">
      <Link href={`/csa/${box.id}`} className="h-44 bg-emerald-50 relative flex items-center justify-center overflow-hidden">
        {box.imageUrl ? (
          <Photo
            src={box.imageUrl}
            alt={box.name}
            sizes="(max-width: 767px) 100vw, (max-width: 1023px) 50vw, 33vw"
            className="w-full h-full object-cover"
          />
        ) : (
          <Package className="w-12 h-12 text-emerald-700/40" aria-hidden="true" />
        )}
        <span className="absolute top-3 left-3 bg-emerald-700 text-white text-[10px] font-bold px-2.5 py-1 rounded-full shadow-sm">
          Farm Box
        </span>
      </Link>

      <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
        <div>
          <Link
            href={`/sellers/${box.farmerId}`}
            className="flex items-center gap-2 mb-2 pb-2 border-b border-gray-100 group"
          >
            {box.farmAvatar ? (
              <Photo
                src={box.farmAvatar}
                alt={box.farmName}
                sizes="24px"
                className="w-6 h-6 rounded-full object-cover border border-emerald-300"
              />
            ) : (
              <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
                <User className="w-3.5 h-3.5" />
              </div>
            )}
            <span className="text-xs font-bold text-gray-700 truncate group-hover:text-emerald-700 group-hover:underline">
              {box.farmName}
            </span>
          </Link>

          <h3 className="font-extrabold text-gray-900 text-lg leading-snug">
            <Link href={`/csa/${box.id}`} className="hover:text-emerald-700">
              {box.name}
            </Link>
          </h3>
          <p className="text-xs text-gray-600 mt-1 line-clamp-2">{box.description}</p>

          <div className="flex items-center gap-2 text-xs text-gray-600 mt-2">
            <Repeat className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>
              {describeFrequency({ pickup_weekday: box.pickupWeekday, frequency: box.frequency })}
              {box.pickupWindow ? `, ${box.pickupWindow}` : ''}
              {box.firstBox ? ` · next box ${formatBoxDate(box.firstBox)}` : ''}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500 mt-1.5">
            <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>
              {box.farmLocation || 'Local farm'}
              {milesAway !== null && (
                <span className="font-semibold text-emerald-800">
                  {' '}
                  · {milesAway < 2 ? 'under 2' : `about ${Math.round(milesAway)}`} mi away
                </span>
              )}
            </span>
          </div>
        </div>

        <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
          <div>
            <span className="text-2xl font-black text-gray-900">${(box.cost.priceCents / 100).toFixed(2)}</span>
            <span className="text-xs text-gray-500 font-medium"> / box</span>
          </div>
          <Link
            href={`/csa/${box.id}`}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm"
          >
            See Farm Box
          </Link>
        </div>
      </div>
    </div>
  );
}
