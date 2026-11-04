'use client';

import { SELLER_FEE_RATE } from '@/lib/pricing';

// The "Also sell wholesale" part of a listing form: a case size, a case price
// and the fewest cases a business can order. Cases come out of the same stock
// as the retail listing.
export type WholesaleDraft = { enabled: boolean; caseSize: string; casePrice: string; minCases: string };

export const NO_WHOLESALE: WholesaleDraft = { enabled: false, caseSize: '', casePrice: '', minCases: '1' };

// A saved offer, as the form's fields.
export const wholesaleDraftFrom = (offer: { caseSize: number; casePrice: number; minCases: number } | null | undefined): WholesaleDraft =>
  offer
    ? { enabled: true, caseSize: String(offer.caseSize), casePrice: offer.casePrice.toFixed(2), minCases: String(offer.minCases) }
    : NO_WHOLESALE;

export default function WholesaleFields({
  value,
  onChange,
  unitType,
  retailPrice,
  idPrefix = 'wholesale',
}: {
  value: WholesaleDraft;
  onChange: (value: WholesaleDraft) => void;
  unitType: string;
  retailPrice: number;
  idPrefix?: string;
}) {
  const set = (patch: Partial<WholesaleDraft>) => onChange({ ...value, ...patch });
  const caseSize = Number(value.caseSize);
  const casePrice = Number(value.casePrice);
  const perUnit = caseSize > 0 && casePrice > 0 ? casePrice / caseSize : null;
  const discount = perUnit !== null && retailPrice > 0 ? Math.round((1 - perUnit / retailPrice) * 100) : null;
  const field = 'w-full px-3 py-2.5 border rounded-xl text-base bg-white';

  return (
    <div className="border rounded-xl p-3 space-y-3 bg-amber-50/60 border-amber-200">
      <label className="flex items-start gap-2 text-sm font-semibold text-gray-900">
        <input
          type="checkbox"
          checked={value.enabled}
          onChange={(e) => set({ enabled: e.target.checked })}
          className="mt-1 w-4 h-4 accent-emerald-600"
        />
        <span>
          Also sell wholesale
          <span className="block text-xs font-normal text-gray-600">
            By the case, to businesses Farm Fresh Direct has approved (restaurants, grocers, co-ops). Optional.
          </span>
        </span>
      </label>

      {value.enabled && (
        <>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label htmlFor={`${idPrefix}-size`} className="block text-xs font-semibold text-gray-800 mb-1">
                Case size ({unitType})
              </label>
              <input
                id={`${idPrefix}-size`}
                type="number"
                inputMode="numeric"
                step="1"
                min="2"
                placeholder="20"
                value={value.caseSize}
                onChange={(e) => set({ caseSize: e.target.value })}
                className={field}
              />
            </div>
            <div>
              <label htmlFor={`${idPrefix}-price`} className="block text-xs font-semibold text-gray-800 mb-1">
                Case price ($)
              </label>
              <input
                id={`${idPrefix}-price`}
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                placeholder="45.00"
                value={value.casePrice}
                onChange={(e) => set({ casePrice: e.target.value })}
                className={field}
              />
            </div>
            <div>
              <label htmlFor={`${idPrefix}-min`} className="block text-xs font-semibold text-gray-800 mb-1">
                Minimum (cases)
              </label>
              <input
                id={`${idPrefix}-min`}
                type="number"
                inputMode="numeric"
                step="1"
                min="1"
                placeholder="1"
                value={value.minCases}
                onChange={(e) => set({ minCases: e.target.value })}
                className={field}
              />
            </div>
          </div>
          <p className="text-xs text-gray-700">
            {perUnit !== null ? (
              <>
                That&apos;s <strong>${perUnit.toFixed(2)}</strong> per {unitType}
                {discount !== null && discount > 0 ? <> ({discount}% off retail)</> : null}. You keep{' '}
                <strong>${(casePrice * (1 - SELLER_FEE_RATE)).toFixed(2)}</strong> per case.{' '}
              </>
            ) : null}
            Cases come out of the amount above, so you can&apos;t sell the same {unitType} twice.
          </p>
        </>
      )}
    </div>
  );
}
