'use client';

import { useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard } from 'lucide-react';
import { getSellerStatus, getServerSellerStatus, subscribeSellerStatus } from '@/lib/sellerStatus';

// A header link to the Seller Dashboard on wider screens, shown only to a
// signed-in seller. (On phones the bottom tab bar has it already.)
export default function SellerDashboardLink() {
  const isSeller = useSyncExternalStore(subscribeSellerStatus, getSellerStatus, getServerSellerStatus);
  const pathname = usePathname();
  if (!isSeller) return null;
  const active = pathname === '/dashboard' || pathname.startsWith('/dashboard/');
  return (
    <Link
      href="/dashboard"
      aria-current={active ? 'page' : undefined}
      className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors ${
        active ? 'bg-emerald-50 text-emerald-800' : 'text-gray-600 hover:bg-emerald-50 hover:text-emerald-800'
      }`}
    >
      <LayoutDashboard className="w-4 h-4" aria-hidden="true" /> Seller Dashboard
    </Link>
  );
}
