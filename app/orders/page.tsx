'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ShoppingBag, MapPin } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  pending_pickup: { label: 'Being Prepared', className: 'bg-amber-100 text-amber-800' },
  ready_for_pickup: { label: 'Ready for Pickup', className: 'bg-blue-100 text-blue-800' },
  completed: { label: 'Picked Up', className: 'bg-emerald-100 text-emerald-800' },
  cancelled: { label: 'Cancelled', className: 'bg-gray-100 text-gray-600' },
};

export default function MyOrdersPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<any[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchOrders() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login?redirect=/orders');
        return;
      }

      const { data: myOrders, error } = await supabase
        .from('orders')
        .select('*')
        .eq('buyer_id', session.user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Failed to fetch orders:', error);
        setFetchError(error.message);
        setLoading(false);
        return;
      }

      const orderIds = (myOrders || []).map((o) => o.id);
      const listingIds = [...new Set((myOrders || []).map((o) => o.listing_id).filter(Boolean))];

      const { data: listings } = listingIds.length
        ? await supabase
            .from('produce_listings')
            .select('id, title, unit_type, location_name')
            .in('id', listingIds)
        : { data: [] as any[] };

      // Pickup codes are stored separately so only the buyer can read them.
      const { data: codes } = orderIds.length
        ? await supabase.from('order_pickup_codes').select('order_id, code').in('order_id', orderIds)
        : { data: [] as any[] };

      const listingById = new Map((listings || []).map((l) => [l.id, l]));
      const codeByOrderId = new Map((codes || []).map((c) => [c.order_id, c.code]));

      setOrders(
        (myOrders || []).map((o) => ({
          ...o,
          listing_title: listingById.get(o.listing_id)?.title || 'Harvest Crop',
          listing_unit_type: listingById.get(o.listing_id)?.unit_type || 'units',
          listing_location: listingById.get(o.listing_id)?.location_name || '',
          display_code: codeByOrderId.get(o.id) || o.pickup_code || null,
        }))
      );
      setLoading(false);
    }

    fetchOrders();
  }, [router]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto my-20 p-8 text-center text-gray-500 text-sm">
        Loading your orders...
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <ShoppingBag className="w-6 h-6 text-emerald-600" /> My Orders
        </h1>
        <p className="text-xs text-gray-500 mt-0.5">
          Your reservations, pickup details and pickup codes.
        </p>
      </div>

      {fetchError && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
          Could not load your orders: {fetchError}
        </div>
      )}

      {!fetchError && orders.length === 0 && (
        <div className="text-center py-16 bg-white rounded-xl border border-dashed border-gray-200">
          <ShoppingBag className="mx-auto h-12 w-12 text-gray-400 mb-3" />
          <h3 className="text-base font-semibold text-gray-900">No orders yet</h3>
          <Link
            href="/browse"
            className="mt-4 inline-flex items-center gap-2 bg-emerald-600 text-white font-semibold py-2.5 px-5 rounded-lg text-xs shadow-sm hover:bg-emerald-700"
          >
            Browse Fresh Produce
          </Link>
        </div>
      )}

      <div className="space-y-4">
        {orders.map((order) => {
          const status = STATUS_STYLES[order.status] || {
            label: order.status,
            className: 'bg-gray-100 text-gray-600',
          };
          const open = order.status === 'pending_pickup' || order.status === 'ready_for_pickup';
          const refunded = Number(order.refunded_amount || 0);

          return (
            <div key={order.id} className="p-5 bg-white border border-gray-200 rounded-2xl shadow-sm space-y-3">
              {order.display_code && (
                <div
                  className={`rounded-xl p-4 text-center border-2 ${
                    open ? 'border-emerald-500 bg-emerald-50' : 'border-dashed border-gray-300 bg-gray-50'
                  }`}
                >
                  <span
                    className={`text-[11px] font-bold uppercase tracking-widest ${
                      open ? 'text-emerald-800' : 'text-gray-500'
                    }`}
                  >
                    {open
                      ? 'Your Pickup Code'
                      : order.status === 'completed'
                        ? 'Pickup Code (used at pickup)'
                        : 'Pickup Code (order cancelled)'}
                  </span>
                  <div
                    className={`text-4xl font-black tracking-wider font-mono ${
                      open ? 'text-emerald-900' : 'text-gray-400'
                    }`}
                  >
                    {order.display_code}
                  </div>
                  {open && (
                    <p className="text-xs text-gray-600 mt-1">
                      Give this code to the farmer only when you collect your produce — it releases
                      their payment.
                    </p>
                  )}
                </div>
              )}
              <div className="flex justify-between items-start gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase ${status.className}`}>
                      {status.label}
                    </span>
                    <span className="text-xs text-gray-400">
                      Order #{order.id.slice(0, 8)} · {new Date(order.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-gray-900">{order.listing_title}</h3>
                  <p className="text-xs text-gray-600">
                    {Number(order.reserved_quantity ?? order.quantity ?? 0)} {order.listing_unit_type}
                    {order.listing_location && (
                      <span className="inline-flex items-center gap-1 ml-2 text-gray-400">
                        <MapPin className="w-3 h-3" /> {order.listing_location}
                      </span>
                    )}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-black text-emerald-800">
                    ${Number(order.total_price || 0).toFixed(2)}
                  </p>
                  {refunded > 0 && (
                    <p className="text-[11px] text-gray-500">${refunded.toFixed(2)} refunded</p>
                  )}
                </div>
              </div>

              {order.status === 'ready_for_pickup' && order.pickup_details && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-900">
                  <p className="font-bold mb-1">Pickup details from the farmer</p>
                  <p className="whitespace-pre-wrap">{order.pickup_details}</p>
                </div>
              )}

            </div>
          );
        })}
      </div>
    </div>
  );
}
