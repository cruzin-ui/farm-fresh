import Link from 'next/link';
import { ShieldAlert, ListChecks } from 'lucide-react';
import { HOW_PICKUP_WORKS, SAFETY_TIPS } from '@/lib/buyerGuidance';

// Shown to buyers at checkout: how pickup works, and how to stay safe.
export default function BuyerGuidance() {
  return (
    <div className="space-y-4">
      <section className="bg-white border rounded-xl p-4 shadow-sm">
        <h2 className="font-bold text-gray-900 text-sm flex items-center gap-2 mb-2">
          <ListChecks className="w-5 h-5 text-emerald-700" aria-hidden="true" /> How pickup works
        </h2>
        <ol className="list-decimal pl-5 space-y-1.5 text-sm text-gray-700">
          {HOW_PICKUP_WORKS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>

      <section className="bg-amber-50 border border-amber-300 rounded-xl p-4">
        <h2 className="font-bold text-amber-950 text-sm flex items-center gap-2 mb-2">
          <ShieldAlert className="w-5 h-5 text-amber-700" aria-hidden="true" /> Staying safe
        </h2>
        <ul className="list-disc pl-5 space-y-1.5 text-sm text-amber-950">
          {SAFETY_TIPS.map((tip, index) => (
            <li key={tip} className={index === 0 ? 'font-semibold' : ''}>
              {tip}
            </li>
          ))}
        </ul>
        <p className="text-sm text-amber-950 mt-2">
          Questions or concerns?{' '}
          <Link href="/contact" className="font-semibold underline">
            Contact us
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
