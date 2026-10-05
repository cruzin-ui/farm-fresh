'use client';

import { useState } from 'react';
import { ShoppingCart, Check } from 'lucide-react';
import { addToCart, useCart } from '@/lib/cart';

// The "Add to Cart" button on a listing card. Each click adds one unit, up to
// what the listing has available; the buyer stays on the page so they can keep
// browsing, and changes quantities in the cart.
export default function AddToCartButton({
  listingId,
  available,
  className = '',
}: {
  listingId: string;
  available: number;
  className?: string;
}) {
  const { items } = useCart();
  const [cartFull, setCartFull] = useState(false);

  const inCart = items.find((item) => item.listingId === listingId)?.quantity || 0;
  const atLimit = inCart >= Math.floor(available);

  return (
    <button
      type="button"
      disabled={atLimit}
      onClick={() => setCartFull(!addToCart(listingId, 1))}
      className={`inline-flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 disabled:text-gray-600 text-white text-xs font-bold px-4 py-3 md:py-2.5 rounded-xl shadow-sm transition-colors ${className}`}
    >
      {inCart > 0 ? (
        <Check className="w-3.5 h-3.5" aria-hidden="true" />
      ) : (
        <ShoppingCart className="w-3.5 h-3.5" aria-hidden="true" />
      )}
      <span aria-live="polite">
        {cartFull
          ? 'Cart is full'
          : atLimit && inCart > 0
            ? `All ${inCart} in cart`
            : inCart > 0
              ? `In cart (${inCart}) · Add another`
              : 'Add to Cart'}
      </span>
    </button>
  );
}
