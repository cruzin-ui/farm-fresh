// Location helpers shared by the browser and the server. A "location" here is
// always the centre of a zip code — good enough to say what is nearby, and it
// never reveals a farmer's actual address.

export type Coordinates = { latitude: number; longitude: number };

// Looks up the centre of a 5-digit US zip code. Returns null for an unknown
// zip or if the lookup service can't be reached; callers treat that as "no
// location" rather than an error.
export async function geocodeZip(zip: string | null | undefined): Promise<Coordinates | null> {
  const cleaned = (zip || '').trim().slice(0, 5);
  if (!/^\d{5}$/.test(cleaned)) return null;

  try {
    const res = await fetch(`https://api.zippopotam.us/us/${cleaned}`);
    if (!res.ok) return null;

    const place = (await res.json()).places?.[0];
    const latitude = Number(place?.latitude);
    const longitude = Number(place?.longitude);

    return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
  } catch {
    return null;
  }
}

// Straight-line distance between two points, in miles.
export function milesBetween(a: Coordinates, b: Coordinates) {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadiusMiles = 3958.8;

  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.latitude)) * Math.cos(toRadians(b.latitude)) * Math.sin(dLon / 2) ** 2;

  return 2 * earthRadiusMiles * Math.asin(Math.sqrt(h));
}

// Roads rarely run straight, so a drive is usually longer than the straight
// line between two places. Multiplying by this gives a fair estimate of the
// distance by road without a paid mapping service.
const ROAD_FACTOR = 1.3;

// Past this many miles by road, a buyer is reminded that pickup is in person.
export const FAR_PICKUP_MILES = 20;

// A straight-line distance between zip codes, as the rough distance by road a
// buyer would actually drive, in words.
export function describeDrive(straightMiles: number) {
  const roadMiles = straightMiles * ROAD_FACTOR;
  const rounded = Math.max(1, Math.round(roadMiles));
  return {
    roadMiles,
    far: roadMiles > FAR_PICKUP_MILES,
    text: roadMiles < 2 ? 'Under 2 miles from you' : `About ${rounded} miles from you`,
    short: roadMiles < 2 ? 'under 2 mi away' : `about ${rounded} mi away`,
  };
}

// A link that opens Google Maps with directions between two zip codes, so a
// buyer can see the real drive and how long it takes. Zip codes only: the
// farm's street address isn't shared until an order is ready.
export function directionsLink(fromZip: string, toZip: string) {
  const place = (zip: string) => encodeURIComponent(`${zip}, USA`);
  return `https://www.google.com/maps/dir/?api=1&origin=${place(fromZip)}&destination=${place(toZip)}`;
}

// The zip code a buyer last gave, remembered in their browser so every page
// can say how far away a farm is. Browse, the listing page and checkout share it.
const BUYER_ZIP_KEY = 'ffd-near-zip';

export function rememberedBuyerZip() {
  try {
    const zip = window.localStorage.getItem(BUYER_ZIP_KEY) || '';
    return /^\d{5}$/.test(zip) ? zip : '';
  } catch {
    return '';
  }
}

export function rememberBuyerZip(zip: string) {
  try {
    if (/^\d{5}$/.test(zip)) window.localStorage.setItem(BUYER_ZIP_KEY, zip);
    else window.localStorage.removeItem(BUYER_ZIP_KEY);
  } catch {}
}
