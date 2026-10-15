// What can be sold on Farm Fresh Direct: locally grown produce, cultivated
// mushrooms and cut flowers, plus the few farm foods below. Anything else —
// seeds, potted plants, foraged wild mushrooms, crafts, other goods — is not
// allowed and is turned away when a listing is posted. Listings in a
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
];

export const isAllowedCategory = (category: string | null | undefined) =>
  LISTING_CATEGORIES.includes(category || '');

// The short version of the rule, shown wherever sellers decide what to list.
export const PRODUCE_ONLY_NOTICE =
  'Farm Fresh Direct is for local produce only: fruits, vegetables, herbs, mushrooms and cut flowers you grew, plus eggs, honey and jam. Mushrooms must be ones you cultivated, not gathered from the wild. Listings for anything else, including seeds, potted plants and foraged mushrooms, will be removed.';
