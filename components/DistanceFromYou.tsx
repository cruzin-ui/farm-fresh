'use client';

import { useEffect, useState } from 'react';
import { Car, AlertTriangle } from 'lucide-react';
import {
  geocodeZip,
  milesBetween,
  describeDrive,
  directionsLink,
  rememberedBuyerZip,
  rememberBuyerZip,
  type Coordinates,
} from '@/lib/geo';

// How far a farm is from the buyer, shown before they buy so nobody discovers
// after paying that the pickup is further than they'd drive. It uses the zip
// code the buyer gave on Browse (or asks for one here), and the farm's zip
// code, never its street address. The figure is an estimate of the distance
// by road, with a link to the real drive on Google Maps.
export default function DistanceFromYou({
  farmZip,
  farmCoordinates,
  remindIfFar = false,
}: {
  farmZip: string | null | undefined;
  // The farm's stored location, when there is one; otherwise its zip is looked up.
  farmCoordinates?: Coordinates | null;
  // At checkout: add a reminder when the farm is a long drive away.
  remindIfFar?: boolean;
}) {
  const toZip = String(farmZip || '').slice(0, 5);
  const [buyerZip, setBuyerZip] = useState('');
  const [draftZip, setDraftZip] = useState('');
  const [editing, setEditing] = useState(false);
  const [straightMiles, setStraightMiles] = useState<number | null>(null);
  const [lookupFailed, setLookupFailed] = useState(false);

  useEffect(() => {
    setBuyerZip(rememberedBuyerZip());
  }, []);

  useEffect(() => {
    let cancelled = false;
    setStraightMiles(null);
    setLookupFailed(false);
    if (!/^\d{5}$/.test(buyerZip) || !/^\d{5}$/.test(toZip)) return;

    Promise.all([geocodeZip(buyerZip), farmCoordinates ? Promise.resolve(farmCoordinates) : geocodeZip(toZip)]).then(
      ([from, to]) => {
        if (cancelled) return;
        if (from && to) setStraightMiles(milesBetween(from, to));
        else setLookupFailed(true);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [buyerZip, toZip, farmCoordinates?.latitude, farmCoordinates?.longitude]);

  if (!/^\d{5}$/.test(toZip)) return null;

  const saveZip = () => {
    const zip = draftZip.replace(/\D/g, '').slice(0, 5);
    if (zip.length !== 5) return;
    rememberBuyerZip(zip);
    setBuyerZip(zip);
    setEditing(false);
  };

  if (!buyerZip || editing) {
    return (
      <div className="text-xs text-gray-600">
        <label htmlFor={`distance-zip-${toZip}`} className="flex items-center gap-1.5 font-semibold text-gray-700">
          <Car className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
          How far is this from you?
        </label>
        <div className="mt-1 flex items-center gap-2">
          <input
            id={`distance-zip-${toZip}`}
            type="text"
            inputMode="numeric"
            placeholder="Zip code"
            maxLength={5}
            value={draftZip}
            onChange={(e) => setDraftZip(e.target.value.replace(/\D/g, '').slice(0, 5))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                saveZip();
              }
            }}
            className="w-32 px-2.5 py-1.5 border rounded-lg text-sm bg-white"
          />
          <button
            type="button"
            onClick={saveZip}
            disabled={draftZip.length !== 5}
            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white disabled:bg-gray-300"
          >
            Show distance
          </button>
          {editing && (
            <button type="button" onClick={() => setEditing(false)} className="text-xs font-semibold text-gray-600 underline">
              Cancel
            </button>
          )}
        </div>
      </div>
    );
  }

  if (lookupFailed) {
    return (
      <p className="text-xs text-gray-500">
        Couldn&apos;t work out the distance from {buyerZip}.{' '}
        <a href={directionsLink(buyerZip, toZip)} target="_blank" rel="noopener noreferrer" className="font-semibold text-emerald-800 underline">
          See the drive on Google Maps
        </a>
      </p>
    );
  }

  if (straightMiles === null) {
    return <p className="text-xs text-gray-500">Working out the distance...</p>;
  }

  const drive = describeDrive(straightMiles);

  return (
    <div className="space-y-1.5">
      <p className="text-xs text-gray-700 flex items-start gap-1.5">
        <Car className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
        <span>
          <span className="font-semibold text-gray-900">{drive.text}</span> by road, from zip {buyerZip}.{' '}
          <a href={directionsLink(buyerZip, toZip)} target="_blank" rel="noopener noreferrer" className="font-semibold text-emerald-800 underline">
            See the drive
          </a>{' '}
          ·{' '}
          <button
            type="button"
            onClick={() => {
              setDraftZip(buyerZip);
              setEditing(true);
            }}
            className="font-semibold text-gray-600 underline"
          >
            Change zip
          </button>
        </span>
      </p>
      {remindIfFar && drive.far && (
        <p className="text-xs text-amber-950 bg-amber-50 border border-amber-300 rounded-lg p-2 flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            That&apos;s a fair drive. Pickup is in person, so check the trip works for you before you pay.
          </span>
        </p>
      )}
    </div>
  );
}
