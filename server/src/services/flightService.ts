import pool from '../db/pool';

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

const AVIATIONSTACK_BASE = 'https://api.aviationstack.com/v1';

/**
 * Normalise a flight IATA/ICAO code the way Aviationstack indexes it.
 * Airlines brand flights with zero-padded numbers ("BA0300", "LH0400"), but
 * Aviationstack stores them without the padding ("BA300", "LH400"). Strip
 * leading zeros from the numeric portion while keeping the airline prefix.
 *
 * Airline prefix is either 3 letters (ICAO, e.g. "BAW") or 2 alphanumerics
 * (IATA, e.g. "BA", "W9", "U2"). We prefer the ICAO match when both succeed.
 */
export function normaliseFlightIata(raw: string): string {
  const s = raw.trim().toUpperCase().replace(/\s+/g, '');
  // Try ICAO (3 letters) first, then IATA (2 alphanumeric)
  const icao = s.match(/^([A-Z]{3})0*(\d+)([A-Z]?)$/);
  if (icao) return icao[1] + icao[2] + icao[3];
  const iata = s.match(/^([A-Z0-9]{2})0*(\d+)([A-Z]?)$/);
  if (iata) return iata[1] + iata[2] + iata[3];
  return s;
}

/** Cache hits return this shape; `data` is null for negative hits. */
interface CacheRow {
  flight_iata: string;
  flight_date: string;
  data: FlightInstance | null;
}

/** Today's date (UTC) as YYYY-MM-DD — our cache key for free-tier real-time lookups. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Extract HH:MM from an Aviationstack ISO string like "2026-04-21T08:00:00+00:00". */
function extractHHMM(iso: string | null | undefined): string {
  if (!iso) return '';
  const m = iso.match(/T(\d{2}:\d{2})/);
  return m ? m[1] : '';
}

/** Normalise terminal: Aviationstack often returns "5" or "Terminal 5". Store the bare identifier. */
function normaliseTerminal(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.replace(/^Terminal\s+/i, '').trim();
  return cleaned.length ? cleaned : null;
}

/** Map Aviationstack flight object → FlightInstance. Returns null if essential fields missing. */
function mapToInstance(av: Record<string, unknown>, iata: string, date: string): FlightInstance | null {
  const departure = av.departure as Record<string, unknown> | undefined;
  const arrival = av.arrival as Record<string, unknown> | undefined;
  const airline = av.airline as Record<string, unknown> | undefined;
  const aircraft = av.aircraft as Record<string, unknown> | undefined;
  if (!departure || !arrival || !airline) return null;
  const depIata = departure.iata as string | undefined;
  const arrIata = arrival.iata as string | undefined;
  if (!depIata || !arrIata) return null;

  return {
    flight_iata: iata,
    flight_date: date,
    airline: (airline.name as string) ?? '',
    departure_iata: depIata,
    departure_airport: (departure.airport as string) ?? '',
    departure_terminal: normaliseTerminal(departure.terminal),
    departure_time_local: extractHHMM(departure.scheduled as string),
    arrival_iata: arrIata,
    arrival_airport: (arrival.airport as string) ?? '',
    arrival_terminal: normaliseTerminal(arrival.terminal),
    arrival_time_local: extractHHMM(arrival.scheduled as string),
    aircraft_type: (aircraft?.iata as string) ?? null,
  };
}

/**
 * Fetch the current real-time record for a flight from Aviationstack.
 * Free tier only supports real-time (no `flight_date` historical queries),
 * so we omit the date and take whatever's currently indexed.
 */
async function fetchRealtime(iata: string, apiKey: string, dateToStamp: string): Promise<FlightInstance | null> {
  const url = `${AVIATIONSTACK_BASE}/flights?access_key=${apiKey}&flight_iata=${encodeURIComponent(iata)}&limit=1`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) {
      console.warn(`[flightService] ${iata}: HTTP ${res.status} from Aviationstack`);
      return null;
    }
    const body = await res.json() as { data?: Record<string, unknown>[]; error?: unknown; pagination?: { total?: number } };
    if (body.error) {
      console.warn(`[flightService] ${iata}: API error`, body.error);
      return null;
    }
    const first = body.data?.[0];
    if (!first) {
      console.log(`[flightService] ${iata}: no results (pagination.total=${body.pagination?.total ?? 0})`);
      return null;
    }
    console.log(`[flightService] ${iata}: OK, matched=${body.pagination?.total ?? 1}`);
    // Aviationstack returns its own flight_date; prefer that, fall back to dateToStamp.
    const actualDate = (first.flight_date as string) ?? dateToStamp;
    return mapToInstance(first, iata, actualDate);
  } catch (err) {
    console.warn(`[flightService] ${iata}: fetch failed`, (err as Error).message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Look up a flight via 24h shared DB cache + single real-time Aviationstack call.
 * Returns an array (0 or 1 instances) so callers can keep the list-based UI.
 */
export async function lookupFlight(rawIata: string): Promise<FlightInstance[]> {
  const apiKey = process.env.AVIATIONSTACK_API_KEY;
  if (!apiKey) throw new Error('AVIATIONSTACK_API_KEY not configured');

  const iata = normaliseFlightIata(rawIata);
  const cacheKey = today();

  // Cache hit? Return stored instance (or empty array for negative cache)
  const cacheRes = await pool.query<CacheRow>(
    `SELECT flight_iata, flight_date::text AS flight_date, data
       FROM flight_lookup_cache
      WHERE flight_iata = $1 AND flight_date = $2
        AND fetched_at > NOW() - INTERVAL '24 hours'`,
    [iata, cacheKey]
  );
  if (cacheRes.rows.length > 0) {
    const row = cacheRes.rows[0];
    return row.data ? [row.data] : [];
  }

  // Cache miss → one real-time call
  const instance = await fetchRealtime(iata, apiKey, cacheKey);

  // Persist (including negative result)
  await pool.query(
    `INSERT INTO flight_lookup_cache (flight_iata, flight_date, data, fetched_at)
     VALUES ($1, $2, $3::jsonb, NOW())
     ON CONFLICT (flight_iata, flight_date)
     DO UPDATE SET data = EXCLUDED.data, fetched_at = NOW()`,
    [iata, cacheKey, instance ? JSON.stringify(instance) : null]
  );

  return instance ? [instance] : [];
}

// ─── Live status (5-minute in-memory cache) ────────────────────────────────

const liveCache = new Map<string, { at: number; value: FlightLiveStatus | null }>();
const LIVE_TTL_MS = 5 * 60 * 1000;

export async function getLiveStatus(rawIata: string, date: string): Promise<FlightLiveStatus | null> {
  const apiKey = process.env.AVIATIONSTACK_API_KEY;
  if (!apiKey) throw new Error('AVIATIONSTACK_API_KEY not configured');

  const iata = normaliseFlightIata(rawIata);
  const key = `${iata}|${date}`;
  const hit = liveCache.get(key);
  if (hit && Date.now() - hit.at < LIVE_TTL_MS) return hit.value;

  // Free tier: no flight_date. Live status is inherently real-time anyway.
  const url = `${AVIATIONSTACK_BASE}/flights?access_key=${apiKey}&flight_iata=${encodeURIComponent(iata)}&limit=1`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) { liveCache.set(key, { at: Date.now(), value: null }); return null; }
    const body = await res.json() as { data?: Record<string, unknown>[] };
    const first = body.data?.[0];
    if (!first) { liveCache.set(key, { at: Date.now(), value: null }); return null; }
    const departure = first.departure as Record<string, unknown> | undefined;
    const arrival = first.arrival as Record<string, unknown> | undefined;
    const value: FlightLiveStatus = {
      flight_status: (first.flight_status as string) ?? 'scheduled',
      departure_gate: (departure?.gate as string) ?? null,
      departure_delay_minutes: typeof departure?.delay === 'number' ? (departure.delay as number) : null,
      arrival_gate: (arrival?.gate as string) ?? null,
    };
    liveCache.set(key, { at: Date.now(), value });
    return value;
  } catch {
    liveCache.set(key, { at: Date.now(), value: null });
    return null;
  } finally {
    clearTimeout(timer);
  }
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
