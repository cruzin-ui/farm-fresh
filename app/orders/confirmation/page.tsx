'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, Printer, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import PickupGroupCard from '@/components/PickupGroupCard';
import { describeBuyerOrders } from '@/lib/buyerOrders';
import { groupOrdersForPickup, isOpenStatus, type BuyerOrder } from '@/lib/pickupGroups';

// The receipt for a checkout. The link names one order; everything bought in
// the same checkout is shown with it, grouped by farm, each farm with its own
// pickup code.
function ConfirmationContent() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get('orderId');
  // Present for guest orders: stands in for being signed in.
  const guestToken = searchParams.get('token');

  const [orders, setOrders] = useState<BuyerOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchOrders() {
      if (!orderId) {
        setLoading(false);
        return;
      }
      try {
        if (guestToken) {
          const res = await fetch('/api/orders/guest-view', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderId, token: guestToken }),
          });
          const guestData = await res.json();
          if (!res.ok) throw new Error(guestData.error || 'Order not found.');
          setOrders(guestData.orders);
          return;
        }

        const { data: order, error } = await supabase.from('orders').select('*').eq('id', orderId).single();
        if (error) throw error;

        let rows = [order];
        if (order.checkout_id) {
          const { data: siblings } = await supabase
            .from('orders')
            .select('*')
            .eq('checkout_id', order.checkout_id)
            .order('created_at', { ascending: true });
          if (siblings?.length) rows = siblings;
        }

        setOrders(await describeBuyerOrders(rows));
      } catch (err) {
        console.error('Error fetching order:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchOrders();
  }, [orderId, guestToken]);

  if (loading) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center space-y-3">
        <div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-sm font-medium text-gray-600">Loading order receipt...</p>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="max-w-md mx-auto my-12 p-6 bg-white border rounded-2xl text-center space-y-4 shadow-sm text-sm text-gray-600">
        <p>
          We couldn't find that order. If you bought as a guest, use the link in your confirmation email; otherwise
          sign in to see your orders.
        </p>
        <Link
          href="/orders"
          className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white font-semibold rounded-xl text-sm"
        >
          My Orders
        </Link>
      </div>
    );
  }

  const groups = groupOrdersForPickup(orders);
  const anyOpen = orders.some((o) => isOpenStatus(o.status));
  const anyReady = orders.some((o) => o.status === 'ready_for_pickup');
  const allCancelled = orders.every((o) => o.status === 'cancelled');
  const totalPaid = orders.reduce((sum, o) => sum + o.total_price, 0);
  const refunded = orders.reduce((sum, o) => sum + o.refunded_amount, 0);

  const heading = allCancelled
    ? 'Order Cancelled'
    : !anyOpen
      ? 'Order Picked Up'
      : anyReady
        ? 'Ready for Pickup!'
        : 'Payment Successful & Reserved!';

  const summary = allCancelled
    ? refunded > 0
      ? `This order was cancelled and $${refunded.toFixed(2)} was refunded to your payment method.`
      : 'This order was cancelled.'
    : !anyOpen
      ? 'This order has been collected. Thank you for buying local!'
      : anyReady
        ? 'A farmer has your order ready — pickup details are below.'
        : 'Your produce is fully pre-paid and locked in with the grower.';

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div role="status" className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-center space-y-2">
        <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" aria-hidden="true" />
        <h1 className="text-2xl font-extrabold text-emerald-950">{heading}</h1>
        <p className="text-sm text-emerald-800">{summary}</p>
        {anyOpen && groups.length > 1 && (
          <p className="text-sm font-semibold text-emerald-950">
            You bought from {groups.length} farms. Each one has its own pickup code below.
          </p>
        )}
      </div>

      {groups.map((group) => (
        <PickupGroupCard key={group.key} group={group} token={guestToken} />
      ))}

      {guestToken && anyOpen && (
        <p className="text-xs text-gray-500 text-center">
          You checked out as a guest. We've emailed you a link to this page — keep that email or bookmark this
          page to get back to your order and pickup {groups.length > 1 ? 'codes' : 'code'}.
        </p>
      )}

      <div className="bg-white border rounded-2xl p-5 shadow-sm space-y-3 text-sm">
        <h2 className="font-bold text-gray-900 border-b pb-2 flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-emerald-600" aria-hidden="true" /> Payment & Status Summary
        </h2>

        <div className="flex justify-between items-center bg-emerald-50 text-emerald-950 font-bold px-3 py-2.5 rounded-xl">
          <span>Total Paid Online:</span>
          <span className="text-lg">${totalPaid.toFixed(2)}</span>
        </div>

        {refunded > 0 && (
          <div className="flex justify-between items-center bg-gray-50 border text-gray-700 px-3 py-2 rounded-xl font-semibold">
            <span>Refunded:</span>
            <span>${refunded.toFixed(2)}</span>
          </div>
        )}

        <div className="flex justify-between items-center bg-gray-50 border text-gray-700 px-3 py-2 rounded-xl font-semibold">
          <span>Balance Due at Farm Stand Pickup:</span>
          <span className="text-emerald-700">$0.00 (Fully Pre-Paid)</span>
        </div>
      </div>

      <div className="flex gap-3 print:hidden">
        <button
          onClick={() => window.print()}
          className="flex-1 py-3 border bg-white hover:bg-gray-50 text-gray-700 font-semibold rounded-xl text-sm flex items-center justify-center gap-2 shadow-sm"
        >
          <Printer className="w-4 h-4 text-gray-500" aria-hidden="true" /> Print Receipt
        </button>
        <Link
          href={guestToken ? '/browse' : '/orders'}
          className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 text-center shadow-md"
        >
          {guestToken ? 'Back to Marketplace' : 'View My Orders'}
        </Link>
      </div>
    </div>
  );
}

export default function OrderConfirmationPage() {
  return (
    <Suspense fallback={
      <div className="min-h-[50vh] flex flex-col items-center justify-center space-y-3">
        <div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-sm font-medium text-gray-600">Loading order receipt...</p>
      </div>
    }>
      <ConfirmationContent />
    </Suspense>
  );
}
