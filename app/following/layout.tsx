import type { Metadata } from 'next';

// The page itself is a client component, which can't set its own browser
// title, so this layout does it.
export const metadata: Metadata = { title: 'Followed Farms' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
