'use client';

import Link from 'next/link';
import { QRCodeSVG } from 'qrcode.react';
import { MapPin, Store } from 'lucide-react';
import ReviewForm from '@/components/ReviewForm';
import { describeItems, isOpenStatus, type PickupGroup } from '@/lib/pickupGroups';

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  pending_pickup: { label: 'Being Prepared', className: 'bg-amber-100 text-amber-800' },
  ready_for_pickup: { label: 'Ready for Pickup', className: 'bg-blue-100 text-blue-800' },
  completed: { label: 'Picked Up', className: 'bg-emerald-100 text-emerald-800' },
  cancelled: { label: 'Cancelled', className: 'bg-gray-100 text-gray-600' },
};

// Everything a buyer bought from one farm in one checkout: the pickup code
// that covers it, what the code is for, and where each item stands. `token` is
// the secret from a guest's order link; signed-in buyers don't need one.
export default function PickupGroupCard({ group, token }: { group: PickupGroup; token?: string | null }) {
  const openItems = group.items.filter((item) => isOpenStatus(item.status));
  const open = openItems.length > 0;
  const completedItems = group.items.filter((item) => item.status === 'completed');
  // The code is for whatever is still to be collected; once nothing is, it is
  // shown as a record of everything it covered.
  const codeItems = open ? openItems : group.items;
  // After a partial pickup the items still to collect carry a new code, so
  // theirs is the one to show.
  const code = (open ? openItems[0].pickup_code : null) || group.code;

  const addresses = [...new Set(openItems.map((item) => item.pickup_address).filter(Boolean))];
  const first = group.items[0];

  return (
    <div className="p-5 bg-white border border-gray-200 rounded-2xl shadow-sm space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-base font-bold text-gray-900 flex items-center gap-2">
          <Store className="w-5 h-5 text-emerald-600 shrink-0" aria-hidden="true" />
          {group.farmerId ? (
            <Link href={`/sellers/${group.farmerId}`} className="hover:underline">
              {group.farmName}
            </Link>
          ) : (
            group.farmName
          )}
        </p>
        <span className="text-xs text-gray-500">Ordered {new Date(first.created_at).toLocaleDateString()}</span>
      </div>

      {code && (
        <div
          className={`rounded-xl p-4 text-center border-2 ${
            open ? 'border-emerald-500 bg-emerald-50' : 'border-dashed border-gray-300 bg-gray-50'
          }`}
        >
          <p className={`text-xs font-bold uppercase tracking-widest ${open ? 'text-emerald-800' : 'text-gray-500'}`}>
            {open
              ? 'Your Pickup Code'
              : completedItems.length > 0
                ? 'Pickup Code (used at pickup)'
                : 'Pickup Code (order cancelled)'}
          </p>
          <p className={`text-4xl font-black tracking-wider font-mono ${open ? 'text-emerald-900' : 'text-gray-500'}`}>
            {code}
          </p>
          <p className={`text-sm font-semibold mt-1 ${open ? 'text-emerald-950' : 'text-gray-600'}`}>
            For: {describeItems(codeItems)} from {group.farmName}
          </p>
          {open && (
            // The same code as above, for the farmer to scan instead of typing.
            <div className="mt-3 inline-block bg-white p-3 rounded-xl border border-emerald-200">
              <QRCodeSVG
                value={code}
                size={160}
                marginSize={2}
                role="img"
                title={`QR code for pickup code ${code}`}
              />
            </div>
          )}
          {open && (
            <p className="text-xs text-gray-600 mt-1">
              Show this QR code to the farmer to scan, or read them the code, only when you collect your
              produce — it releases their payment.
              {openItems.length > 1 &&
                " If you collect only some of these items, this code is used up and we'll email you a new one for the rest."}
            </p>
          )}
        </div>
      )}

      <ul className="divide-y divide-gray-100">
        {group.items.map((item) => {
          const status = STATUS_STYLES[item.status] || { label: item.status, className: 'bg-gray-100 text-gray-600' };

          return (
            <li key={item.id} className="py-3 first:pt-0 last:pb-0 space-y-2">
              <div className="flex justify-between items-start gap-4">
                <div className="space-y-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900 break-words">
                    {item.quantity} {item.listing_unit_type} of {item.listing_title}
                  </p>
                  <span className={`inline-block text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase ${status.className}`}>
                    {status.label}
                  </span>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-black text-emerald-800">${item.total_price.toFixed(2)}</p>
                  {item.refunded_amount > 0 && (
                    <p className="text-[11px] text-gray-500">${item.refunded_amount.toFixed(2)} refunded</p>
                  )}
                </div>
              </div>

              {addresses.length > 1 && isOpenStatus(item.status) && item.pickup_address && (
                <p className="text-xs text-gray-700 flex items-start gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>
                    Pickup address: <span className="font-semibold">{item.pickup_address}</span>
                  </span>
                </p>
              )}

              {item.status === 'ready_for_pickup' && item.pickup_details && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-900">
                  <p className="font-bold mb-1">Pickup details from the farmer</p>
                  <p className="whitespace-pre-wrap">{item.pickup_details}</p>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {addresses.length === 1 && (
        <p className="text-sm text-gray-700 flex items-start gap-1.5">
          <MapPin className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            Pickup address: <span className="font-semibold">{addresses[0]}</span>
            {openItems.some((item) => item.status !== 'ready_for_pickup') && (
              <span className="block text-xs text-gray-500 mt-0.5">
                Please wait until the farmer marks an item ready before heading over for it.
              </span>
            )}
          </span>
        </p>
      )}

      {completedItems.length > 0 && (
        <ReviewForm
          orderId={completedItems[0].id}
          token={token}
          alreadyReviewed={completedItems.some((item) => item.reviewed)}
        />
      )}
    </div>
  );
}
