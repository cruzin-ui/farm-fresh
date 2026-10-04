'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { CircleUser, ChevronDown, Receipt, LayoutDashboard, LogOut, LogIn, Mail, Sprout } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';

// The account control in the top header, shown on every screen size. Signed
// out, it's a "Sign In" button; signed in, a "My Account" menu with links to
// the buyer and seller dashboards and a sign-out button.
export default function AccountMenu() {
  const router = useRouter();
  const pathname = usePathname();
  const menuRef = useRef<HTMLDivElement>(null);

  const [email, setEmail] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setEmail(session?.user.email ?? null);
      setChecked(true);
    });

    // Keeps the header in step when the user signs in or out on any page.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user.email ?? null);
      setChecked(true);
    });

    return () => subscription.unsubscribe();
  }, []);

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
    const redirect = pathname && pathname !== '/login' ? `?redirect=${encodeURIComponent(pathname)}` : '';

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

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-1.5 px-3 h-10 rounded-xl text-xs font-bold text-gray-700 border border-gray-200 hover:bg-gray-50 transition-colors"
      >
        <CircleUser className="w-5 h-5 text-emerald-600" />
        <span className="sr-only sm:not-sr-only">My Account</span>
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
            <Receipt className="w-4 h-4" /> My Orders
          </Link>
          <Link
            href="/dashboard"
            role="menuitem"
            className="flex items-center gap-2.5 px-3 py-3 rounded-xl text-sm font-semibold text-gray-700 hover:bg-emerald-50 hover:text-emerald-800"
          >
            <LayoutDashboard className="w-4 h-4" /> Seller Dashboard
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
