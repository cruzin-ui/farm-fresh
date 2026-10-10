'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ShoppingBag, ArrowLeft } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { postWithAuth } from '@/lib/authedFetch';
import PickupGroupCard from '@/components/PickupGroupCard';
import { CardListSkeleton } from '@/components/Skeletons';
import { describeBuyerOrders } from '@/lib/buyerOrders';
import { groupOrdersForPickup, type PickupGroup } from '@/lib/pickupGroups';

export default function MyOrdersPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<PickupGroup[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  // Orders with a message from the farmer that hasn't been opened.
  const [unreadOrderIds, setUnreadOrderIds] = useState<string[]>([]);

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

      // One card per pickup: everything bought from a farm in one checkout
      // shares a pickup code.
      setGroups(groupOrdersForPickup(await describeBuyerOrders(myOrders || [])));

      try {
        const summaryRes = await postWithAuth('/api/account/summary');
        if (summaryRes.ok) setUnreadOrderIds((await summaryRes.json()).unreadOrderIds || []);
      } catch {}

      setLoading(false);
    }

    fetchOrders();
  }, [router]);

  if (loading) {
    return <CardListSkeleton label="Loading your orders..." />;
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ShoppingBag className="w-6 h-6 text-emerald-600" /> My Orders
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Your reservations, pickup details and pickup codes. Each farm you bought from has its own code.
          </p>
        </div>
        <Link
          href="/browse"
          className="inline-flex items-center gap-2 bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-50 font-bold py-2.5 px-4 rounded-xl text-xs"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" /> Back to Browsing
        </Link>
      </div>

      {fetchError && (
        <div role="alert" className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
          Could not load your orders: {fetchError}
        </div>
      )}

      {!fetchError && groups.length === 0 && (
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
        {groups.map((group) => (
          <PickupGroupCard key={group.key} group={group} unreadOrderIds={unreadOrderIds} />
        ))}
      </div>
    </div>
  );
}
