// Printed things with a QR code that brings people to the site, such as the
// business cards. Each one's link carries ?src=<key>, and an arrival from it
// is counted (only as a daily total) and shown on the admin page. Only the
// keys listed here are counted, so a made-up ?src= is ignored.
//
// To add a new card or flyer: add its key and label here, and put ?src=<key>
// on the link in its QR code.
export const SCAN_SOURCES: Record<string, string> = {
  // Seller cards: open the seller sign-up page with its introduction
  // (/login?redirect=/dashboard).
  'card-a': 'Seller business card (front A)',
  'card-b': 'Seller business card (front B)',
  // Buyer card: opens the home page.
  'buyer-card': 'Buyer business card',
  // The letter-size flyer: buyers on the front (home page), sellers on the
  // back (the seller sign-up page, like the seller cards).
  'flyer-buyer': 'Flyer (buyer side)',
  'flyer-seller': 'Flyer (seller side)',
  // The one-sided 4 x 6 in buyer postcards: both open the home page. B is
  // the version laid out as icon tiles.
  'postcard-buyer': 'Buyer postcard',
  'postcard-buyer-b': 'Buyer postcard (flyer B)',
  // The one-sided 4 x 6 in seller flyer: opens the seller sign-up page.
  'postcard-seller': 'Seller postcard',
};

export const isScanSource = (value: unknown): value is string =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(SCAN_SOURCES, value);
