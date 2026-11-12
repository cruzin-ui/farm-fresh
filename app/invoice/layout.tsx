import type { Metadata } from 'next';

// Invoices are private to the farm and buyer, so they're kept out of search.
export const metadata: Metadata = {
  title: 'Invoice',
  robots: { index: false, follow: false },
};

export default function InvoiceLayout({ children }: { children: React.ReactNode }) {
  return children;
}
