'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

// Tells the server each time a page is opened, so the admin page can show how
// much the site is being used. Only the kind of page is counted (see
// lib/pageGroups.ts), as a daily total; nothing identifies the visitor. The
// first page of a browser session is also counted as one visit. Arriving from
// a printed QR code (?src=, see lib/scanSources.ts) is counted as a scan, and
// the tag is then taken out of the address so a shared link isn't counted again.
export default function PageViewCounter() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;

    let newVisit = false;
    try {
      newVisit = !sessionStorage.getItem('ffd-visit-counted');
      if (newVisit) sessionStorage.setItem('ffd-visit-counted', '1');
    } catch {}

    let src: string | null = null;
    try {
      const url = new URL(window.location.href);
      src = url.searchParams.get('src');
      if (src) {
        url.searchParams.delete('src');
        window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
      }
    } catch {}

    fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'page_view', path: pathname, newVisit, ...(src ? { src } : {}) }),
      keepalive: true,
    }).catch(() => {});
  }, [pathname]);

  return null;
}
