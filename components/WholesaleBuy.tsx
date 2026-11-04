'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Briefcase, ShoppingCart } from 'lucide-react';
import { postWithAuth } from '@/lib/authedFetch';
import { addToCart, useCart } from '@/lib/cart';
import { caseLabel, type WholesaleOffer } from '@/lib/wholesale';

// On a listing's page: buying it by the case. An approved wholesale account
// sees the case price and can add cases to the cart; anyone else just sees
// that the farm sells by the case, with a link to apply. Shows nothing for a
// listing that isn't offered wholesale.
export default function WholesaleBuy({
  listingId,
  unitType,
  availableUnits,
}: {
  listingId: string;
  unitType: string;
  availableUnits: number;
}) {
  const [info, setInfo] = useState<{
    available: boolean;
    approved: boolean;
    own?: boolean;
    applied?: string | null;
    offer?: WholesaleOffer;
    taxExempt?: boolean;
  } | null>(null);
  const [cases, setCases] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const { items } = useCart();

  useEffect(() => {
    let cancelled = false;
    postWithAuth('/api/wholesale/listing', { listingId })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => !cancelled && setInfo(data))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [listingId]);

  if (!info?.available) return null;

  if (info.own && info.offer) {
    return (
      <p className="text-xs text-gray-700 bg-amber-50 border border-amber-200 rounded-xl p-3">
        <strong>Wholesale:</strong> you also sell this at ${info.offer.casePrice.toFixed(2)} per{' '}
        {caseLabel(info.offer.caseSize, unitType)} to approved businesses.
      </p>
    );
  }

  if (!info.approved || !info.offer) {
    return (
      <p className="text-xs text-gray-700 bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
        <Briefcase className="w-4 h-4 text-amber-700 shrink-0" aria-hidden="true" />
        <span>
          {info.applied === 'pending' ? (
            <>This farm also sells by the case. Your wholesale application is being reviewed.</>
          ) : (
            <>
              Buying for a business? This farm also sells by the case to approved wholesale accounts.{' '}
              <Link href="/account#wholesale" className="font-semibold text-emerald-800 underline">
                Apply for wholesale pricing
              </Link>
            </>
          )}
        </span>
      </p>
    );
  }

  const offer = info.offer;
  const inCart = items.find((item) => item.listingId === listingId && item.wholesale)?.quantity || 0;
  const availableCases = Math.floor(availableUnits / offer.caseSize);
  const roomLeft = availableCases - inCart;
  const fewest = inCart > 0 ? 1 : offer.minCases;
  const chosen = Math.min(Math.max(fewest, parseInt(cases, 10) || fewest), Math.max(fewest, roomLeft));
  const perUnit = offer.casePrice / offer.caseSize;

  const add = () => {
    if (roomLeft < fewest) return;
    if (addToCart(listingId, chosen, true)) {
      setMessage(`Added: ${inCart + chosen} case${inCart + chosen === 1 ? '' : 's'} in your cart.`);
      setCases('');
    } else {
      setMessage('Your cart is full. Check out, or remove something, before adding more.');
    }
  };

  return (
    <div className="border-2 border-amber-300 bg-amber-50 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
          <Briefcase className="w-4 h-4 text-amber-700" aria-hidden="true" /> Wholesale
        </p>
        <span className="text-[10px] font-bold uppercase tracking-wide bg-amber-200 text-amber-900 rounded px-1.5 py-0.5">
          Your business price
        </span>
      </div>
      <p className="text-sm text-gray-800">
        <strong className="text-lg">${offer.casePrice.toFixed(2)}</strong> per {caseLabel(offer.caseSize, unitType)}{' '}
        <span className="text-gray-600">(${perUnit.toFixed(2)} per {unitType})</span>
      </p>
      <p className="text-xs text-gray-700">
        {offer.minCases > 1 ? `Minimum ${offer.minCases} cases. ` : ''}
        {availableCases} case{availableCases === 1 ? '' : 's'} available.{' '}
        {info.taxExempt ? 'Tax-exempt: your resale certificate is on file.' : ''}
      </p>
      {roomLeft >= fewest ? (
        <div className="flex items-stretch gap-2">
          <div className="flex items-center gap-2 bg-white border px-3 rounded-xl">
            <label htmlFor="wholesale-cases" className="text-xs text-gray-600 font-semibold">
              Cases:
            </label>
            <input
              id="wholesale-cases"
              type="number"
              inputMode="numeric"
              min={fewest}
              max={roomLeft}
              placeholder={String(fewest)}
              value={cases}
              onFocus={(e) => e.target.select()}
              onChange={(e) => setCases(e.target.value.replace(/\D/g, ''))}
              onBlur={() => cases && setCases(String(chosen))}
              className="w-14 text-center text-sm font-bold bg-white border rounded p-1 focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>
          <button
            type="button"
            onClick={add}
            className="flex-1 inline-flex items-center justify-center gap-2 bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 rounded-xl text-sm shadow-md"
          >
            <ShoppingCart className="w-4 h-4" aria-hidden="true" /> Add Cases to Cart
          </button>
        </div>
      ) : (
        <p className="text-xs font-semibold text-gray-700">
          {inCart > 0 ? 'All the available cases are in your cart.' : `Not enough left for the minimum order of ${offer.minCases} cases.`}
        </p>
      )}
      {(message || inCart > 0) && (
        <p role="status" className="text-xs font-semibold text-amber-950">
          {message || `${inCart} case${inCart === 1 ? '' : 's'} in your cart.`}{' '}
          <Link href="/checkout" className="underline">
            View cart
          </Link>
        </p>
      )}
      <p className="text-[11px] text-gray-600">
        Adding cases replaces any of this item already in your cart at the retail price.
      </p>
    </div>
  );
}
