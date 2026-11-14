'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, Share2, Mail, MessageSquare, MessageCircle, House, Link2, Smartphone } from 'lucide-react';
import { isNativeApp } from '@/lib/nativeApp';
import { shareLink } from '@/lib/share';
import { buildFarmStoryImage } from '@/lib/storyImage';

// "Share my farm page": a small menu of places to post the farm's page —
// an Instagram Story, Facebook, X, WhatsApp, Nextdoor, email, a text
// message — plus copying the link and the phone's own share sheet where
// there is one.
//
// Instagram can't be handed a link, so for a Story we make a picture of the
// farm (lib/storyImage) and hand that over instead, with the link copied for
// Instagram's link sticker.
export default function ShareFarmMenu({ farmName, path, sellerId }: { farmName: string; path: string; sellerId: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  // The Story picture: made when the menu opens, so it's ready by the time
  // the button is tapped (a share has to start straight from the tap).
  const [story, setStory] = useState<{ state: 'idle' | 'making' | 'ready' | 'failed'; file?: File }>({ state: 'idle' });
  const [storyNote, setStoryNote] = useState('');
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
    if (!open || story.state !== 'idle') return;
    setStory({ state: 'making' });
    buildFarmStoryImage(sellerId)
      .then((file) => setStory({ state: 'ready', file }))
      .catch(() => setStory({ state: 'failed' }));
  }, [open, story.state, sellerId]);

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
        <div role="menu" className="absolute left-0 mt-2 z-30 w-64 bg-white border border-gray-200 rounded-xl shadow-lg p-1.5">
          <button
            type="button"
            role="menuitem"
            disabled={story.state === 'making'}
            onClick={() => {
              if (story.state === 'failed') {
                setStory({ state: 'idle' });
                return;
              }
              const file = story.file;
              if (!file) return;
              // The link, for Instagram's link sticker. Started, not waited
              // on, so the share below still counts as coming from the tap.
              navigator.clipboard?.writeText(url()).catch(() => {});
              if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
                navigator
                  .share({ files: [file] })
                  .then(() => setStoryNote('Link copied. In Instagram, add a link sticker and paste it.'))
                  .catch(() => {});
                setStoryNote('Choose Instagram, then Story. Your link is copied for the link sticker.');
              } else {
                // A computer, or a browser that can't share pictures: save it.
                const a = document.createElement('a');
                a.href = URL.createObjectURL(file);
                a.download = file.name;
                a.click();
                setTimeout(() => URL.revokeObjectURL(a.href), 10000);
                setStoryNote('Picture saved. Post it as a Story from Instagram on your phone, then add a link sticker.');
              }
            }}
            className={`${item} disabled:opacity-60`}
          >
            <span className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 bg-gradient-to-tr from-[#F58529] via-[#DD2A7B] to-[#8134AF]">
              <Camera className="w-3.5 h-3.5 text-white" aria-hidden="true" />
            </span>
            <span className="flex-1">
              Instagram Story
              <span aria-live="polite" className="block text-[11px] font-normal text-gray-500">
                {story.state === 'making'
                  ? 'Making your picture…'
                  : story.state === 'failed'
                    ? "Couldn't make the picture. Tap to try again."
                    : storyNote || 'A picture of your farm and what you have'}
              </span>
            </span>
          </button>
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
