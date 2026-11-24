import Link from 'next/link';
import { ShieldAlert, ChevronDown } from 'lucide-react';
import { HOW_PICKUP_WORKS, SAFETY_TIPS } from '@/lib/buyerGuidance';

// Shown to buyers at checkout, below the pay button: the one safety rule that
// matters most, with how pickup works and the other tips a tap away.
export default function BuyerGuidance() {
  return (
    <section className="bg-white border rounded-xl shadow-sm text-sm">
      <p className="flex items-start gap-2 p-4 text-gray-800">
        <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
        <span className="font-semibold">{SAFETY_TIPS[0]}</span>
      </p>
      <details className="group border-t">
        <summary className="flex items-center justify-between gap-2 px-4 py-3 cursor-pointer font-semibold text-emerald-800 list-none [&::-webkit-details-marker]:hidden">
          How pickup works and staying safe
          <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="px-4 pb-4 space-y-3 text-gray-700">
          <ol className="list-decimal pl-5 space-y-1.5">
            {HOW_PICKUP_WORKS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <ul className="list-disc pl-5 space-y-1.5">
            {SAFETY_TIPS.slice(1).map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
          <p>
            Questions or concerns?{' '}
            <Link href="/contact" className="font-semibold text-emerald-800 underline">
              Contact us
            </Link>
            .
          </p>
        </div>
      </details>
    </section>
  );
}
