import pool from '../db/pool';
import { createLogger } from '../utils/logger';
import { lookupAirline, lookupAirport } from './iataLookupService';

const log = createLogger('flight');

/** Canonical instance shape returned to the dashboard. */
export interface FlightInstance {
  flight_iata: string;
  flight_date: string;        // YYYY-MM-DD
  airline: string;
  departure_iata: string;
  departure_airport: string;
  departure_terminal: string | null;
  departure_time_local: string; // HH:MM (24h) in departure local timezone
  arrival_iata: string;
  arrival_airport: string;
  arrival_terminal: string | null;
  arrival_time_local: string;
  aircraft_type: string | null;
}

export interface FlightLiveStatus {
  flight_status: string;
  departure_gate: string | null;
  departure_delay_minutes: number | null;
  arrival_gate: string | null;
}

const FLIGHTAPI_BASE = 'https://api.flightapi.io/airline';

/**
 * Normalise a raw flight code to canonical form: uppercase, no spaces,
 * leading zeros stripped from the numeric portion.
 *   "ba0300" → "BA300"
 *   "W9 5731" → "W95731"
 *   "bAW0123" → "BAW123"
 */
export function normaliseFlightIata(raw: string): string {
  const s = raw.trim().toUpperCase().replace(/\s+/g, '');
  const icao = s.match(/^([A-Z]{3})0*(\d+)([A-Z]?)$/);
  if (icao) return icao[1] + icao[2] + icao[3];
  const iata = s.match(/^([A-Z0-9]{2})0*(\d+)([A-Z]?)$/);
  if (iata) return iata[1] + iata[2] + iata[3];
  return s;
}

/**
 * Split a normalised flight code into airline prefix + number.
 * FlightAPI.io wants these as two separate query params.
 *   "BA300"   → { name: "BA",  num: "300" }
 *   "W95731"  → { name: "W9",  num: "5731" }
 *   "BAW300"  → { name: "BAW", num: "300" }
 */
function splitFlightCode(normalised: string): { name: string; num: string } | null {
  const icao = normalised.match(/^([A-Z]{3})(\d+)([A-Z]?)$/);
  if (icao) return { name: icao[1], num: icao[2] + icao[3] };
  const iata = normalised.match(/^([A-Z0-9]{2})(\d+)([A-Z]?)$/);
  if (iata) return { name: iata[1], num: iata[2] + iata[3] };
  return null;
}

/** Cache hits return this shape; `data` is null for negative hits. */
interface CacheRow {
  flight_iata: string;
  flight_date: string;
  data: FlightInstance | null;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** "2026-04-21" → "20260421" */
function toYYYYMMDD(iso: string): string {
  return iso.replace(/-/g, '');
}

/** Extract HH:MM from an ISO string like "2025-07-16T15:27:00+02:00". */
function extractHHMM(iso: string | null | undefined): string {
  if (!iso || typeof iso !== 'string') return '';
  const m = iso.match(/T(\d{2}:\d{2})/);
  return m ? m[1] : '';
}

/** FlightAPI.io's response is an array of `{departure}` and `{arrival}` objects. */
interface FlightAPILeg {
  departure?: {
    airport?: string;
    airportCode?: string;
    terminal?: string | null;
    gate?: string | null;
    scheduledTime?: string;
    estimatedTime?: string | null;
    departureDateTime?: string;
    offGroundTime?: string | null;
    outGateTime?: string | null;
  };
  arrival?: {
    airport?: string;
    airportCode?: string;
    terminal?: string | null;
    gate?: string | null;
    scheduledTime?: string;
    estimatedTime?: string | null;
    arrivalDateTime?: string;
    onGroundTime?: string | null;
    inGateTime?: string | null;
    timeRemaining?: string | null;
  };
}

interface ParsedFlight {
  instance: FlightInstance | null;
  status: FlightLiveStatus | null;
}

/** Find the first `departure` and `arrival` objects in a FlightAPI.io response. */
function extractLegs(body: FlightAPILeg[]): { dep: NonNullable<FlightAPILeg['departure']> | null; arr: NonNullable<FlightAPILeg['arrival']> | null } {
  let dep: FlightAPILeg['departure'] | null = null;
  let arr: FlightAPILeg['arrival'] | null = null;
  for (const item of body) {
    if (item.departure && !dep) dep = item.departure;
    if (item.arrival && !arr) arr = item.arrival;
  }
  return { dep: dep ?? null, arr: arr ?? null };
}

function parseFlightAPIResponse(body: unknown, iata: string, dateIso: string): ParsedFlight {
  if (!Array.isArray(body) || body.length === 0) return { instance: null, status: null };
  const { dep, arr } = extractLegs(body as FlightAPILeg[]);
  if (!dep || !arr) return { instance: null, status: null };

  // Essential fields — both airport codes must be present
  if (!dep.airportCode || !arr.airportCode) return { instance: null, status: null };

  const instance: FlightInstance = {
    flight_iata: iata,
    flight_date: dateIso,
    airline: '', // FlightAPI.io doesn't return airline name; UI falls back to the IATA prefix
    departure_iata: dep.airportCode,
    departure_airport: dep.airport ?? '',
    departure_terminal: dep.terminal?.trim() || null,
    departure_time_local: extractHHMM(dep.departureDateTime),
    arrival_iata: arr.airportCode,
    arrival_airport: arr.airport ?? '',
    arrival_terminal: arr.terminal?.trim() || null,
    arrival_time_local: extractHHMM(arr.arrivalDateTime),
    aircraft_type: null, // not provided by FlightAPI.io
  };

  // Derive status from ground-time signals
  let flight_status = 'scheduled';
  if (arr.onGroundTime || arr.inGateTime) flight_status = 'landed';
  else if (dep.offGroundTime) flight_status = 'active';

  const status: FlightLiveStatus = {
    flight_status,
    departure_gate: dep.gate?.trim() || null,
    departure_delay_minutes: null, // FlightAPI.io times are fuzzy strings — skip delay calc
    arrival_gate: arr.gate?.trim() || null,
  };

  return { instance, status };
}

/**
 * Fill in airline + airport names using the FlightAPI.io /iata endpoint.
 * Mutates the instance in place; safe to call with partial data.
 */
async function enrichInstance(instance: FlightInstance, airlinePrefix: string): Promise<void> {
  const tasks: Promise<void>[] = [];

  if (!instance.airline && airlinePrefix) {
    tasks.push(
      lookupAirline(airlinePrefix).then((info) => {
        // Use the full name when available; fall back to the IATA/ICAO prefix
        // so the airline field is never empty after a successful lookup.
        instance.airline = info?.name ?? airlinePrefix.toUpperCase();
      }),
    );
  }

  if (!instance.departure_airport && instance.departure_iata) {
    tasks.push(
      lookupAirport(instance.departure_iata).then((info) => {
        if (info?.name) instance.departure_airport = info.name;
      }),
    );
  }

  if (!instance.arrival_airport && instance.arrival_iata) {
    tasks.push(
      lookupAirport(instance.arrival_iata).then((info) => {
        if (info?.name) instance.arrival_airport = info.name;
      }),
    );
  }

  if (tasks.length) {
    await Promise.allSettled(tasks);
  }
}

async function fetchFromFlightAPI(iata: string, dateIso: string, apiKey: string): Promise<ParsedFlight> {
  const split = splitFlightCode(iata);
  if (!split) {
    log.warn(`${iata}: could not split into airline/number`);
    return { instance: null, status: null };
  }
  // Redact the api key from the logged URL
  const loggedUrl = `${FLIGHTAPI_BASE}/[REDACTED]?num=${split.num}&name=${split.name}&date=${toYYYYMMDD(dateIso)}`;
  log.debug(`${iata} (${dateIso}): calling FlightAPI.io`, { url: loggedUrl });

  const url = `${FLIGHTAPI_BASE}/${apiKey}?num=${encodeURIComponent(split.num)}&name=${encodeURIComponent(split.name)}&date=${toYYYYMMDD(dateIso)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  const start = Date.now();
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    const dur = Date.now() - start;
    if (!res.ok) {
      const bodyText = await res.text().catch(() => '');
      log.warn(`${iata} (${dateIso}): HTTP ${res.status} from FlightAPI.io in ${dur}ms`, { bodyPreview: bodyText.slice(0, 300) });
      return { instance: null, status: null };
    }
    const body = await res.json();
    const parsed = parseFlightAPIResponse(body, iata, dateIso);
    if (parsed.instance) {
      await enrichInstance(parsed.instance, split.name);
      log.info(`${iata} (${dateIso}): lookup OK in ${dur}ms`, {
        airline: parsed.instance.airline || '(unknown)',
        route: `${parsed.instance.departure_iata} → ${parsed.instance.arrival_iata}`,
        airports: `${parsed.instance.departure_airport} → ${parsed.instance.arrival_airport}`,
        times: `${parsed.instance.departure_time_local} → ${parsed.instance.arrival_time_local}`,
        status: parsed.status?.flight_status,
      });
    } else {
      log.info(`${iata} (${dateIso}): no usable data in response in ${dur}ms`, { body: Array.isArray(body) ? `array[${body.length}]` : body });
    }
    return parsed;
  } catch (err) {
    log.warn(`${iata} (${dateIso}): fetch failed in ${Date.now() - start}ms`, { message: (err as Error).message });
    return { instance: null, status: null };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Look up a flight via 24h shared DB cache + single FlightAPI.io call.
 * If `targetDate` is provided, queries that date; otherwise falls back to today.
 * Returns an array (0 or 1 instances) so callers can keep the list-based UI.
 */
export async function lookupFlight(rawIata: string, targetDate?: string): Promise<FlightInstance[]> {
  const apiKey = process.env.FLIGHTAPI_KEY;
  if (!apiKey) {
    log.warn('lookup called but FLIGHTAPI_KEY not configured');
    throw new Error('FLIGHTAPI_KEY not configured');
  }

  const iata = normaliseFlightIata(rawIata);
  const dateIso = targetDate && /^\d{4}-\d{2}-\d{2}$/.test(targetDate) ? targetDate : today();
  log.debug(`lookup ${iata} for ${dateIso}`, { rawInput: rawIata });

  // Cache hit? Return stored instance (or empty array for negative cache)
  const cacheRes = await pool.query<CacheRow>(
    `SELECT flight_iata, flight_date::text AS flight_date, data
       FROM flight_lookup_cache
      WHERE flight_iata = $1 AND flight_date = $2
        AND fetched_at > NOW() - INTERVAL '24 hours'`,
    [iata, dateIso]
  );
  if (cacheRes.rows.length > 0) {
    const row = cacheRes.rows[0];
    log.info(`${iata} (${dateIso}): cache HIT`, { negative: !row.data });
    return row.data ? [row.data] : [];
  }

  log.debug(`${iata} (${dateIso}): cache MISS, fetching`);
  // Cache miss → one FlightAPI.io call
  const { instance } = await fetchFromFlightAPI(iata, dateIso, apiKey);

  // Persist (including negative result)
  await pool.query(
    `INSERT INTO flight_lookup_cache (flight_iata, flight_date, data, fetched_at)
     VALUES ($1, $2, $3::jsonb, NOW())
     ON CONFLICT (flight_iata, flight_date)
     DO UPDATE SET data = EXCLUDED.data, fetched_at = NOW()`,
    [iata, dateIso, instance ? JSON.stringify(instance) : null]
  );

  return instance ? [instance] : [];
}

// ─── Live status (5-minute in-memory cache) ────────────────────────────────

const liveCache = new Map<string, { at: number; value: FlightLiveStatus | null }>();
const LIVE_TTL_MS = 5 * 60 * 1000;

export async function getLiveStatus(rawIata: string, date: string): Promise<FlightLiveStatus | null> {
  const apiKey = process.env.FLIGHTAPI_KEY;
  if (!apiKey) throw new Error('FLIGHTAPI_KEY not configured');

  const iata = normaliseFlightIata(rawIata);
  const key = `${iata}|${date}`;
  const hit = liveCache.get(key);
  if (hit && Date.now() - hit.at < LIVE_TTL_MS) return hit.value;

  const { status } = await fetchFromFlightAPI(iata, date, apiKey);
  liveCache.set(key, { at: Date.now(), value: status });
  return status;
}

/** Delete cache rows older than 48h. Called at server startup. */
export async function cleanupStaleCache(): Promise<void> {
  try {
    await pool.query(
      `DELETE FROM flight_lookup_cache WHERE fetched_at < NOW() - INTERVAL '48 hours'`
    );
  } catch (err) {
    console.warn('[flightService] cleanupStaleCache failed:', (err as Error).message);
  }
}
