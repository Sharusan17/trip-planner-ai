import { createLogger } from '../utils/logger';

const log = createLogger('iata');

const FLIGHTAPI_IATA_BASE = 'https://api.flightapi.io/iata';

export interface AirlineInfo {
  name: string;
  iata?: string;
  icao?: string;
  country?: string;
}

export interface AirportInfo {
  name: string;
  iata?: string;
  icao?: string;
  city?: string;
  country?: string;
}

interface CacheEntry<T> {
  at: number;
  value: T | null;
}

// 24-hour in-memory cache — airlines and airports rarely change
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const airlineCache = new Map<string, CacheEntry<AirlineInfo>>();
const airportCache = new Map<string, CacheEntry<AirportInfo>>();

function isFresh<T>(hit: CacheEntry<T> | undefined): hit is CacheEntry<T> {
  return !!hit && Date.now() - hit.at < CACHE_TTL_MS;
}

/**
 * Pick the best "name" field from a loose FlightAPI.io IATA response.
 * The endpoint returns either an object or an array of variants; shapes vary.
 */
function pickName(body: unknown): string | null {
  if (!body) return null;
  const obj = Array.isArray(body) ? body[0] : body;
  if (!obj || typeof obj !== 'object') return null;
  const record = obj as Record<string, unknown>;
  const candidates = [
    record.name,
    record.airline_name,
    record.airport_name,
    record.fullName,
    record.full_name,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  return null;
}

function pickString(record: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = record[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}

async function fetchIata(code: string, type: 'airline' | 'airport', apiKey: string): Promise<unknown | null> {
  const url = `${FLIGHTAPI_IATA_BASE}/${apiKey}?name=${encodeURIComponent(code)}&type=${type}`;
  const loggedUrl = `${FLIGHTAPI_IATA_BASE}/[REDACTED]?name=${code}&type=${type}`;
  log.debug(`lookup ${type} ${code}`, { url: loggedUrl });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  const start = Date.now();
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    const dur = Date.now() - start;
    if (!res.ok) {
      const bodyText = await res.text().catch(() => '');
      log.warn(`${type} ${code}: HTTP ${res.status} in ${dur}ms`, { bodyPreview: bodyText.slice(0, 200) });
      return null;
    }
    const body = await res.json();
    log.debug(`${type} ${code}: OK in ${dur}ms`);
    return body;
  } catch (err) {
    log.warn(`${type} ${code}: fetch failed in ${Date.now() - start}ms`, { message: (err as Error).message });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Look up an airline by its IATA/ICAO code. Returns null if unknown or API key missing.
 * Results cached in memory for 24 hours (including negative results).
 */
export async function lookupAirline(rawCode: string): Promise<AirlineInfo | null> {
  const code = rawCode.trim().toUpperCase();
  if (!code) return null;

  const cached = airlineCache.get(code);
  if (isFresh(cached)) return cached.value;

  const apiKey = process.env.FLIGHTAPI_KEY;
  if (!apiKey) {
    log.debug(`airline ${code}: FLIGHTAPI_KEY not set — skipping`);
    return null;
  }

  const body = await fetchIata(code, 'airline', apiKey);
  const name = pickName(body);
  if (!name) {
    airlineCache.set(code, { at: Date.now(), value: null });
    return null;
  }

  const obj = (Array.isArray(body) ? body[0] : body) as Record<string, unknown>;
  const info: AirlineInfo = {
    name,
    iata: pickString(obj, 'iata', 'iata_code'),
    icao: pickString(obj, 'icao', 'icao_code'),
    country: pickString(obj, 'country', 'country_name'),
  };
  airlineCache.set(code, { at: Date.now(), value: info });
  log.info(`airline ${code} → ${info.name}`);
  return info;
}

/**
 * Look up an airport by its IATA/ICAO code. Returns null if unknown or API key missing.
 * Results cached in memory for 24 hours (including negative results).
 */
export async function lookupAirport(rawCode: string): Promise<AirportInfo | null> {
  const code = rawCode.trim().toUpperCase();
  if (!code) return null;

  const cached = airportCache.get(code);
  if (isFresh(cached)) return cached.value;

  const apiKey = process.env.FLIGHTAPI_KEY;
  if (!apiKey) return null;

  const body = await fetchIata(code, 'airport', apiKey);
  const name = pickName(body);
  if (!name) {
    airportCache.set(code, { at: Date.now(), value: null });
    return null;
  }

  const obj = (Array.isArray(body) ? body[0] : body) as Record<string, unknown>;
  const info: AirportInfo = {
    name,
    iata: pickString(obj, 'iata', 'iata_code'),
    icao: pickString(obj, 'icao', 'icao_code'),
    city: pickString(obj, 'city', 'city_name', 'municipality'),
    country: pickString(obj, 'country', 'country_name'),
  };
  airportCache.set(code, { at: Date.now(), value: info });
  log.info(`airport ${code} → ${info.name}`);
  return info;
}
