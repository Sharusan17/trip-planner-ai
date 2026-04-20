/**
 * Airport cache service
 *
 * Fetches the full airport list from a public GitHub dataset once on first use
 * and holds it in process memory. Zero API calls — no rate limits, no key needed.
 *
 * Source: https://github.com/mwgg/Airports (~9 000 airports worldwide)
 */

const AIRPORTS_URL =
  'https://raw.githubusercontent.com/mwgg/Airports/master/airports.json';

interface RawAirport {
  icao: string;
  iata: string;
  name: string;
  city: string;
  state: string;
  country: string;
  elevation: number;
  lat: number;
  lon: number;
  tz: string;
}

export interface AirportRecord {
  iata: string;
  name: string;
  city: string;
  country: string;
}

let cache: AirportRecord[] = [];
let loaded = false;
let loadPromise: Promise<void> | null = null;

async function doLoad(): Promise<void> {
  try {
    const res = await fetch(AIRPORTS_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw: Record<string, RawAirport> = await res.json();

    cache = Object.values(raw)
      .filter((a) => a.iata && a.iata.trim().length === 3)
      .map((a) => ({
        iata:    a.iata.toUpperCase().trim(),
        name:    a.name,
        city:    a.city,
        country: a.country,
      }));

    loaded = true;
    console.log(`[airportCache] Loaded ${cache.length} airports`);
  } catch (err) {
    console.warn('[airportCache] Failed to load airports:', (err as Error).message);
    // Reset so the next request retries
    loadPromise = null;
  }
}

/** Kick off the background load at server startup. */
export function loadAirports(): void {
  if (!loadPromise) {
    loadPromise = doLoad();
  }
}

/**
 * Search the cached airport list.
 * Awaits the initial load if not yet complete — first call may be slightly slow.
 */
export async function searchAirports(q: string, limit = 8): Promise<AirportRecord[]> {
  // Lazy-start load if never triggered
  if (!loadPromise) {
    loadPromise = doLoad();
  }
  // Await first load
  if (!loaded) {
    await loadPromise;
  }
  if (!q) return [];

  const upper = q.toUpperCase().trim();
  const lower = q.toLowerCase().trim();

  // IATA prefix exact match first (e.g. "LHR"), then name/city substring
  const exactCode = cache.filter((a) => a.iata.startsWith(upper));
  const byName    = cache.filter(
    (a) =>
      !a.iata.startsWith(upper) &&
      (a.name.toLowerCase().includes(lower) || a.city.toLowerCase().includes(lower)),
  );

  return [...exactCode, ...byName].slice(0, limit);
}
