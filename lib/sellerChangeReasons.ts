// What a seller is asked when they cancel or reduce an order: why, and what
// should happen to the listing it came from. Safe to import anywhere: the
// seller dashboard shows these choices, the server checks them, and the admin
// page reports on them.

// Why the order is being cancelled or reduced. The answer goes to Farm Fresh
// Direct, not to the buyer.
export const SELLER_CHANGE_REASONS: Record<string, string> = {
  crop_loss: 'Crop loss (weather, pests or disease)',
  quality: "The quality isn't good enough to sell",
  short_harvest: 'The harvest came in smaller than expected',
  sold_elsewhere: 'I sold or used it elsewhere',
  unavailable: "I can't be available for pickup",
  listing_mistake: 'I made a mistake on the listing',
  buyer_request: 'The buyer asked me to',
  other: 'Something else',
};

// What to do with the listing afterwards.
export const LISTING_ACTIONS: Record<string, { label: string; detail: string }> = {
  restock: {
    label: 'Put it back on sale',
    detail: 'The quantity taken off this order goes back on the listing for other buyers.',
  },
  leave: {
    label: 'Leave the listing as it is',
    detail: "The quantity taken off this order isn't put back. Whatever else is listed stays on sale.",
  },
  take_down: {
    label: 'Take the listing down',
    detail: 'Nothing more can be ordered from this listing. Your other open orders for it are not affected.',
  },
};

export type ListingAction = 'restock' | 'leave' | 'take_down';
