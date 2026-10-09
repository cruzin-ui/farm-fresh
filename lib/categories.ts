// What can be sold on Farm Fresh Direct: locally grown produce, plus the few
// farm foods below. Anything else — seeds, plants, crafts, other goods — is
// not allowed and is turned away when a listing is posted. Listings in a
// category that has since been removed are hidden from shoppers and can't be
// bought.
export const LISTING_CATEGORIES = ['Vegetables', 'Fruits & Berries', 'Herbs & Spices', 'Honey & Jam', 'Fresh Eggs'];

export const isAllowedCategory = (category: string | null | undefined) =>
  LISTING_CATEGORIES.includes(category || '');

// The short version of the rule, shown wherever sellers decide what to list.
export const PRODUCE_ONLY_NOTICE =
  'Farm Fresh Direct is for local produce only: fruits, vegetables and herbs you grew, plus eggs, honey and jam. Listings for anything else, including seeds and plants, will be removed.';
