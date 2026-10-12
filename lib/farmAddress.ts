// A farm's own web address: farmfreshdirect.online/<name>, chosen once by the
// seller. Safe to import anywhere: the seller dashboard uses these rules to
// check a name as it is typed, and the server enforces them.

export const FARM_ADDRESS_MIN = 3;
export const FARM_ADDRESS_MAX = 30;

// Names a farm can't take, because the site uses them or may want to.
//
// A farm's address sits at the top level of the site, beside the site's own
// pages. A real page always wins over a farm with the same name, so a farm
// that took "blog" would vanish the day a blog was added. Add to this list
// BEFORE creating a new top-level page.
export const RESERVED_FARM_ADDRESSES = new Set([
  // Pages the site has now.
  'about', 'account', 'admin', 'api', 'auth', 'browse', 'checkout', 'contact', 'dashboard', 'faq',
  'following', 'listings', 'login', 'orders', 'privacy', 'sell', 'seller-terms', 'sellers', 'signed-in',
  'terms', 'welcome', 'why',

  // Pages it may have one day.
  'app', 'apps', 'blog', 'news', 'stories', 'help', 'support', 'guide', 'guides', 'how-it-works', 'pricing',
  'fees', 'farm', 'farms', 'farmer', 'farmers', 'grower', 'growers', 'seller', 'buyer', 'buyers', 'market',
  'markets', 'marketplace', 'shop', 'store', 'stores', 'cart', 'basket', 'search', 'find', 'map', 'near-me',
  'local', 'events', 'recipes', 'seasonal', 'in-season', 'produce', 'vegetables', 'fruit', 'fruits', 'herbs',
  'eggs', 'honey', 'jam', 'gift', 'gifts', 'gift-cards', 'delivery', 'pickup', 'subscribe', 'subscriptions',
  'csa', 'wholesale', 'restaurants', 'business', 'partners', 'sponsors', 'donate', 'tips', 'press', 'media',
  'careers', 'jobs', 'team', 'mission', 'community', 'legal', 'policies', 'security', 'safety', 'trust',
  'status', 'settings', 'profile', 'favorites', 'favourites', 'messages', 'inbox', 'notifications',
  'reviews', 'insights', 'reports', 'analytics', 'signup', 'sign-up', 'signin', 'sign-in', 'logout',
  'sign-out', 'register', 'join', 'invite', 'refer', 'referrals', 'rewards', 'promo', 'promos', 'deals',
  'sale', 'new', 'home', 'index', 'start', 'welcome-back', 'unsubscribe', 'verify', 'confirm', 'reset',
  'download', 'downloads', 'mobile', 'ios', 'android',

  // Names that would mislead, or that browsers and tools ask for.
  'farmfreshdirect', 'farm-fresh-direct', 'farmfresh', 'farm-fresh', 'official', 'staff', 'moderator',
  'administrator', 'root', 'system', 'owner', 'stripe', 'www', 'mail', 'email', 'static', 'assets', 'public',
  'images', 'img', 'cdn', 'files', 'uploads', 'favicon', 'robots', 'sitemap', 'manifest', 'icon', 'null',
  'undefined', 'test', 'demo', 'example',
]);

// Tidies what someone typed into the form an address is stored in: lower case,
// spaces and underscores as hyphens, anything else that isn't a letter or a
// number dropped. "Night Owl Produce!" becomes "night-owl-produce".
export function tidyFarmAddress(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, FARM_ADDRESS_MAX);
}

// Returns why an address (already tidied) can't be used, or null if its shape
// is fine. Whether another farm already has it is checked on the server.
export function farmAddressProblem(address: string): string | null {
  if (address.length < FARM_ADDRESS_MIN) return `Use at least ${FARM_ADDRESS_MIN} letters or numbers.`;
  if (address.length > FARM_ADDRESS_MAX) return `Keep it to ${FARM_ADDRESS_MAX} characters or fewer.`;
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(address)) return 'Use only letters, numbers and hyphens.';
  if (!/[a-z]/.test(address)) return 'Include at least one letter.';
  if (RESERVED_FARM_ADDRESSES.has(address)) return "That one is kept for the site's own pages. Please choose another.";
  return null;
}
