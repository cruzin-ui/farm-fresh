// How many cancelled orders pause a seller's listings. Safe to import
// anywhere: the seller dashboard quotes these numbers, and lib/fraudWatch.ts
// enforces them.

// A seller who cancels this many orders placed within this many days is
// suspended automatically until an admin lifts it.
export const SELLER_CANCEL_LIMIT = 5;
export const SELLER_CANCEL_WINDOW_DAYS = 7;
