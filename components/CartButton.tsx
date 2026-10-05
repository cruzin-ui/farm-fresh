'use client';

import Link from 'next/link';
import { ShoppingCart } from 'lucide-react';
import { useCart } from '@/lib/cart';

// The cart link in the top header, with a badge showing how many items are in it.
export default function CartButton() {
  const { count } = useCart();

  return (
    <Link
      href="/checkout"
      aria-label={count > 0 ? `Cart, ${count} item${count === 1 ? '' : 's'}` : 'Cart, empty'}
      className="relative flex items-center gap-2 px-3 h-10 rounded-xl text-xs font-semibold text-gray-600 hover:bg-emerald-50 hover:text-emerald-800 transition-colors"
    >
      <ShoppingCart className="w-5 h-5" aria-hidden="true" />
      <span className="hidden sm:inline">Cart</span>
      {count > 0 && (
        <span className="absolute -top-1 left-6 min-w-5 h-5 px-1 rounded-full bg-emerald-700 text-white text-[11px] font-bold flex items-center justify-center">
          {count}
        </span>
      )}
    </Link>
  );
}
