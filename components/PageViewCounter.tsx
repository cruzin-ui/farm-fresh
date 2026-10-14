'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

// Tells the server each time a page is opened, so the admin page can show how
// much the site is being used. Only the kind of page is counted (see
// lib/pageGroups.ts), as a daily total; nothing identifies the visitor. The
// first page of a browser session is also counted as one visit.
export default function PageViewCounter() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;

    let newVisit = false;
    try {
      newVisit = !sessionStorage.getItem('ffd-visit-counted');
      if (newVisit) sessionStorage.setItem('ffd-visit-counted', '1');
    } catch {}

    fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'page_view', path: pathname, newVisit }),
      keepalive: true,
    }).catch(() => {});
  }, [pathname]);

  return null;
}
