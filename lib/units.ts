import { PLANTS_CATEGORY } from '@/lib/plants';

// The units listings can be sold in, and which of them make sense for each
// category, so honey can't be sold by the bunch or plants by the pound. Safe
// to import anywhere: the listing forms show only a category's units, and the
// listing routes refuse any other.

export const UNIT_TYPE_OPTIONS = [
  { value: 'lbs', label: 'lbs (Pounds)' },
  { value: 'oz', label: 'oz (Ounces)' },
  { value: 'kg', label: 'kg (Kilograms)' },
  { value: 'units', label: 'Each (e.g. per pumpkin)' },
  { value: 'plants', label: 'Plants (each)' },
  { value: 'pots', label: 'Pots' },
  { value: 'dozen', label: 'Dozen' },
  { value: 'bunches', label: 'Bunches' },
  { value: 'bouquets', label: 'Bouquets' },
  { value: 'stems', label: 'Stems' },
  { value: 'bags', label: 'Bags' },
  { value: 'flats', label: 'Flats' },
  { value: 'pints', label: 'Pints' },
  { value: 'quarts', label: 'Quarts' },
  { value: 'jars', label: 'Jars' },
  { value: 'packets', label: 'Packets' },
];

// Each category's units, the usual one first (new listings start on it).
export const CATEGORY_UNITS: Record<string, string[]> = {
  Vegetables: ['lbs', 'units', 'bunches', 'bags', 'oz', 'kg', 'pints'],
  'Fruits & Berries': ['lbs', 'units', 'pints', 'quarts', 'flats', 'bags', 'oz', 'kg'],
  'Herbs & Spices': ['bunches', 'oz', 'bags', 'jars'],
  Mushrooms: ['lbs', 'oz', 'bags'],
  'Honey & Jam': ['jars', 'lbs', 'oz'],
  'Fresh Eggs': ['dozen', 'units'],
  'Cut Flowers': ['bunches', 'bouquets', 'stems'],
  [PLANTS_CATEGORY]: ['plants', 'pots', 'flats'],
};

export function unitsFor(category: string) {
  return CATEGORY_UNITS[category] || UNIT_TYPE_OPTIONS.map((option) => option.value);
}

export function usualUnit(category: string) {
  return unitsFor(category)[0];
}

export function isAllowedUnit(category: string, unit: string) {
  return unitsFor(category).includes(unit);
}

// The unit choices for a category's drop-down. `keep` is a listing's current
// unit, kept on the list when editing an older listing that predates these
// rules, so the form doesn't quietly change it.
export function unitOptionsFor(category: string, keep?: string) {
  const allowed = unitsFor(category);
  return UNIT_TYPE_OPTIONS.filter((option) => allowed.includes(option.value) || option.value === keep).sort(
    (a, b) => (allowed.indexOf(a.value) + 1 || 99) - (allowed.indexOf(b.value) + 1 || 99)
  );
}

// One of a unit, for "Price per plant": lbs -> lb, bunches -> bunch.
const SINGULAR: Record<string, string> = { lbs: 'lb', units: 'item', plants: 'plant', pots: 'pot', bunches: 'bunch', bouquets: 'bouquet', stems: 'stem', bags: 'bag', flats: 'flat', pints: 'pint', quarts: 'quart', jars: 'jar', packets: 'packet' };
export function unitSingular(unit: string) {
  return SINGULAR[unit] || unit;
}

// "Plants & Seedlings are sold by plants, pots or flats."
export function unitRuleText(category: string) {
  const labels = unitsFor(category).map((unit) => (unit === 'units' ? 'each' : unit));
  const list = labels.length > 1 ? `${labels.slice(0, -1).join(', ')} or ${labels[labels.length - 1]}` : labels[0];
  return `${category} are sold by ${list}.`;
}
