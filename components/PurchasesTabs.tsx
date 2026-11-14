import Link from 'next/link';
import { Receipt, Package } from 'lucide-react';

// My Purchases has two tabs: one-off orders (/orders) and Farm Box
// subscriptions (/account/csa). The Farm Box address stays as it was, so the
// links in emails already sent keep working.
export default function PurchasesTabs({ active }: { active: 'orders' | 'boxes' }) {
  const tab = (on: boolean) =>
    `flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
      on ? 'bg-white text-emerald-800 shadow-sm' : 'text-gray-600 hover:text-gray-900'
    }`;
  return (
    <nav aria-label="My Purchases" className="flex gap-1 p-1 bg-gray-100 rounded-xl w-full sm:w-fit">
      <Link href="/orders" aria-current={active === 'orders' ? 'page' : undefined} className={tab(active === 'orders')}>
        <Receipt className="w-4 h-4" aria-hidden="true" /> Orders
      </Link>
      <Link href="/account/csa" aria-current={active === 'boxes' ? 'page' : undefined} className={tab(active === 'boxes')}>
        <Package className="w-4 h-4" aria-hidden="true" /> Farm Boxes
      </Link>
    </nav>
  );
}
