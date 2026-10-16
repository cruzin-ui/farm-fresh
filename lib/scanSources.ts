// Printed things with a QR code that brings people to the site, such as the
// business cards. Each one's link carries ?src=<key>, and an arrival from it
// is counted (only as a daily total) and shown on the admin page. Only the
// keys listed here are counted, so a made-up ?src= is ignored.
//
// To add a new card or flyer: add its key and label here, and use
// https://www.farmfreshdirect.online/?src=<key> in its QR code.
export const SCAN_SOURCES: Record<string, string> = {
  'card-a': 'Farmer business card (front A)',
  'card-b': 'Farmer business card (front B)',
};

export const isScanSource = (value: unknown): value is string =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(SCAN_SOURCES, value);
