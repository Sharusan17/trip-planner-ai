/**
 * Place search utilities
 *
 * hotel    → Photon (komoot) — all results, client-filtered to accommodation OSM types
 * location → Nominatim (OSM) — great for cities, airports, train stations
 * poi      → Photon (komoot) — named POIs: restaurants, beaches, museums, attractions
 */

export interface PlaceSuggestion {
  label: string;    // text shown in dropdown
  name: string;     // fills the main input
  address?: string; // optional — fills address field when provided
}

// ── Photon ────────────────────────────────────────────────────────────────────

interface PhotonFeature {
  properties: {
    name?: string;
    housenumber?: string;
    street?: string;
    city?: string;
    state?: string;
    country?: string;
    postcode?: string;
    osm_key?: string;
    osm_value?: string;
  };
  geometry?: {
    coordinates?: [number, number];
  };
}

const ACCOMMODATION_VALUES = new Set([
  'hotel', 'hostel', 'guest_house', 'motel', 'chalet',
  'apartment', 'resort', 'inn', 'bed_and_breakfast', 'villa',
]);

async function photonSearch(q: string): Promise<PhotonFeature[]> {
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=10`;
  const res = await fetch(url);
  const data = await res.json();
  return (data.features ?? []) as PhotonFeature[];
}

/** Returns only accommodation venues (hotels, hostels, etc.) with full address. */
export async function searchHotels(q: string): Promise<PlaceSuggestion[]> {
  const features = await photonSearch(q);

  // Prefer results that OSM-tagged as accommodation
  const hotels = features.filter(
    (f) =>
      f.properties.name &&
      f.properties.osm_key === 'tourism' &&
      ACCOMMODATION_VALUES.has(f.properties.osm_value ?? ''),
  );

  // Fall back to top named results if OSM filter returns nothing
  const pool = hotels.length > 0 ? hotels : features.filter((f) => f.properties.name).slice(0, 5);

  return pool.slice(0, 7).map((f) => {
    const p = f.properties;
    const addressParts = [
      [p.housenumber, p.street].filter(Boolean).join(' '),
      p.postcode,
      p.city,
      p.country,
    ].filter(Boolean);
    const address = addressParts.join(', ');
    const label = [p.name, p.city, p.country].filter(Boolean).join(', ');
    return { label, name: p.name!, address: address || undefined };
  });
}

/** Returns named POIs — restaurants, beaches, museums, attractions, etc. */
export async function searchPOIs(q: string): Promise<PlaceSuggestion[]> {
  const features = await photonSearch(q);
  return features
    .filter((f) => f.properties.name)
    .slice(0, 7)
    .map((f) => {
      const p = f.properties;
      const label = [p.name, p.city, p.country].filter(Boolean).join(', ');
      return { label, name: label };
    });
}

// ── Nominatim ─────────────────────────────────────────────────────────────────

interface NominatimResult {
  display_name: string;
  address?: {
    aerodrome?: string;
    city?: string;
    town?: string;
    village?: string;
    suburb?: string;
    country?: string;
  };
}

/** Returns cities, airports, train stations — best for transport from/to fields. */
export async function searchLocations(q: string): Promise<PlaceSuggestion[]> {
  const url =
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}` +
    `&format=json&limit=7&addressdetails=1`;
  const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
  const data: NominatimResult[] = await res.json();
  return data.map((r) => {
    const a = r.address ?? {};
    const place = a.aerodrome ?? a.city ?? a.town ?? a.village ?? r.display_name.split(',')[0];
    const label = [place, a.country].filter(Boolean).join(', ');
    return { label, name: label };
  });
}
