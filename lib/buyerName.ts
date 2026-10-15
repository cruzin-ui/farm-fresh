// A buyer's optional name, kept on their account and copied onto each order
// so the farmer can label the bag. Safe to import anywhere.

// Where it's kept on the account (beside the profile photo).
export const BUYER_NAME_KEY = 'display_name';
export const BUYER_NAME_MAX = 60;

// Tidies a name the buyer typed. An empty name is fine (it's optional). It's
// a name, not a message, so links, email addresses and phone numbers are
// turned away.
export function cleanBuyerName(input: unknown): { name: string } | { error: string } {
  const name = typeof input === 'string' ? input.replace(/\s+/g, ' ').trim() : '';
  if (!name) return { name: '' };
  if (name.length > BUYER_NAME_MAX) return { error: `Keep your name to ${BUYER_NAME_MAX} characters or fewer.` };
  if (/[<>@]|https?:|www\.|\.(com|net|org|co|io)\b/i.test(name) || (name.match(/\d/g) || []).length >= 5) {
    return { error: "A name can't include a link, an email address or a phone number." };
  }
  return { name };
}

// The name to use, or null if there isn't a usable one.
export function usableBuyerName(input: unknown) {
  const result = cleanBuyerName(input);
  return 'name' in result && result.name ? result.name : null;
}
