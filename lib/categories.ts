// What can be sold on Farm Fresh Direct: locally grown produce, cultivated
// mushrooms, cut flowers and plants the seller grew, eggs and honey, plus
// cottage foods (below). Anything else — seeds, plants dug from the wild,
// foraged wild mushrooms, meat, dairy, crafts, other goods — is not allowed
// and is turned away when a listing is posted. Listings in a category that
// has since been removed are hidden from shoppers and can't be bought.
export const LISTING_CATEGORIES = [
  'Vegetables',
  'Fruits & Berries',
  'Herbs & Spices',
  'Mushrooms',
  'Honey',
  'Jams & Preserves',
  'Baked Goods',
  'Fresh Eggs',
  'Cut Flowers',
  'Plants & Seedlings',
];

export const isAllowedCategory = (category: string | null | undefined) =>
  LISTING_CATEGORIES.includes(category || '');

// Cottage foods: made in a home kitchen under Arizona's cottage food rules.
// A seller can list these once they've added their cottage food registration
// number and certificate in their Farm Profile. Checked by the listing routes
// (lib/cottageFood).
export const COTTAGE_FOOD_CATEGORIES = ['Jams & Preserves', 'Baked Goods'];
export const isCottageFood = (category: string | null | undefined) =>
  COTTAGE_FOOD_CATEGORIES.includes(category || '');

// Made to order: a listing for something the seller makes when it's ordered
// (bread, jam) rather than a harvest that runs out. It never sells out and
// stays on sale until the seller takes it down; its quantity is the most one
// order can be for. Only for things made in a kitchen, not grown.
export const MADE_TO_ORDER_CATEGORIES = COTTAGE_FOOD_CATEGORIES;
export const canMakeToOrder = (category: string | null | undefined) =>
  MADE_TO_ORDER_CATEGORIES.includes(category || '');
export const MADE_TO_ORDER_HELP =
  "Stays on sale until you take it down, and never sells out, so you don't have to post it again. Only take what you can make within the ready-by time for each order.";

// A made-to-order listing's available_quantity is either the most one
// customer can have on order at once (the seller chose a limit), or this
// number, meaning no limit.
export const MADE_TO_ORDER_UNLIMITED = 999;

// The per-customer limit of a made-to-order listing, or null for none.
export const madeToOrderLimit = (listing: { made_to_order?: boolean | null; available_quantity?: unknown }) => {
  if (!listing.made_to_order) return null;
  const quantity = Math.floor(Number(listing.available_quantity ?? 0));
  return quantity >= MADE_TO_ORDER_UNLIMITED ? null : quantity;
};

// Everything else: things grown or raised. Used for "what we're growing".
export const GROWN_CATEGORIES = LISTING_CATEGORIES.filter((category) => !isCottageFood(category));

// A cottage food registration number as typed: letters, numbers and dashes.
export const COTTAGE_REG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 -]{2,29}$/;
export const cleanCottageReg = (value: unknown) => (typeof value === 'string' ? value.trim().toUpperCase() : '');

// What a seller needs before listing cottage foods, in one line.
export const COTTAGE_FOOD_RULE =
  'Jams, preserves and baked goods are made in a home kitchen, so you need to be registered with the Arizona cottage food program and add your registration number and a photo or PDF of your registration certificate in your Farm Profile before listing them.';

// The short version of the rule, shown wherever sellers decide what to list.
export const PRODUCE_ONLY_NOTICE =
  'Farm Fresh Direct is for things you grew: fruits, vegetables, herbs, mushrooms, cut flowers and plants, plus eggs and honey. Sellers registered with the Arizona cottage food program can also sell jams, preserves and baked goods. Mushrooms must be ones you cultivated, and plants ones you grew or propagated, not taken from the wild. Listings for anything else, including seeds, meat and foraged mushrooms, will be removed.';
