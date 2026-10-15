// What can be sold on Farm Fresh Direct: locally grown produce, cultivated
// mushrooms, cut flowers and plants the seller grew, plus the few farm foods
// below. Anything else — seeds, plants dug from the wild, foraged wild
// mushrooms, crafts, other goods — is not allowed and is turned away when a
// listing is posted. Listings in a
// category that has since been removed are hidden from shoppers and can't be
// bought.
export const LISTING_CATEGORIES = [
  'Vegetables',
  'Fruits & Berries',
  'Herbs & Spices',
  'Mushrooms',
  'Honey & Jam',
  'Fresh Eggs',
  'Cut Flowers',
  'Plants & Seedlings',
];

export const isAllowedCategory = (category: string | null | undefined) =>
  LISTING_CATEGORIES.includes(category || '');

// The short version of the rule, shown wherever sellers decide what to list.
export const PRODUCE_ONLY_NOTICE =
  'Farm Fresh Direct is for things you grew: fruits, vegetables, herbs, mushrooms, cut flowers and plants, plus eggs, honey and jam. Mushrooms must be ones you cultivated, and plants ones you grew or propagated, not taken from the wild. Listings for anything else, including seeds and foraged mushrooms, will be removed.';
