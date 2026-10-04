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
