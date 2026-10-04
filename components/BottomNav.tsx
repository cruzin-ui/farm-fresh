'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ShoppingBag, Receipt, LayoutDashboard } from 'lucide-react';

const TABS = [
  { href: '/browse', label: 'Browse', icon: ShoppingBag, match: ['/browse', '/listings', '/sellers', '/checkout'] },
  { href: '/orders', label: 'My Orders', icon: Receipt, match: ['/orders'] },
  { href: '/dashboard', label: 'Sell', icon: LayoutDashboard, match: ['/dashboard', '/sell'] },
];

// Phone-only tab bar fixed to the bottom of the screen, within thumb reach.
// On larger screens the links in the top header are used instead.
export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className="md:hidden print:hidden fixed bottom-0 inset-x-0 z-50 bg-white/95 backdrop-blur-md border-t border-emerald-100 shadow-[0_-2px_8px_rgba(0,0,0,0.04)] pb-[env(safe-area-inset-bottom)]"
    >
      <div className="grid grid-cols-3">
        {TABS.map(({ href, label, icon: Icon, match }) => {
          const active = match.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`flex flex-col items-center justify-center gap-0.5 h-14 text-[11px] font-semibold transition-colors ${
                active ? 'text-emerald-700' : 'text-gray-500'
              }`}
            >
              <Icon className={`w-5 h-5 ${active ? 'stroke-[2.5]' : ''}`} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
