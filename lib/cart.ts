'use client';

import { useSyncExternalStore } from 'react';

// The buyer's cart. It is kept in the browser rather than in an account, so it
// works for guests too. It holds only which listings and how many — prices and
// availability are always looked up fresh at checkout.

// A `wholesale` item is bought by the case (approved businesses only), and
// its quantity is a number of cases.
export type CartItem = { listingId: string; quantity: number; wholesale?: true };

// Matches the limit the server enforces in lib/checkoutCart.ts.
export const MAX_CART_LINES = 20;

const STORAGE_KEY = 'ffd-cart';
const CHANGE_EVENT = 'ffd-cart-changed';
const EMPTY = '[]';

function readRaw() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) || EMPTY;
  } catch {
    // Storage can be blocked (private windows, strict settings).
    return EMPTY;
  }
}

function parse(raw: string): CartItem[] {
  try {
    const items = JSON.parse(raw);
    if (!Array.isArray(items)) return [];
    return items
      .filter((item) => typeof item?.listingId === 'string' && Number.isInteger(item?.quantity) && item.quantity > 0)
      .map((item) => ({ listingId: item.listingId, quantity: item.quantity, ...(item.wholesale === true ? { wholesale: true as const } : {}) }));
  } catch {
    return [];
  }
}

export function readCart(): CartItem[] {
  return typeof window === 'undefined' ? [] : parse(readRaw());
}

function writeCart(items: CartItem[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {}
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

// Adds to what is already in the cart for that listing. A listing is in the
// cart either by the case or not, so adding it the other way replaces it.
// Returns false if the cart is full.
export function addToCart(listingId: string, quantity = 1, wholesale = false) {
  const items = readCart();
  const existing = items.find((item) => item.listingId === listingId);

  if (existing && Boolean(existing.wholesale) === wholesale) {
    existing.quantity += quantity;
  } else if (existing) {
    existing.quantity = quantity;
    if (wholesale) existing.wholesale = true;
    else delete existing.wholesale;
  } else {
    if (items.length >= MAX_CART_LINES) return false;
    items.push({ listingId, quantity, ...(wholesale ? { wholesale: true as const } : {}) });
  }

  writeCart(items);
  return true;
}

export function setCartQuantity(listingId: string, quantity: number) {
  writeCart(readCart().map((item) => (item.listingId === listingId ? { ...item, quantity } : item)));
}

export function removeFromCart(listingId: string) {
  writeCart(readCart().filter((item) => item.listingId !== listingId));
}

export function clearCart() {
  writeCart([]);
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  // Fired when the cart changes in another tab.
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

// The cart as React state: re-renders whenever it changes, in this tab or
// another. `ready` is false until the browser's saved cart has been read, so
// pages can tell "empty" from "not loaded yet".
export function useCart() {
  const raw = useSyncExternalStore(subscribe, readRaw, () => null);
  const items = raw === null ? [] : parse(raw);

  return {
    items,
    ready: raw !== null,
    count: items.reduce((sum, item) => sum + item.quantity, 0),
  };
}
