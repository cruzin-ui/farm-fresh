import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';

// The cards and boxes the "Why" pages for buyers and for sellers are built from.

// `wide` cards span the whole row, to stand out.
export type Reason = { icon: LucideIcon; title: string; body: string; wide?: boolean };

export function Reasons({ items }: { items: Reason[] }) {
  return (
    <ul className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
      {items.map(({ icon: Icon, title, body, wide }) => (
        <li
          key={title}
          className={`rounded-2xl p-5 shadow-sm border ${
            wide ? 'sm:col-span-2 bg-emerald-50 border-emerald-200' : 'bg-white border-gray-200'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 shrink-0 bg-emerald-100 text-emerald-700 rounded-xl flex items-center justify-center">
              <Icon className="w-5 h-5" aria-hidden="true" />
            </div>
            <h3 className="text-base font-bold text-gray-900">{title}</h3>
          </div>
          <p className="mt-3 text-sm text-gray-600 leading-relaxed">{body}</p>
        </li>
      ))}
    </ul>
  );
}

// A titled box of plain points, for the details (costs, payouts, refunds).
export function DetailBox({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mt-10 bg-white border border-gray-200 rounded-2xl p-6 sm:p-8 shadow-sm" aria-labelledby={id ? `${id}-title` : undefined}>
      <h2 id={id ? `${id}-title` : undefined} className="text-xl font-bold text-gray-900">
        {title}
      </h2>
      <div className="mt-4 text-sm text-gray-700 leading-relaxed space-y-3">{children}</div>
    </section>
  );
}

// "Looking to sell instead?" — the link across to the other page.
export function OtherSide({ href, text }: { href: string; text: string }) {
  return (
    <p className="mt-10 text-center text-sm text-gray-600">
      <Link href={href} className="font-semibold text-emerald-800 underline underline-offset-2">
        {text}
      </Link>
    </p>
  );
}
