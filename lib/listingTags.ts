// The short "highlights" a farmer attaches to a listing. Safe to import
// anywhere: the dashboard uses it for the picker, and the listing routes use
// it to check what was sent.

export const MAX_LISTING_TAGS = 5;

// How many of them fit on a Browse card; the listing page shows them all.
export const CARD_LISTING_TAGS = 3;

// A farmer can also write their own, no longer than the longest ready-made one.
export const MAX_LISTING_TAG_LENGTH = 24;

export const LISTING_TAG_OPTIONS = [
  'Pesticide Free',
  'Organically Grown',
  'Independent Grower',
  'Family Farm',
  'Non-GMO',
  'Heirloom Variety',
  'No Synthetic Fertilizers',
  'Hand Harvested',
  'Picked to Order',
  'Regenerative',
  'Hydroponic',
  'Raw & Unfiltered',
];

// Tidies one highlight a farmer typed. Returns the cleaned text, or a reason
// it can't be used. A highlight is a few plain words about the produce, so
// anything that looks like contact details or a link is turned away.
export function cleanListingTag(input: unknown): { tag: string } | { error: string } {
  const tag = typeof input === 'string' ? input.replace(/\s+/g, ' ').trim() : '';

  if (!tag) return { error: 'Type a highlight first.' };
  if (tag.length > MAX_LISTING_TAG_LENGTH) {
    return { error: `Keep it to ${MAX_LISTING_TAG_LENGTH} characters or fewer.` };
  }
  if (/[<>@]|https?:|www\.|\.(com|net|org|co|io)\b/i.test(tag) || (tag.match(/\d/g) || []).length >= 5) {
    return { error: "A highlight can't include a link, an email address or a phone number." };
  }

  return { tag };
}

// What the server keeps from the highlights a listing was sent with: cleaned,
// without repeats, and no more than the limit.
export function cleanListingTags(input: unknown): string[] {
  if (!Array.isArray(input)) return [];

  const kept: string[] = [];
  for (const item of input) {
    const result = cleanListingTag(item);
    if ('error' in result) continue;
    if (kept.some((tag) => tag.toLowerCase() === result.tag.toLowerCase())) continue;
    kept.push(result.tag);
    if (kept.length === MAX_LISTING_TAGS) break;
  }
  return kept;
}
