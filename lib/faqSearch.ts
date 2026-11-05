// Searching the FAQ. Safe to import anywhere.
//
// People type questions the way they'd ask them ("how do I get my money
// back?"), so a search ignores filler words and punctuation, treats forms of
// a word as the same word (refund, refunds, refunded), and knows a few words
// mean the same thing here (money back = refund, CSA = Farm Box). An entry
// matches when every remaining word is found in its question or answer;
// matches in the question rank above matches only in the answer.

// Words that say nothing about what someone is looking for.
const FILLER = new Set(
  (
    'a an the and or but if so of to in on at by for from with about into as is are was were be been being am ' +
    'do does did done doing can could would should will shall may might must have has had i me my mine we us our ' +
    'you your yours it its this that these those there here what when where which who whom why how ' +
    'any some all much many get got just also than then very really please want need know tell way thing things ' +
    'hi hello thanks thank im ive id dont cant wont isnt arent doesnt didnt'
  ).split(' ')
);

// Two-word phrases that are one idea. Applied to the FAQ text as well as the
// search, so both sides end up with the same single word.
const PHRASES: [RegExp, string][] = [
  [/\bmoney back\b/g, 'refund'],
  [/\bfarm ?box(es)?\b/g, 'farmbox'],
  [/\bflower ?box(es)?\b/g, 'flowerbox'],
  [/\bpick(ed|ing|s)? up\b/g, 'pickup'],
  [/\bno shows?\b/g, 'noshow'],
  [/\b(dont|doesnt|didnt|not|never) show( up)?\b/g, 'noshow'],
  [/\bcant make( it)?\b/g, 'noshow'],
  [/\bsign(ed|ing)? (in|on)\b/g, 'login'],
  [/\blog(ged|ging)? in\b/g, 'login'],
  [/\bsign(ed|ing)? up\b/g, 'signup'],
  [/\bfarmers? markets?\b/g, 'market'],
  [/\bsales tax\b/g, 'tax'],
  [/\bcut ?off\b/g, 'deadline'],
  [/\bget paid\b/g, 'payout'],
  [/\bturn(ed|s|ing)? down\b/g, 'turndown'],
];

// Words that mean the same thing on this site, by their root form (see
// `root`). A search for any word in a group finds the others.
const SYNONYMS: string[][] = [
  ['refund', 'reimburs', 'chargeback', 'return'],
  ['spoil', 'rotten', 'damag', 'mold', 'bruis', 'quality', 'wrong'],
  ['cancel', 'withdraw'],
  ['farmbox', 'csa', 'subscription', 'subscrib', 'membership', 'share'],
  ['pickup', 'deliver', 'delivery', 'ship', 'collect'],
  ['fee', 'charge', 'commission', 'cost'],
  ['payout', 'deposit', 'bank'],
  ['pay', 'payment', 'card'],
  ['seller', 'farmer', 'grower', 'vendor'],
  ['buyer', 'customer', 'shopper'],
  ['wholesale', 'bulk', 'restaurant', 'business', 'resale'],
  ['login', 'password', 'account'],
  ['contact', 'message', 'email', 'support'],
  ['noshow', 'miss', 'forgot', 'late'],
  ['listing', 'list', 'post', 'harvest'],
  ['vegetable', 'veggie', 'produce'],
  ['flowerbox', 'flower', 'bouquet'],
  ['skip', 'pause', 'vacation', 'away'],
  ['deadline', 'cutoff'],
  ['signup', 'register', 'join', 'start', 'apply'],
  ['decline', 'fail', 'refuse', 'reject', 'turndown'],
  ['tax', 'taxes'],
];

const synonymsOf = new Map<string, string[]>();
for (const group of SYNONYMS) {
  const roots = group.map(root);
  for (const r of roots) synonymsOf.set(r, [...new Set([...(synonymsOf.get(r) || []), ...roots])]);
}

// Lower case, curly quotes made straight, apostrophes dropped ("don't" ->
// "dont"), everything else that isn't a letter or digit made a space, then
// the phrases above joined up.
function normalize(text: string) {
  let s = text
    .toLowerCase()
    .replace(/[‘’ʼ']/g, '')
    .replace(/[^a-z0-9]+/g, ' ');
  for (const [pattern, word] of PHRASES) s = s.replace(pattern, word);
  return s.trim();
}

// A word's root, good enough to match its common forms: boxes -> box,
// cancelled -> cancel, refunding -> refund, deliveries -> delivery.
function root(word: string) {
  let w = word;
  if (w.length > 4 && w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  if (w.length > 5 && w.endsWith('ing')) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith('ed')) w = w.slice(0, -2);
  else if (w.length > 4 && /(x|s|z|ch|sh)es$/.test(w)) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
  // cancell -> cancel, shipp -> ship
  if (w.length > 3 && /([b-df-hj-np-tv-z])\1$/.test(w) && !w.endsWith('ss')) w = w.slice(0, -1);
  // decline and declined -> declin (but fee stays fee)
  else if (w.length > 3 && w.endsWith('e') && !w.endsWith('ee')) w = w.slice(0, -1);
  return w;
}

const roots = (text: string) => normalize(text).split(' ').filter(Boolean).map(root);

export type SearchIndex = { question: Set<string>; answer: Set<string> };

// What a search needs to know about one entry. Worked out once per entry.
export function indexEntry(question: string, answerText: string): SearchIndex {
  return { question: new Set(roots(question)), answer: new Set(roots(answerText)) };
}

// The words of a search, each as the list of roots that would count as
// finding it. Filler words are dropped unless the search is nothing else.
export function parseSearch(query: string): string[][] {
  const words = normalize(query).split(' ').filter(Boolean);
  const meaningful = words.filter((w) => !FILLER.has(w));
  return [...new Set((meaningful.length ? meaningful : words).map(root))].map((r) => synonymsOf.get(r) || [r]);
}

// Whether a set of roots has this one. A longer search word also finds words
// that start with it ("deliver" finds "delivery"); a short one has to match
// exactly, so "pay" doesn't find "payout".
function has(words: Set<string>, wanted: string) {
  if (words.has(wanted)) return true;
  if (wanted.length < 4) return false;
  for (const w of words) if (w.startsWith(wanted)) return true;
  return false;
}

// How well an entry fits a search: how many of its words were found, and a
// score that counts a word found in the question three times as much as one
// found only in the answer.
export function scoreEntry(entry: SearchIndex, terms: string[][]) {
  let found = 0;
  let score = 0;
  for (const alternatives of terms) {
    if (alternatives.some((r) => has(entry.question, r))) {
      found += 1;
      score += 3;
    } else if (alternatives.some((r) => has(entry.answer, r))) {
      found += 1;
      score += 1;
    }
  }
  return { found, score, matchesAll: terms.length > 0 && found === terms.length };
}

// What is kept of a search that found nothing: tidied, and not kept at all if
// it looks like it holds an email address or a phone, order or card number.
export function searchToRecord(query: string) {
  const text = query.trim().replace(/\s+/g, ' ').toLowerCase().slice(0, 80);
  if (text.length < 3) return null;
  if (text.includes('@') || /\d[\d\s().-]{3,}\d/.test(text)) return null;
  return text;
}
