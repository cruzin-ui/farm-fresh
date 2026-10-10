'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { CircleUser, ChevronDown, Receipt, LayoutDashboard, LogOut, LogIn, Mail, Sprout, Heart, UserCog } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { safeNextPath, AFTER_LOGIN_KEY } from '@/lib/safeRedirect';
import { postWithAuth } from '@/lib/authedFetch';
import { onAccountChange, PROFILE_PHOTO_KEY } from '@/lib/accountEvents';

// How often the badge checks for new orders and messages while a page is open.
const SUMMARY_REFRESH_MS = 2 * 60 * 1000;

type AccountSummary = {
  isSeller: boolean;
  farmPhotoUrl: string | null;
  ordersToReview: number;
  // Unopened messages: from buyers (to this user as a seller) and from
  // farmers (to this user as a buyer).
  unreadFromBuyers: number;
  unreadFromSellers: number;
};

// The account control in the top header, shown on every screen size. Signed
// out, it's a "Sign In" button; signed in, a "My Account" menu with links to
// the buyer and seller dashboards and a sign-out button. The button shows the
// user's profile picture, with a small numbered badge when something is
// waiting: for a seller, orders to mark ready and unopened messages from
// buyers; for a buyer, unopened messages from farmers.
export default function AccountMenu() {
  const router = useRouter();
  const pathname = usePathname();
  const menuRef = useRef<HTMLDivElement>(null);

  const [email, setEmail] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [summary, setSummary] = useState<AccountSummary | null>(null);
  const [checked, setChecked] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setEmail(session?.user.email ?? null);
      setPhotoUrl((session?.user.user_metadata?.[PROFILE_PHOTO_KEY] as string) || null);
      setChecked(true);
    });

    // Keeps the header in step when the user signs in or out on any page.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user.email ?? null);
      // Also fires when the picture is changed on the My Account page.
      setPhotoUrl((session?.user.user_metadata?.[PROFILE_PHOTO_KEY] as string) || null);
      setChecked(true);

      // A Google sign-in normally returns through /auth/callback, which sends
      // the person on to where they were going. If it lands on another page
      // with the sign-in code still in the address, they have just been signed
      // in here instead — so finish the trip to the page they asked for.
      const landedWithCode =
        new URLSearchParams(window.location.search).has('code') &&
        window.location.pathname !== '/auth/callback';

      if (session && landedWithCode) {
        let destination = '';
        try {
          destination = window.sessionStorage.getItem(AFTER_LOGIN_KEY) || '';
          window.sessionStorage.removeItem(AFTER_LOGIN_KEY);
        } catch {}
        router.replace(safeNextPath(destination, window.location.pathname));
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // What a seller has waiting. Looked up when they sign in, on each page they
  // open, every couple of minutes, and whenever another part of the page says
  // it has changed (a message thread opened, an order marked ready).
  useEffect(() => {
    if (!email) {
      setSummary(null);
      return;
    }

    let cancelled = false;
    const load = async () => {
      try {
        const res = await postWithAuth('/api/account/summary');
        const data = await res.json();
        if (!cancelled && res.ok) setSummary(data);
      } catch {}
    };

    load();
    const timer = setInterval(load, SUMMARY_REFRESH_MS);
    const stopListening = onAccountChange(load);

    return () => {
      cancelled = true;
      clearInterval(timer);
      stopListening();
    };
  }, [email, pathname]);

  // Close the menu when navigating, clicking elsewhere, or pressing Escape.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;

    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const handleSignOut = async () => {
    setOpen(false);
    await supabase.auth.signOut();
    router.push('/browse');
    router.refresh();
  };

  // Reserve the space until we know whether someone is signed in, so the
  // header doesn't jump.
  if (!checked) {
    return <div className="w-24 h-10" aria-hidden="true" />;
  }

  if (!email) {
    // Someone in the middle of shopping comes back to the page they were on.
    // From anywhere else, signing in sends sellers to their dashboard and
    // everyone else to Browse (see /signed-in).
    const midShopping = ['/checkout', '/listings/', '/sellers/'].some((start) => (pathname || '').startsWith(start));
    const redirect = midShopping ? `?redirect=${encodeURIComponent(pathname!)}` : '';

    return (
      <div className="flex items-center gap-3">
        {/* Signed-out visitors have no account menu, so this is their way to
            the seller side. Desktop only — phones have "Sell" in the tab bar. */}
        <Link
          href="/dashboard"
          className="hidden md:flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold text-gray-600 hover:bg-emerald-50 hover:text-emerald-800 transition-colors"
        >
          <Sprout className="w-4 h-4" /> Sell
        </Link>
        <Link
          href={`/login${redirect}`}
          className="flex items-center gap-2 px-3.5 h-10 rounded-xl text-xs font-bold text-emerald-700 border border-emerald-200 hover:bg-emerald-50 transition-colors"
        >
          <LogIn className="w-4 h-4" /> Sign In
        </Link>
      </div>
    );
  }

  // The user's own picture if they set one; otherwise, for a seller, their farm's.
  const picture = photoUrl || summary?.farmPhotoUrl || null;
  const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

  // Waiting for this user as a seller…
  const ordersToReview = summary?.ordersToReview || 0;
  const unreadFromBuyers = summary?.unreadFromBuyers || 0;
  const sellerWaiting = ordersToReview + unreadFromBuyers;
  const sellerWaitingText = [
    ordersToReview > 0 ? `${plural(ordersToReview, 'order')} to mark ready` : '',
    unreadFromBuyers > 0 ? `${plural(unreadFromBuyers, 'new message')} from buyers` : '',
  ]
    .filter(Boolean)
    .join(', ');

  // …and as a buyer.
  const buyerWaiting = summary?.unreadFromSellers || 0;
  const buyerWaitingText = buyerWaiting > 0 ? `${plural(buyerWaiting, 'new message')} from farmers` : '';

  const waiting = sellerWaiting + buyerWaiting;
  const waitingText = [buyerWaitingText, sellerWaitingText].filter(Boolean).join(', ');

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-1.5 px-2.5 h-10 rounded-xl text-xs font-bold text-gray-700 border border-gray-200 hover:bg-gray-50 transition-colors"
      >
        <span className="relative shrink-0">
          {picture ? (
            <img src={picture} alt="" className="w-7 h-7 rounded-full object-cover border border-emerald-200" />
          ) : (
            <CircleUser className="w-6 h-6 text-emerald-600" aria-hidden="true" />
          )}
          {waiting > 0 && (
            <span
              aria-hidden="true"
              className="absolute -top-1.5 -right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold leading-none flex items-center justify-center border-2 border-white"
            >
              {waiting > 99 ? '99+' : waiting}
            </span>
          )}
        </span>
        <span className="sr-only sm:not-sr-only">My Account</span>
        {waiting > 0 && <span className="sr-only">, {waitingText}</span>}
        <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-60 bg-white border border-gray-200 rounded-2xl shadow-lg p-2 z-50"
        >
          <p className="px-3 py-2 text-[11px] text-gray-400 truncate border-b border-gray-100 mb-1">
            Signed in as <span className="font-semibold text-gray-600">{email}</span>
          </p>
          <Link
            href="/orders"
            role="menuitem"
            className="flex items-center gap-2.5 px-3 py-3 rounded-xl text-sm font-semibold text-gray-700 hover:bg-emerald-50 hover:text-emerald-800"
          >
            <Receipt className="w-4 h-4" />
            <span className="flex-1">My Orders</span>
            {buyerWaiting > 0 && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-800" title={buyerWaitingText}>
                {buyerWaiting}
              </span>
            )}
          </Link>
          {buyerWaiting > 0 && <p className="px-3 pb-1 -mt-1 text-[11px] text-gray-500">{buyerWaitingText}</p>}
          <Link
            href="/following"
            role="menuitem"
            className="flex items-center gap-2.5 px-3 py-3 rounded-xl text-sm font-semibold text-gray-700 hover:bg-emerald-50 hover:text-emerald-800"
          >
            <Heart className="w-4 h-4" /> Followed Farms
          </Link>
          <Link
            href="/dashboard"
            role="menuitem"
            className="flex items-center gap-2.5 px-3 py-3 rounded-xl text-sm font-semibold text-gray-700 hover:bg-emerald-50 hover:text-emerald-800"
          >
            <LayoutDashboard className="w-4 h-4" />
            <span className="flex-1">Seller Dashboard</span>
            {sellerWaiting > 0 && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-800" title={sellerWaitingText}>
                {sellerWaiting}
              </span>
            )}
          </Link>
          {sellerWaiting > 0 && <p className="px-3 pb-1 -mt-1 text-[11px] text-gray-500">{sellerWaitingText}</p>}
          <Link
            href="/account"
            role="menuitem"
            className="flex items-center gap-2.5 px-3 py-3 rounded-xl text-sm font-semibold text-gray-700 hover:bg-emerald-50 hover:text-emerald-800"
          >
            <UserCog className="w-4 h-4" /> Profile Picture
          </Link>
          <Link
            href="/contact"
            role="menuitem"
            className="flex items-center gap-2.5 px-3 py-3 rounded-xl text-sm font-semibold text-gray-700 hover:bg-emerald-50 hover:text-emerald-800"
          >
            <Mail className="w-4 h-4" /> Contact Us
          </Link>
          <button
            onClick={handleSignOut}
            role="menuitem"
            className="w-full flex items-center gap-2.5 px-3 py-3 rounded-xl text-sm font-semibold text-gray-600 hover:bg-red-50 hover:text-red-600 border-t border-gray-100 mt-1"
          >
            <LogOut className="w-4 h-4" /> Sign Out
          </button>
        </div>
      )}
    </div>
  );
}
