import { SELLER_FEE_RATE, calculateFarmerPayoutCents } from '@/lib/pricing';
import { CHARGE_DAYS_BEFORE, CONFIRM_DAYS_BEFORE } from '@/lib/csaSchedule';

// Shared Farm Boxes: the rules, the money split and the wording, in one place.
// Safe to import anywhere.
//
// A host farm and up to SHARED_BOX_MAX_PARTNERS partner farms within
// SHARED_BOX_MILES of it fill one box. Each farm sets the price of its own
// part, and the box price is the total. Buyers pick up at the host farm.
// Partners confirm their part for each pickup by CONFIRM_DAYS_BEFORE days
// ahead and bring it to the host. At pickup each farm is paid its part less
// the seller fee, and each partner pays the host HOST_PACKING_RATE of its
// part for packing the boxes.

export const SHARED_BOX_MAX_PARTNERS = 3;
export const SHARED_BOX_MILES = 15;
export const HOST_PACKING_RATE = 0.05;
export const HOST_PACKING_LABEL = `${Math.round(HOST_PACKING_RATE * 100)}%`;
// The smallest part a farm can put in, and the host's smallest part (the host
// fills every box, so it must always have something in it).
export const MIN_SHARE_CENTS = 100;
export const MIN_HOST_SHARE_CENTS = 500;
// A farm can't host or join a shared box with SHARED_BOX_CANCEL_LIMIT or more
// farm-caused cancellations (a missed shared-box delivery counts as one) in
// the last SHARED_BOX_WINDOW_DAYS days, or a payment dispute in that time.
export const SHARED_BOX_CANCEL_LIMIT = 2;
export const SHARED_BOX_WINDOW_DAYS = 60;

// Changes whenever the wording farms agree to changes.
export const SHARED_TERMS_VERSION = '2026-10-20';

// The categories a box of each type may hold, for finding partner farms.
export const FOOD_BOX_CATEGORIES = ['Vegetables', 'Fruits & Berries', 'Herbs & Spices', 'Mushrooms', 'Honey & Jam', 'Fresh Eggs'];
export const FLOWER_BOX_CATEGORIES = ['Cut Flowers'];
export const categoriesForBoxType = (boxType: string | null | undefined) =>
  boxType === 'flowers' ? FLOWER_BOX_CATEGORIES : FOOD_BOX_CATEGORIES;

export const DEFAULT_DROPOFF_NOTE = 'By 6 pm the day before pickup';

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const SELLER_FEE_LABEL = `${Math.round(SELLER_FEE_RATE * 100)}%`;

export type ShareForSplit = {
  farmerId: string;
  role: 'host' | 'partner';
  shareCents: number;
  // included: paid. substituted: the host filled in and is paid for it.
  // refunded: the buyer got it back; nobody is paid.
  status: 'included' | 'refunded' | 'substituted';
};

// What each farm is paid for one shared box: its part less the seller fee;
// partners also pay the host its packing fee. Parts the host substituted are
// paid to the host, with no packing fee. In cents, by farm.
export function splitSharedPayout(shares: ShareForSplit[], sellerFeeRate: number = SELLER_FEE_RATE) {
  const host = shares.find((s) => s.role === 'host');
  const payouts = new Map<string, number>();
  const add = (farmerId: string, cents: number) => payouts.set(farmerId, (payouts.get(farmerId) || 0) + cents);
  for (const share of shares) {
    if (share.status === 'refunded' || share.shareCents <= 0) continue;
    const afterFee = calculateFarmerPayoutCents(share.shareCents, sellerFeeRate);
    if (share.role === 'host' || share.status === 'substituted') {
      add(host?.farmerId || share.farmerId, afterFee);
      continue;
    }
    const packing = Math.round(share.shareCents * HOST_PACKING_RATE);
    add(share.farmerId, afterFee - packing);
    if (host) add(host.farmerId, packing);
  }
  return payouts;
}

// What a farm keeps from its own part of one box, for showing on forms.
export function farmKeepsCents(shareCents: number, role: 'host' | 'partner') {
  const afterFee = calculateFarmerPayoutCents(shareCents, SELLER_FEE_RATE);
  return role === 'partner' ? afterFee - Math.round(shareCents * HOST_PACKING_RATE) : afterFee;
}

// Shown to any farm putting eggs in a box.
export const EGG_NOTICE_SELLER =
  'Eggs must be clean and uncracked, kept at 45°F or below from collection until pickup, and packed and labeled as your state requires. Many states need a license or registration to sell eggs, and some limit who can sell them and how. Check your state’s agriculture department regulations before you add eggs.';
export const EGG_AGREEMENT = 'My part includes eggs, and I follow my state’s rules for selling them, including keeping them cold.';

// Shown to buyers of a box with eggs in it.
export const eggNoticeBuyer = (farmNames: string[]) =>
  `This box includes eggs from ${farmNames.join(' and ')}. Keep them refrigerated at 45°F or below once you get them home.`;

// The steps, as shown to a farm setting up or joining a shared box.
export const SHARED_BOX_STEPS = [
  `The host sets up the box, chooses the pickup day, and invites up to ${SHARED_BOX_MAX_PARTNERS} nearby farms (within ${SHARED_BOX_MILES} miles).`,
  'Each partner says what it puts in every box and sets its own price for that part. The box price is all the parts added together.',
  'The host opens the box to buyers once every invited farm has answered. After that, the farms and prices are fixed; to change them, start a new box.',
  `Each week, partners confirm their part by ${CONFIRM_DAYS_BEFORE} days before pickup (${CONFIRM_DAYS_BEFORE - CHARGE_DAYS_BEFORE} days before buyers are charged). A partner that doesn't confirm, or says it can't, is left out that week and buyers pay less.`,
  'Partners bring their part for every paid box to the host by the drop-off time. The host packs the boxes and hands them to buyers at the host farm.',
  `At pickup, each farm is paid its own part less the ${SELLER_FEE_LABEL} seller fee. Partners pay the host a ${HOST_PACKING_LABEL} packing fee from their part.`,
  'If a partner’s part doesn’t arrive, the host reports it before handing out the boxes: buyers are refunded that part (or the host fills in, if it offered to), the partner isn’t paid for it, and it counts as a cancellation by the partner.',
];

// What a farm agrees to when it sets up (host) or joins (partner) a shared
// box, word for word. Saved with its place in the box.
export function sharedBoxAgreementText(params: {
  role: 'host' | 'partner';
  planName: string;
  hostFarmName: string;
  contribution: string;
  shareCents: number;
  boxType: string;
  includesEggs: boolean;
  hostSubstitutes: boolean;
}) {
  const { role, planName, hostFarmName, contribution, shareCents, boxType, includesEggs, hostSubstitutes } = params;
  const kind = boxType === 'flowers' ? 'Flower Box' : 'Farm Box';
  const keeps = money(farmKeepsCents(shareCents, role));
  const lines =
    role === 'host'
      ? [
          `I'm hosting the shared ${kind} "${planName}". In each box I put ${contribution.trim() || 'my part'}, priced at ${money(shareCents)}; partner farms add their own parts.`,
          'Buyers pick up at my farm. I will receive each partner’s part, keep it fresh and, where needed, cold until pickup, pack every box, and hand boxes over only with the buyer’s pickup code.',
          `At pickup I'm paid my part less the ${SELLER_FEE_LABEL} seller fee (${keeps} a box), plus a ${HOST_PACKING_LABEL} packing fee from each partner's part.`,
          hostSubstitutes
            ? 'If a partner’s part doesn’t arrive, I will report it in my Seller Dashboard before handing out the boxes, and either fill in with my own produce of at least the same value (and be paid that part) or let buyers be refunded that part.'
            : 'If a partner’s part doesn’t arrive, I will report it in my Seller Dashboard before handing out the boxes, and buyers are refunded that part.',
          'Once buyers have joined, the box’s farms, prices and pickup schedule can’t change. I can end the box at any time; boxes already paid for must still be supplied or refunded.',
        ]
      : [
          `I'm joining the shared ${kind} "${planName}", hosted by ${hostFarmName}. In each box I put ${contribution.trim() || 'my part'}, priced at ${money(shareCents)}.`,
          `For each pickup I will confirm my part by the end of the day ${CONFIRM_DAYS_BEFORE} days before it. If I don't, or I say I can't, my part is left out of that week's box, buyers pay less, and I'm not paid for it.`,
          'I will bring my part for every paid box to the host by the host’s drop-off time, fresh and, where needed, cold.',
          `I'm paid at pickup: my part less the ${SELLER_FEE_LABEL} seller fee and a ${HOST_PACKING_LABEL} packing fee to the host (${keeps} a box).`,
          `If my part doesn't arrive, the host reports it: buyers are refunded my part${hostSubstitutes ? ' or the host fills in with its own produce' : ''}, I'm not paid for it, and it counts as a cancellation by me. I can leave the box at any time; boxes already paid for must still be supplied.`,
        ];
  return [
    ...lines,
    'I am responsible for my own products meeting every law that applies to them, including licenses, labeling and food-safety rules.',
    ...(includesEggs ? [EGG_AGREEMENT] : []),
    'I agree to the Seller Terms, including section 7 on shared boxes.',
  ].join(' ');
}
