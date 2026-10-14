// Which part of the site a web address belongs to, for counting visits. Safe
// to import anywhere.
//
// Visits are counted per kind of page, not per address: every listing counts
// as "A listing", every farm's page as "A farm's page". That keeps the counts
// short enough to read, and means nothing about which listing or farm someone
// looked at is recorded.

export const PAGE_GROUPS: Record<string, string> = {
  home: 'Home page',
  browse: 'Browse',
  listing: 'A listing',
  farm: "A farm's page",
  checkout: 'Checkout',
  purchases: 'My Purchases and order pages',
  dashboard: 'Seller dashboard',
  why: 'Why Use Us',
  faq: 'FAQ',
  about: 'About',
  contact: 'Contact Us',
  login: 'Sign in',
  following: 'Favorite Farms',
  legal: 'Terms and privacy pages',
  other: 'Other pages',
};

const TOP_LEVEL: Record<string, string> = {
  browse: 'browse',
  listings: 'listing',
  sellers: 'farm',
  checkout: 'checkout',
  orders: 'purchases',
  dashboard: 'dashboard',
  sell: 'dashboard',
  why: 'why',
  faq: 'faq',
  about: 'about',
  contact: 'contact',
  login: 'login',
  auth: 'login',
  welcome: 'login',
  'signed-in': 'login',
  following: 'following',
  account: 'other',
  terms: 'legal',
  privacy: 'legal',
  'seller-terms': 'legal',
};

// Returns the group for a path, or null for one that isn't counted (the admin
// page, so that checking these numbers doesn't add to them).
export function pageGroupFor(path: string): string | null {
  const first = (path.split('?')[0].split('/')[1] || '').toLowerCase();
  if (!first) return 'home';
  if (first === 'admin' || first === 'api') return null;
  if (first in TOP_LEVEL) return TOP_LEVEL[first];
  // Any other single-part address is a farm's own web address.
  return path.split('/').filter(Boolean).length === 1 ? 'farm' : 'other';
}
