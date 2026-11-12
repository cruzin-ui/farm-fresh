import Link from 'next/link';
import { EyeOff } from 'lucide-react';

// Shown to a farmer looking at their own farm page or listing before payouts
// are connected: they see it as buyers will, but buyers can't see it yet.
export default function PayoutsPreviewNotice({ what }: { what: string }) {
  return (
    <div
      role="status"
      className="mb-6 p-4 bg-amber-50 border-2 border-amber-400 rounded-2xl flex items-start gap-3 text-sm text-amber-950 shadow-sm"
    >
      <EyeOff className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
      <div>
        <p className="font-bold">Preview: only you can see this</p>
        <p className="mt-0.5 text-xs">
          {what} is hidden from buyers until you connect your payouts through Stripe. This is how it will look once
          you do. Until then nobody else can see it or buy anything.
        </p>
        <Link
          href="/dashboard?tab=sales"
          className="mt-2 inline-block text-xs font-bold text-amber-950 underline underline-offset-2"
        >
          Connect payouts
        </Link>
      </div>
    </div>
  );
}
