'use client';

import { useEffect, useRef, useState } from 'react';
import { Share2, Mail, MessageSquare, MessageCircle, House, Link2, Smartphone } from 'lucide-react';
import { isNativeApp } from '@/lib/nativeApp';
import { shareLink } from '@/lib/share';

// "Share my farm page": a small menu of places to post the farm's page —
// Facebook, X, WhatsApp, Nextdoor, email, a text message — plus copying the
// link (for Instagram, which can't be posted to from a link) and the phone's
// own share sheet where there is one.
export default function ShareFarmMenu({ farmName, path }: { farmName: string; path: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [canShareSheet, setCanShareSheet] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Known only in the browser, so checked after the page loads.
    // (the same test lib/share uses before it opens the share sheet)
    setCanShareSheet(
      isNativeApp() || (typeof navigator.share === 'function' && window.matchMedia('(pointer: coarse)').matches)
    );
  }, []);

  useEffect(() => {
    if (!open) return;
    const click = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', click);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', click);
      document.removeEventListener('keydown', key);
    };
  }, [open]);

  const name = farmName || 'My farm';
  const url = () => new URL(path, window.location.origin).href;
  const message = `Fresh from ${name}: order ahead and pick up locally on Farm Fresh Direct.`;
  const enc = encodeURIComponent;

  const links: { label: string; badge: React.ReactNode; href: () => string }[] = [
    {
      label: 'Facebook',
      badge: <span className="font-black text-white text-sm leading-none">f</span>,
      href: () => `https://www.facebook.com/sharer/sharer.php?u=${enc(url())}`,
    },
    {
      label: 'X',
      badge: <span className="font-black text-white text-xs leading-none">X</span>,
      href: () => `https://x.com/intent/tweet?text=${enc(message)}&url=${enc(url())}`,
    },
    {
      label: 'WhatsApp',
      badge: <MessageCircle className="w-3.5 h-3.5 text-white" aria-hidden="true" />,
      href: () => `https://wa.me/?text=${enc(`${message} ${url()}`)}`,
    },
    {
      label: 'Nextdoor',
      badge: <House className="w-3.5 h-3.5 text-white" aria-hidden="true" />,
      href: () => `https://nextdoor.com/sharekit/?source=farmfreshdirect&body=${enc(`${message} ${url()}`)}`,
    },
    {
      label: 'Email',
      badge: <Mail className="w-3.5 h-3.5 text-white" aria-hidden="true" />,
      href: () => `mailto:?subject=${enc(`${name} on Farm Fresh Direct`)}&body=${enc(`${message}\n\n${url()}`)}`,
    },
    {
      label: 'Text message',
      badge: <MessageSquare className="w-3.5 h-3.5 text-white" aria-hidden="true" />,
      href: () => `sms:?&body=${enc(`${message} ${url()}`)}`,
    },
  ];
  const BADGE_COLOR: Record<string, string> = {
    Facebook: 'bg-[#1877F2]',
    X: 'bg-black',
    WhatsApp: 'bg-[#25D366]',
    Nextdoor: 'bg-[#8ED500]',
    Email: 'bg-gray-500',
    'Text message': 'bg-emerald-600',
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url());
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      window.open(path, '_blank');
    }
  };

  const item = 'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-semibold text-gray-700 hover:bg-emerald-50 text-left';

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="inline-flex items-center gap-1.5 font-semibold text-gray-700 border border-gray-300 rounded-lg px-2 py-1 hover:bg-gray-50"
      >
        <Share2 className="w-3.5 h-3.5" aria-hidden="true" /> Share my farm page
      </button>
      {open && (
        <div role="menu" className="absolute left-0 mt-2 z-30 w-60 bg-white border border-gray-200 rounded-xl shadow-lg p-1.5">
          {links.map((l) => (
            <a
              key={l.label}
              role="menuitem"
              href="#"
              onClick={(e) => {
                e.preventDefault();
                const href = l.href();
                // Email and text open the phone's or computer's own app; the
                // rest open the site in a new tab.
                if (href.startsWith('mailto:') || href.startsWith('sms:')) window.location.href = href;
                else window.open(href, '_blank', 'noopener,noreferrer');
                setOpen(false);
              }}
              className={item}
            >
              <span className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${BADGE_COLOR[l.label]}`}>{l.badge}</span>
              {l.label}
            </a>
          ))}
          <div className="my-1 border-t border-gray-100" />
          <button type="button" role="menuitem" onClick={copy} className={item}>
            <span className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 bg-gray-100">
              <Link2 className="w-3.5 h-3.5 text-gray-700" aria-hidden="true" />
            </span>
            <span aria-live="polite">{copied ? 'Link copied' : 'Copy link'}</span>
          </button>
          <p className="px-3 pb-1 text-[11px] text-gray-500">For Instagram, copy the link and add it to your bio or story.</p>
          {canShareSheet && (
            <button
              type="button"
              role="menuitem"
              onClick={async () => {
                setOpen(false);
                await shareLink({ title: name, text: message, url: path });
              }}
              className={item}
            >
              <span className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 bg-gray-100">
                <Smartphone className="w-3.5 h-3.5 text-gray-700" aria-hidden="true" />
              </span>
              More options…
            </button>
          )}
        </div>
      )}
    </div>
  );
}
