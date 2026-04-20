/**
 * Airport cache service
 *
 * Uses a bundled static dataset (server/src/data/airports.json) — no network
 * calls, no API key, no rate limits, always works.
 */

import airportsData from '../data/airports.json';

export interface AirportRecord {
  iata: string;
  name: string;
  city: string;
  country: string;
}

const cache: AirportRecord[] = airportsData as AirportRecord[];

/** No-op — kept so app.ts doesn't need changes. */
export function loadAirports(): void {
  console.log(`[airportCache] Ready — ${cache.length} airports loaded from static bundle`);
}

/** Filter airports by IATA prefix (e.g. "LH") or name/city substring (e.g. "London"). */
export function searchAirports(q: string, limit = 8): AirportRecord[] {
  if (!q) return [];
  const upper = q.toUpperCase().trim();
  const lower = q.toLowerCase().trim();

  // IATA prefix first (e.g. "LHR"), then name/city substring
  const exactCode = cache.filter((a) => a.iata.startsWith(upper));
  const byName    = cache.filter(
    (a) =>
      !a.iata.startsWith(upper) &&
      (a.name.toLowerCase().includes(lower) || a.city.toLowerCase().includes(lower)),
  );

  return [...exactCode, ...byName].slice(0, limit);
}
