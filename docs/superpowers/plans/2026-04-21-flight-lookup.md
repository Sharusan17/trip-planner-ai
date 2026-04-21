# Flight Lookup by Reference Number — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a user enters a flight number into the transport form (setup wizard or standalone), auto-fetch recent instances from Aviationstack, group by schedule, let the user pick one, and auto-fill airline/terminals/aircraft/times. Add a live status + gate badge on booking cards when the flight is within 24h of departure.

**Architecture:** Server-side read-through cache (`flight_lookup_cache`, shared across all trips, 24h TTL) sits in front of Aviationstack `/v1/flights`. New server routes `/flights/lookup` and `/flights/status`. New reusable dashboard component `<FlightLookup>` renders beneath the reference input. New component `<FlightLiveStatus>` hangs off booking cards. Four new nullable columns on `transport_bookings` (airline, terminals, aircraft type).

**Tech Stack:** Express + TypeScript + PostgreSQL (server), React 19 + Vite + @tanstack/react-query v5 + Tailwind (dashboard), Aviationstack API (external).

**Spec:** `docs/superpowers/specs/2026-04-21-flight-lookup-design.md`

**Verification gate:** This codebase has no automated test framework. Each task's "verification" is `npx tsc --noEmit` + manual check against Railway deployment. The user pushes to `main`, Railway auto-deploys, then verification happens against the live URL. Do NOT suggest `npm run dev` — the user runs on Railway only.

---

## Task 1: DB Migration — Flight Cache Table + Transport Booking Columns

**Files:**
- Modify: `server/src/db/migrate.ts` (append to `migrations` array, before the `];` on line 353)

- [ ] **Step 1: Append the migration block to `server/src/db/migrate.ts`**

Insert these entries at the end of the `migrations` array (just before the closing `];`):

```typescript
  // 017: flight lookup cache + transport booking flight detail columns
  `CREATE TABLE IF NOT EXISTS flight_lookup_cache (
    flight_iata TEXT NOT NULL,
    flight_date DATE NOT NULL,
    data JSONB,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (flight_iata, flight_date)
  );`,

  `CREATE INDEX IF NOT EXISTS idx_flight_cache_fetched ON flight_lookup_cache(fetched_at);`,

  `ALTER TABLE transport_bookings ADD COLUMN IF NOT EXISTS airline TEXT;`,
  `ALTER TABLE transport_bookings ADD COLUMN IF NOT EXISTS departure_terminal TEXT;`,
  `ALTER TABLE transport_bookings ADD COLUMN IF NOT EXISTS arrival_terminal TEXT;`,
  `ALTER TABLE transport_bookings ADD COLUMN IF NOT EXISTS aircraft_type TEXT;`,
```

Note: `data` is nullable so we can cache negative results (days Aviationstack returned nothing).

- [ ] **Step 2: Typecheck**

Run: `cd server && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add server/src/db/migrate.ts
git commit -m "feat(db): add flight_lookup_cache table and flight detail columns"
```

Railway will run this migration on next deploy.

---

## Task 2: Shared Type — Extend `TransportBooking`

**Files:**
- Modify: `shared/src/types/transport.ts`

- [ ] **Step 1: Add optional fields to `TransportBooking` and `CreateTransportInput`**

Edit `shared/src/types/transport.ts`. Change the `TransportBooking` interface (currently at lines 12–28) to add four optional fields before `created_at`:

```typescript
export interface TransportBooking {
  id: string;
  trip_id: string;
  transport_type: TransportType;
  from_location: string;
  to_location: string;
  departure_time: string;
  arrival_time: string | null;
  reference_number: string | null;
  price: number | null;
  currency: string | null;
  price_home: number | null;
  notes: string | null;
  airline: string | null;
  departure_terminal: string | null;
  arrival_terminal: string | null;
  aircraft_type: string | null;
  traveller_ids: string[];
  created_at: string;
  updated_at: string;
}
```

Then extend `CreateTransportInput` (currently at lines 30–41):

```typescript
export interface CreateTransportInput {
  transport_type: TransportType;
  from_location: string;
  to_location: string;
  departure_time: string;
  arrival_time?: string;
  reference_number?: string;
  price?: number;
  currency?: string;
  notes?: string;
  airline?: string;
  departure_terminal?: string;
  arrival_terminal?: string;
  aircraft_type?: string;
  traveller_ids: string[];
}
```

(`UpdateTransportInput = Partial<CreateTransportInput>` below remains unchanged and picks up the new fields automatically.)

- [ ] **Step 2: Build shared types so server + dashboard see them**

Run: `cd shared && npm run build`
Expected: completes, `shared/dist/` updated.

- [ ] **Step 3: Typecheck consumers**

Run: `cd server && npx tsc --noEmit` — no errors
Run: `cd dashboard && npx tsc --noEmit` — no errors

- [ ] **Step 4: Commit**

```bash
git add shared/src/types/transport.ts
git commit -m "feat(shared): add airline/terminals/aircraft_type to TransportBooking"
```

---

## Task 3: Server — Flight Service

**Files:**
- Create: `server/src/services/flightService.ts`

- [ ] **Step 1: Create `server/src/services/flightService.ts`**

```typescript
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

/** Cache hits return this shape; `data` is null for negative hits. */
interface CacheRow {
  flight_iata: string;
  flight_date: string;
  data: FlightInstance | null;
}

/** Return last 7 dates (today + 6 previous) as YYYY-MM-DD. */
function recentDates(): string[] {
  const out: string[] = [];
  const today = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setUTCDate(today.getUTCDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/** Extract HH:MM from an Aviationstack ISO string like "2026-04-21T08:00:00+00:00". */
function extractHHMM(iso: string | null | undefined): string {
  if (!iso) return '';
  // Aviationstack returns local time already — just strip the date + seconds
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

async function fetchOneDay(iata: string, date: string, apiKey: string): Promise<FlightInstance | null> {
  const url = `${AVIATIONSTACK_BASE}/flights?access_key=${apiKey}&flight_iata=${encodeURIComponent(iata)}&flight_date=${date}&limit=1`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    const body = await res.json() as { data?: Record<string, unknown>[] };
    const first = body.data?.[0];
    return first ? mapToInstance(first, iata, date) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Look up last 7 days of a flight via cache-first read.
 * Uncached dates get fetched from Aviationstack in parallel and written back.
 * Returns instances where Aviationstack had data, most-recent-first.
 */
export async function lookupFlight(iata: string): Promise<FlightInstance[]> {
  const apiKey = process.env.AVIATIONSTACK_API_KEY;
  if (!apiKey) throw new Error('AVIATIONSTACK_API_KEY not configured');

  const dates = recentDates();
  const cacheRes = await pool.query<CacheRow>(
    `SELECT flight_iata, flight_date::text AS flight_date, data
       FROM flight_lookup_cache
      WHERE flight_iata = $1 AND flight_date = ANY($2::date[])`,
    [iata, dates]
  );
  const cached = new Map(cacheRes.rows.map((r) => [r.flight_date, r]));

  const missing = dates.filter((d) => !cached.has(d));
  const fetched = await Promise.all(
    missing.map(async (date) => ({ date, instance: await fetchOneDay(iata, date, apiKey) }))
  );

  // Persist fresh results (including negatives)
  for (const { date, instance } of fetched) {
    await pool.query(
      `INSERT INTO flight_lookup_cache (flight_iata, flight_date, data, fetched_at)
       VALUES ($1, $2, $3::jsonb, NOW())
       ON CONFLICT (flight_iata, flight_date)
       DO UPDATE SET data = EXCLUDED.data, fetched_at = NOW()`,
      [iata, date, instance ? JSON.stringify(instance) : null]
    );
  }

  // Merge cache + fresh, keep only non-null, sort most-recent-first
  const all: FlightInstance[] = [];
  for (const d of dates) {
    const hit = cached.get(d);
    if (hit && hit.data) { all.push(hit.data); continue; }
    const fresh = fetched.find((f) => f.date === d);
    if (fresh?.instance) all.push(fresh.instance);
  }
  return all.sort((a, b) => b.flight_date.localeCompare(a.flight_date));
}

// ─── Live status (5-minute in-memory cache) ────────────────────────────────

const liveCache = new Map<string, { at: number; value: FlightLiveStatus | null }>();
const LIVE_TTL_MS = 5 * 60 * 1000;

export async function getLiveStatus(iata: string, date: string): Promise<FlightLiveStatus | null> {
  const apiKey = process.env.AVIATIONSTACK_API_KEY;
  if (!apiKey) throw new Error('AVIATIONSTACK_API_KEY not configured');

  const key = `${iata}|${date}`;
  const hit = liveCache.get(key);
  if (hit && Date.now() - hit.at < LIVE_TTL_MS) return hit.value;

  const url = `${AVIATIONSTACK_BASE}/flights?access_key=${apiKey}&flight_iata=${encodeURIComponent(iata)}&flight_date=${date}&limit=1`;
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
```

- [ ] **Step 2: Typecheck**

Run: `cd server && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add server/src/services/flightService.ts
git commit -m "feat(server): add flightService with Aviationstack lookup + 24h cache"
```

---

## Task 4: Server — Flight Routes

**Files:**
- Modify: `server/src/routes/flightSearch.ts`

- [ ] **Step 1: Add two new routes to `server/src/routes/flightSearch.ts`**

Replace the entire file with:

```typescript
import { Router, Request, Response } from 'express';
import { searchAirports } from '../services/airportCache';
import { lookupFlight, getLiveStatus } from '../services/flightService';

const router = Router();

/**
 * GET /api/v1/airports/search?q=LHR
 *
 * Searches the bundled static airport dataset.
 * Zero external API calls — no rate limits, no key required.
 */
router.get('/airports/search', (req: Request, res: Response) => {
  const q = (req.query.q as string ?? '').trim();
  if (q.length < 2) return res.json([]);

  const airports = searchAirports(q);
  const suggestions = airports.map((a) => {
    const location = [a.city, a.country].filter(Boolean).join(', ');
    const label = location
      ? `${a.iata} — ${a.name}, ${location}`
      : `${a.iata} — ${a.name}`;
    return { label, name: `${a.name} (${a.iata})` };
  });

  res.json(suggestions);
});

/**
 * GET /api/v1/flights/lookup?iata=BA456
 *
 * Returns last 7 days of instances (cache-read-through to Aviationstack).
 */
router.get('/flights/lookup', async (req: Request, res: Response) => {
  const raw = (req.query.iata as string ?? '').trim().toUpperCase().replace(/\s+/g, '');
  if (!/^[A-Z]{2,3}\d{1,4}[A-Z]?$/.test(raw)) {
    return res.status(400).json({ error: 'Invalid flight IATA format' });
  }
  try {
    const instances = await lookupFlight(raw);
    res.json(instances);
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes('not configured')) {
      return res.status(503).json({ error: 'Flight lookup not configured' });
    }
    res.status(502).json({ error: 'Flight lookup failed' });
  }
});

/**
 * GET /api/v1/flights/status?iata=BA456&date=2026-04-21
 *
 * Returns live status/gate/delay for a single flight on a single date.
 * 5-min in-memory cache.
 */
router.get('/flights/status', async (req: Request, res: Response) => {
  const iata = (req.query.iata as string ?? '').trim().toUpperCase().replace(/\s+/g, '');
  const date = (req.query.date as string ?? '').trim();
  if (!/^[A-Z]{2,3}\d{1,4}[A-Z]?$/.test(iata)) {
    return res.status(400).json({ error: 'Invalid flight IATA format' });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Invalid date format (expected YYYY-MM-DD)' });
  }
  try {
    const status = await getLiveStatus(iata, date);
    if (!status) return res.status(404).json({ error: 'No status available' });
    res.json(status);
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes('not configured')) {
      return res.status(503).json({ error: 'Flight lookup not configured' });
    }
    res.status(502).json({ error: 'Flight status failed' });
  }
});

export default router;
```

- [ ] **Step 2: Typecheck**

Run: `cd server && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add server/src/routes/flightSearch.ts
git commit -m "feat(server): add /flights/lookup and /flights/status routes"
```

---

## Task 5: Server — Startup Cleanup + Env Example

**Files:**
- Modify: `server/src/app.ts`
- Modify: `server/.env.example`

- [ ] **Step 1: Wire cleanup into startup in `server/src/app.ts`**

Add import at the top of the imports block (after `import { loadAirports } from './services/airportCache';`):

```typescript
import { cleanupStaleCache } from './services/flightService';
```

After the existing `loadAirports();` call (around line 50), add:

```typescript
// Clean expired flight lookup cache rows (> 48h old)
cleanupStaleCache();
```

- [ ] **Step 2: Add `AVIATIONSTACK_API_KEY` to `.env.example`**

Check current contents:

Run: `cat server/.env.example`

Add a new line (anywhere in the file, near other `*_API_KEY` entries):

```
AVIATIONSTACK_API_KEY=
```

- [ ] **Step 3: Typecheck**

Run: `cd server && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add server/src/app.ts server/.env.example
git commit -m "chore(server): wire flight cache cleanup + add AVIATIONSTACK_API_KEY to .env.example"
```

After this push the user adds `AVIATIONSTACK_API_KEY` to Railway server env vars.

---

## Task 6: Server — Extend Transport Routes with New Fields

**Files:**
- Modify: `server/src/routes/transport.ts`

- [ ] **Step 1: Update POST handler to accept new fields**

In `server/src/routes/transport.ts`, locate the `router.post('/trips/:tripId/transport', ...)` handler (starts line 41). Update the destructuring and INSERT:

Change this:
```typescript
    const {
      transport_type, from_location, to_location, departure_time, arrival_time,
      reference_number, price, currency, notes, traveller_ids,
    } = req.body;
```

To:
```typescript
    const {
      transport_type, from_location, to_location, departure_time, arrival_time,
      reference_number, price, currency, notes, traveller_ids,
      airline, departure_terminal, arrival_terminal, aircraft_type,
    } = req.body;
```

Change the INSERT statement from:
```typescript
    const bookingResult = await client.query(
      `INSERT INTO transport_bookings
         (trip_id, transport_type, from_location, to_location, departure_time, arrival_time,
          reference_number, price, currency, price_home, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [tripId, transport_type, from_location, to_location, departure_time,
       arrival_time || null, reference_number || null,
       price || null, currency || null, priceHome, notes || null]
    );
```

To:
```typescript
    const bookingResult = await client.query(
      `INSERT INTO transport_bookings
         (trip_id, transport_type, from_location, to_location, departure_time, arrival_time,
          reference_number, price, currency, price_home, notes,
          airline, departure_terminal, arrival_terminal, aircraft_type)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [tripId, transport_type, from_location, to_location, departure_time,
       arrival_time || null, reference_number || null,
       price || null, currency || null, priceHome, notes || null,
       airline || null, departure_terminal || null, arrival_terminal || null, aircraft_type || null]
    );
```

- [ ] **Step 2: Update PUT handler to accept new fields**

Find the `router.put('/transport/:id', ...)` handler (around line 121). Update its destructuring:

From:
```typescript
    const {
      transport_type, from_location, to_location, departure_time, arrival_time,
      reference_number, price, currency, notes, traveller_ids,
    } = req.body;
```

To:
```typescript
    const {
      transport_type, from_location, to_location, departure_time, arrival_time,
      reference_number, price, currency, notes, traveller_ids,
      airline, departure_terminal, arrival_terminal, aircraft_type,
    } = req.body;
```

Update the UPDATE SQL. Change:
```typescript
    const updResult = await client.query(
      `UPDATE transport_bookings SET
         transport_type = COALESCE($1, transport_type),
         from_location = COALESCE($2, from_location),
         to_location = COALESCE($3, to_location),
         departure_time = COALESCE($4, departure_time),
         arrival_time = COALESCE($5, arrival_time),
         reference_number = COALESCE($6, reference_number),
         price = $7, currency = $8, price_home = $9,
         notes = COALESCE($10, notes),
         updated_at = NOW()
       WHERE id = $11 RETURNING *`,
      [transport_type ?? null, from_location ?? null, to_location ?? null,
       departure_time ?? null, arrival_time ?? null, reference_number ?? null,
       newPrice, newCurrency, priceHome, notes ?? null, req.params.id]
    );
```

To:
```typescript
    const updResult = await client.query(
      `UPDATE transport_bookings SET
         transport_type = COALESCE($1, transport_type),
         from_location = COALESCE($2, from_location),
         to_location = COALESCE($3, to_location),
         departure_time = COALESCE($4, departure_time),
         arrival_time = COALESCE($5, arrival_time),
         reference_number = COALESCE($6, reference_number),
         price = $7, currency = $8, price_home = $9,
         notes = COALESCE($10, notes),
         airline = COALESCE($11, airline),
         departure_terminal = COALESCE($12, departure_terminal),
         arrival_terminal = COALESCE($13, arrival_terminal),
         aircraft_type = COALESCE($14, aircraft_type),
         updated_at = NOW()
       WHERE id = $15 RETURNING *`,
      [transport_type ?? null, from_location ?? null, to_location ?? null,
       departure_time ?? null, arrival_time ?? null, reference_number ?? null,
       newPrice, newCurrency, priceHome, notes ?? null,
       airline ?? null, departure_terminal ?? null, arrival_terminal ?? null, aircraft_type ?? null,
       req.params.id]
    );
```

GET handlers (`SELECT *`) automatically return the new columns — no change needed.

- [ ] **Step 3: Typecheck**

Run: `cd server && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add server/src/routes/transport.ts
git commit -m "feat(server): accept airline/terminals/aircraft_type on transport create + update"
```

---

## Task 7: Dashboard — Flights API Client

**Files:**
- Create: `dashboard/src/api/flights.ts`

- [ ] **Step 1: Create `dashboard/src/api/flights.ts`**

```typescript
import { api } from './client';

export interface FlightInstance {
  flight_iata: string;
  flight_date: string;
  airline: string;
  departure_iata: string;
  departure_airport: string;
  departure_terminal: string | null;
  departure_time_local: string; // "HH:MM"
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

export const flightsApi = {
  lookup: (iata: string) => api.get<FlightInstance[]>(`/flights/lookup?iata=${encodeURIComponent(iata)}`),
  status: (iata: string, date: string) =>
    api.get<FlightLiveStatus>(`/flights/status?iata=${encodeURIComponent(iata)}&date=${encodeURIComponent(date)}`),
};
```

- [ ] **Step 2: Typecheck**

Run: `cd dashboard && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add dashboard/src/api/flights.ts
git commit -m "feat(dashboard): add flights API client"
```

---

## Task 8: Dashboard — `FlightLookup` Component

**Files:**
- Create: `dashboard/src/components/transport/FlightLookup.tsx`

- [ ] **Step 1: Create directory**

Run: `mkdir -p dashboard/src/components/transport`
(If it already exists, this is a no-op.)

- [ ] **Step 2: Create `dashboard/src/components/transport/FlightLookup.tsx`**

```tsx
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plane, Search, Loader2 } from 'lucide-react';
import { flightsApi, type FlightInstance } from '@/api/flights';

export interface FlightAutoFill {
  airline: string;
  from_location: string;
  to_location: string;
  departure_terminal: string | null;
  arrival_terminal: string | null;
  aircraft_type: string | null;
  departure_time_hhmm: string;
  arrival_time_hhmm: string;
}

interface Props {
  flightNumber: string;
  bookingDate: string; // YYYY-MM-DD (optional empty)
  onAutoFill: (data: FlightAutoFill) => void;
}

interface ScheduleGroup {
  signature: string;
  instances: FlightInstance[];
  days: string[]; // e.g. ['Mon','Tue','Wed']
  sample: FlightInstance;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function dayNameFromISO(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return DAY_NAMES[d.getUTCDay()];
}

function normaliseIata(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '');
}

function minutesBetween(hhmmA: string, hhmmB: string): number {
  if (!hhmmA || !hhmmB) return 0;
  const [aH, aM] = hhmmA.split(':').map(Number);
  const [bH, bM] = hhmmB.split(':').map(Number);
  let diff = (bH * 60 + bM) - (aH * 60 + aM);
  if (diff < 0) diff += 24 * 60; // handle crossing midnight
  return diff;
}

function formatDuration(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function groupBySchedule(instances: FlightInstance[]): ScheduleGroup[] {
  const groups = new Map<string, ScheduleGroup>();
  for (const inst of instances) {
    const sig = `${inst.departure_iata}|${inst.arrival_iata}|${inst.departure_time_local}|${inst.arrival_time_local}|${inst.departure_terminal ?? ''}|${inst.arrival_terminal ?? ''}`;
    const existing = groups.get(sig);
    if (existing) {
      existing.instances.push(inst);
      const day = dayNameFromISO(inst.flight_date);
      if (!existing.days.includes(day)) existing.days.push(day);
    } else {
      groups.set(sig, {
        signature: sig,
        instances: [inst],
        days: [dayNameFromISO(inst.flight_date)],
        sample: inst,
      });
    }
  }
  return Array.from(groups.values());
}

export default function FlightLookup({ flightNumber, bookingDate, onAutoFill }: Props) {
  const [debouncedIata, setDebouncedIata] = useState('');

  useEffect(() => {
    const normalised = normaliseIata(flightNumber);
    if (normalised.length < 4 || !/^[A-Z]{2,3}\d{1,4}[A-Z]?$/.test(normalised)) {
      setDebouncedIata('');
      return;
    }
    const t = setTimeout(() => setDebouncedIata(normalised), 500);
    return () => clearTimeout(t);
  }, [flightNumber]);

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ['flight-lookup', debouncedIata],
    queryFn: () => flightsApi.lookup(debouncedIata),
    enabled: debouncedIata.length >= 4,
    staleTime: 60 * 60 * 1000,
    retry: false,
  });

  const groups = useMemo(() => (data ? groupBySchedule(data) : []), [data]);

  const bookingDateLabel = useMemo(() => {
    if (!bookingDate) return '';
    try {
      return new Date(`${bookingDate}T00:00:00Z`).toLocaleDateString('en-GB', {
        day: 'numeric', month: 'short',
      });
    } catch {
      return '';
    }
  }, [bookingDate]);

  if (!debouncedIata) return null;

  if (isLoading || isFetching) {
    return (
      <div className="flex items-center gap-2 text-xs text-ink-faint mt-2">
        <Loader2 size={14} className="animate-spin" />
        Looking up {debouncedIata}…
      </div>
    );
  }

  if (error) {
    const status = (error as Error & { status?: number }).status;
    const msg = (error as Error).message?.toLowerCase() ?? '';
    if (status === 503 || msg.includes('not configured')) {
      return (
        <p className="text-xs text-ink-faint mt-2">
          Flight lookup unavailable. Enter details manually.
        </p>
      );
    }
    return (
      <p className="text-xs text-ink-faint mt-2">
        Flight lookup temporarily unavailable. Enter details manually.
      </p>
    );
  }

  if (!groups.length) {
    return (
      <p className="text-xs text-ink-faint mt-2">
        {debouncedIata} not found in recent history. Enter details manually.
      </p>
    );
  }

  const headline = groups.length === 1
    ? `Recent ${debouncedIata} schedule${bookingDateLabel ? ` — use as template for ${bookingDateLabel}` : ''}`
    : `Recent ${debouncedIata} schedules — pick one${bookingDateLabel ? ` for ${bookingDateLabel}` : ''}`;

  return (
    <div className="mt-3 space-y-2">
      <p className="text-xs font-semibold text-ink-faint uppercase tracking-wider">{headline}</p>
      {groups.map((g) => {
        const mins = minutesBetween(g.sample.departure_time_local, g.sample.arrival_time_local);
        const fromLabel = `${g.sample.departure_airport} (${g.sample.departure_iata})`;
        const toLabel = `${g.sample.arrival_airport} (${g.sample.arrival_iata})`;
        return (
          <button
            key={g.signature}
            type="button"
            onClick={() => onAutoFill({
              airline: g.sample.airline,
              from_location: fromLabel,
              to_location: toLabel,
              departure_terminal: g.sample.departure_terminal,
              arrival_terminal: g.sample.arrival_terminal,
              aircraft_type: g.sample.aircraft_type,
              departure_time_hhmm: g.sample.departure_time_local,
              arrival_time_hhmm: g.sample.arrival_time_local,
            })}
            className="w-full text-left rounded-xl border border-parchment-dark bg-white hover:border-navy hover:bg-navy/5 transition-colors p-3"
          >
            <div className="flex items-center gap-2 mb-1">
              <Plane size={14} className="text-navy" strokeWidth={2} />
              <span className="text-sm font-semibold text-ink">{g.sample.airline || debouncedIata}</span>
            </div>
            <div className="text-sm text-ink">
              {g.sample.departure_iata}{g.sample.departure_terminal ? ` T${g.sample.departure_terminal}` : ''}
              {' → '}
              {g.sample.arrival_iata}{g.sample.arrival_terminal ? ` T${g.sample.arrival_terminal}` : ''}
            </div>
            <div className="text-xs text-ink-faint mt-0.5">
              {g.sample.departure_time_local} → {g.sample.arrival_time_local}
              {mins > 0 && ` · ${formatDuration(mins)}`}
              {g.sample.aircraft_type && ` · ${g.sample.aircraft_type}`}
            </div>
            <div className="text-xs text-ink-faint mt-1">
              Flown on: {g.days.join(', ')}
            </div>
            <div className="mt-2 flex items-center gap-1 text-xs text-navy font-medium">
              <Search size={12} strokeWidth={2} /> Use this schedule
            </div>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `cd dashboard && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add dashboard/src/components/transport/FlightLookup.tsx
git commit -m "feat(dashboard): add FlightLookup component with schedule grouping"
```

---

## Task 9: Dashboard — Integrate `FlightLookup` into `SetupStepTransport`

**Files:**
- Modify: `dashboard/src/components/setup/SetupStepTransport.tsx`

- [ ] **Step 1: Add import**

At the top of `dashboard/src/components/setup/SetupStepTransport.tsx`, after the existing imports, add:

```typescript
import FlightLookup, { type FlightAutoFill } from '@/components/transport/FlightLookup';
```

- [ ] **Step 2: Extend `Draft` interface with new fields**

Edit the `Draft` interface to add four new fields (keep existing fields untouched):

```typescript
interface Draft {
  transport_type: TransportType;
  from_location: string;
  to_location: string;
  departure_time: string;
  arrival_time: string;
  reference_number: string;
  price: string;
  currency: string;
  showArrival: boolean;
  airline: string;
  departure_terminal: string;
  arrival_terminal: string;
  aircraft_type: string;
}
```

Update `blankDraft()` to include empty strings for all four:

```typescript
  const blankDraft = (): Draft => ({
    transport_type: 'flight',
    from_location: '',
    to_location: '',
    departure_time: '',
    arrival_time: '',
    reference_number: '',
    price: '',
    currency: homeCurrency,
    showArrival: false,
    airline: '',
    departure_terminal: '',
    arrival_terminal: '',
    aircraft_type: '',
  });
```

- [ ] **Step 3: Pass new fields through `saveDraft`**

In the `saveDraft` function, extend the `createMutation.mutate({ ... })` call with:

```typescript
    createMutation.mutate({
      transport_type: draft.transport_type,
      from_location: draft.from_location.trim(),
      to_location: draft.to_location.trim(),
      departure_time: draft.departure_time,
      arrival_time: draft.arrival_time || undefined,
      reference_number: draft.reference_number.trim() || undefined,
      price: isNaN(priceNum) ? undefined : priceNum,
      currency: draft.price ? draft.currency : undefined,
      airline: draft.airline.trim() || undefined,
      departure_terminal: draft.departure_terminal.trim() || undefined,
      arrival_terminal: draft.arrival_terminal.trim() || undefined,
      aircraft_type: draft.aircraft_type.trim() || undefined,
      traveller_ids: travellers.map((t) => t.id),
    });
```

- [ ] **Step 4: Add `<FlightLookup>` below the reference input**

Find the reference number input (around line 207–212):

```tsx
        <input
          className="vintage-input w-full"
          placeholder="Booking ref / PNR (optional)"
          value={draft.reference_number}
          onChange={(e) => setDraft({ ...draft, reference_number: e.target.value })}
        />
```

Wrap it in a fragment and add the lookup component immediately after, guarded on flight type:

```tsx
        <input
          className="vintage-input w-full"
          placeholder="Booking ref / PNR (optional)"
          value={draft.reference_number}
          onChange={(e) => setDraft({ ...draft, reference_number: e.target.value })}
        />
        {draft.transport_type === 'flight' && (
          <FlightLookup
            flightNumber={draft.reference_number}
            bookingDate={draft.departure_time.slice(0, 10)}
            onAutoFill={(data: FlightAutoFill) => {
              const datePart = draft.departure_time.slice(0, 10);
              const depDT = datePart && data.departure_time_hhmm ? `${datePart}T${data.departure_time_hhmm}` : draft.departure_time;
              const arrDT = datePart && data.arrival_time_hhmm ? `${datePart}T${data.arrival_time_hhmm}` : draft.arrival_time;
              setDraft({
                ...draft,
                from_location: data.from_location,
                to_location: data.to_location,
                airline: data.airline,
                departure_terminal: data.departure_terminal ?? '',
                arrival_terminal: data.arrival_terminal ?? '',
                aircraft_type: data.aircraft_type ?? '',
                departure_time: depDT,
                arrival_time: arrDT,
                showArrival: arrDT ? true : draft.showArrival,
              });
            }}
          />
        )}
```

- [ ] **Step 5: Typecheck**

Run: `cd dashboard && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add dashboard/src/components/setup/SetupStepTransport.tsx
git commit -m "feat(dashboard): wire FlightLookup into setup transport step"
```

---

## Task 10: Dashboard — Integrate Into `TransportBookingFormPage`

**Files:**
- Modify: `dashboard/src/pages/TransportBookingFormPage.tsx`

- [ ] **Step 1: Add import**

Add after existing imports:

```typescript
import FlightLookup, { type FlightAutoFill } from '@/components/transport/FlightLookup';
```

- [ ] **Step 2: Extend `FormData` interface with new fields**

Replace the `FormData` interface and `emptyForm`:

```typescript
interface FormData {
  transport_type: TransportType;
  from_location: string;
  to_location: string;
  departure_time: string;
  arrival_time: string;
  reference_number: string;
  price: string;
  currency: string;
  notes: string;
  traveller_ids: string[];
  airline: string;
  departure_terminal: string;
  arrival_terminal: string;
  aircraft_type: string;
}

const emptyForm: FormData = {
  transport_type: 'flight', from_location: '', to_location: '',
  departure_time: '', arrival_time: '', reference_number: '',
  price: '', currency: 'EUR', notes: '', traveller_ids: [],
  airline: '', departure_terminal: '', arrival_terminal: '', aircraft_type: '',
};
```

- [ ] **Step 3: Load new fields when editing**

In the `useEffect` that hydrates the form from an existing booking (currently around lines 54–70), update it to include the new fields:

```typescript
  useEffect(() => {
    if (!isEdit || !id || bookings.length === 0) return;
    const b = bookings.find((x) => x.id === id);
    if (!b) return;
    setForm({
      transport_type: b.transport_type,
      from_location: b.from_location,
      to_location: b.to_location,
      departure_time: b.departure_time.slice(0, 16),
      arrival_time: b.arrival_time ? b.arrival_time.slice(0, 16) : '',
      reference_number: b.reference_number ?? '',
      price: b.price ? String(b.price) : '',
      currency: b.currency ?? 'EUR',
      notes: b.notes ?? '',
      traveller_ids: b.traveller_ids,
      airline: b.airline ?? '',
      departure_terminal: b.departure_terminal ?? '',
      arrival_terminal: b.arrival_terminal ?? '',
      aircraft_type: b.aircraft_type ?? '',
    });
  }, [isEdit, id, bookings]);
```

- [ ] **Step 4: Pass new fields in `handleSubmit`**

Update the `data` object:

```typescript
    const data: CreateTransportInput = {
      transport_type: form.transport_type,
      from_location: form.from_location,
      to_location: form.to_location,
      departure_time: form.departure_time,
      arrival_time: form.arrival_time || undefined,
      reference_number: form.reference_number || undefined,
      price: form.price ? parseFloat(form.price) : undefined,
      currency: form.currency || undefined,
      notes: form.notes || undefined,
      airline: form.airline || undefined,
      departure_terminal: form.departure_terminal || undefined,
      arrival_terminal: form.arrival_terminal || undefined,
      aircraft_type: form.aircraft_type || undefined,
      traveller_ids: form.traveller_ids,
    };
```

- [ ] **Step 5: Add `<FlightLookup>` after the Reference input**

Find the Reference block (around lines 174–180):

```tsx
        {/* Reference */}
        <div>
          <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">Reference / Booking No.</label>
          <input className="vintage-input w-full font-mono" value={form.reference_number}
            onChange={(e) => setForm({ ...form, reference_number: e.target.value })}
            placeholder="e.g. TP1234" />
        </div>
```

Add the `FlightLookup` immediately after, guarded on flight type:

```tsx
        {/* Reference */}
        <div>
          <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">Reference / Booking No.</label>
          <input className="vintage-input w-full font-mono" value={form.reference_number}
            onChange={(e) => setForm({ ...form, reference_number: e.target.value })}
            placeholder="e.g. TP1234" />
          {form.transport_type === 'flight' && (
            <FlightLookup
              flightNumber={form.reference_number}
              bookingDate={form.departure_time.slice(0, 10)}
              onAutoFill={(data: FlightAutoFill) => {
                const datePart = form.departure_time.slice(0, 10);
                const depDT = datePart && data.departure_time_hhmm ? `${datePart}T${data.departure_time_hhmm}` : form.departure_time;
                const arrDT = datePart && data.arrival_time_hhmm ? `${datePart}T${data.arrival_time_hhmm}` : form.arrival_time;
                setForm({
                  ...form,
                  from_location: data.from_location,
                  to_location: data.to_location,
                  airline: data.airline,
                  departure_terminal: data.departure_terminal ?? '',
                  arrival_terminal: data.arrival_terminal ?? '',
                  aircraft_type: data.aircraft_type ?? '',
                  departure_time: depDT,
                  arrival_time: arrDT,
                });
              }}
            />
          )}
        </div>
```

- [ ] **Step 6: Add inline airline/terminals/aircraft inputs (flight type only)**

Immediately after the Reference/FlightLookup block, add four optional fields that the user can edit (covers cases where lookup is unavailable or partially wrong). Insert:

```tsx
        {form.transport_type === 'flight' && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">Airline</label>
              <input className="vintage-input w-full" value={form.airline}
                onChange={(e) => setForm({ ...form, airline: e.target.value })}
                placeholder="e.g. British Airways" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">Aircraft</label>
              <input className="vintage-input w-full" value={form.aircraft_type}
                onChange={(e) => setForm({ ...form, aircraft_type: e.target.value })}
                placeholder="e.g. A320" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">Dep terminal</label>
              <input className="vintage-input w-full" value={form.departure_terminal}
                onChange={(e) => setForm({ ...form, departure_terminal: e.target.value })}
                placeholder="e.g. 5" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink-faint mb-1.5 uppercase tracking-wider">Arr terminal</label>
              <input className="vintage-input w-full" value={form.arrival_terminal}
                onChange={(e) => setForm({ ...form, arrival_terminal: e.target.value })}
                placeholder="e.g. 1" />
            </div>
          </div>
        )}
```

- [ ] **Step 7: Typecheck**

Run: `cd dashboard && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add dashboard/src/pages/TransportBookingFormPage.tsx
git commit -m "feat(dashboard): wire FlightLookup + airline/terminal fields into TransportBookingForm"
```

---

## Task 11: Dashboard — `FlightLiveStatus` Component

**Files:**
- Create: `dashboard/src/components/transport/FlightLiveStatus.tsx`

- [ ] **Step 1: Create `dashboard/src/components/transport/FlightLiveStatus.tsx`**

```tsx
import { useQuery } from '@tanstack/react-query';
import { flightsApi } from '@/api/flights';

interface Props {
  flightIata: string;       // e.g. "BA456"
  departureISO: string;     // full ISO datetime of the booking
}

function isWithin24h(iso: string): boolean {
  try {
    const t = new Date(iso).getTime();
    const now = Date.now();
    const diff = t - now;
    return diff > -6 * 60 * 60 * 1000 && diff < 24 * 60 * 60 * 1000; // -6h to +24h
  } catch {
    return false;
  }
}

function statusBadge(status: string, delay: number | null) {
  const delayed = delay != null && delay > 0;
  const label = delayed ? `Delayed ${delay}m` : (
    status === 'landed' ? 'Landed' :
    status === 'cancelled' ? 'Cancelled' :
    status === 'diverted' ? 'Diverted' :
    status === 'active' ? 'In the air' :
    'On time'
  );
  const colour =
    status === 'cancelled' ? 'bg-terracotta/15 text-terracotta' :
    delayed || status === 'diverted' ? 'bg-gold/15 text-gold-aged' :
    status === 'landed' ? 'bg-parchment-dark/40 text-ink-faint' :
    'bg-emerald-500/15 text-emerald-700';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${colour}`}>
      {label}
    </span>
  );
}

export default function FlightLiveStatus({ flightIata, departureISO }: Props) {
  const imminent = isWithin24h(departureISO);
  const date = departureISO.slice(0, 10);

  const { data } = useQuery({
    queryKey: ['flight-status', flightIata, date],
    queryFn: () => flightsApi.status(flightIata, date),
    enabled: imminent && !!flightIata && !!date,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  if (!imminent || !data) return null;

  return (
    <div className="mt-2 flex items-center gap-2 text-xs text-ink-faint">
      {statusBadge(data.flight_status, data.departure_delay_minutes)}
      {data.departure_gate && (
        <span>Gate <span className="font-semibold text-ink">{data.departure_gate}</span></span>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd dashboard && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add dashboard/src/components/transport/FlightLiveStatus.tsx
git commit -m "feat(dashboard): add FlightLiveStatus badge component"
```

---

## Task 12: Dashboard — Render Live Status + Terminals on Transport Cards

**Files:**
- Modify: `dashboard/src/pages/TransportPage.tsx`

- [ ] **Step 1: Add import**

Add after existing imports:

```typescript
import FlightLiveStatus from '../components/transport/FlightLiveStatus';
```

- [ ] **Step 2: Enrich the card header with terminals + airline when flight**

Inside the `{bookings.map((b) => { ... })}` block (starts around line 135), locate the header:

```tsx
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-2xl">{TRANSPORT_ICONS[b.transport_type]}</span>
                      <div>
                        <p className="font-semibold text-ink">
                          {b.from_location} → {b.to_location}
                        </p>
                        <p className="text-sm text-ink/60">{formatDateTime(b.departure_time)}
                          {b.arrival_time && ` → ${formatDateTime(b.arrival_time)}`}
                        </p>
                      </div>
                    </div>
```

Replace with:

```tsx
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-2xl">{TRANSPORT_ICONS[b.transport_type]}</span>
                      <div>
                        <p className="font-semibold text-ink">
                          {b.from_location}{b.departure_terminal ? ` T${b.departure_terminal}` : ''}
                          {' → '}
                          {b.to_location}{b.arrival_terminal ? ` T${b.arrival_terminal}` : ''}
                        </p>
                        <p className="text-sm text-ink/60">
                          {b.airline && <span className="mr-1">{b.airline} ·</span>}
                          {formatDateTime(b.departure_time)}
                          {b.arrival_time && ` → ${formatDateTime(b.arrival_time)}`}
                          {b.aircraft_type && ` · ${b.aircraft_type}`}
                        </p>
                        {b.transport_type === 'flight' && b.reference_number && (
                          <FlightLiveStatus
                            flightIata={b.reference_number.toUpperCase().replace(/\s+/g, '')}
                            departureISO={b.departure_time}
                          />
                        )}
                      </div>
                    </div>
```

- [ ] **Step 3: Typecheck**

Run: `cd dashboard && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add dashboard/src/pages/TransportPage.tsx
git commit -m "feat(dashboard): show terminals, airline, aircraft, and live status on transport cards"
```

---

## Task 13: CLAUDE.md — Document New Env Var + Routes

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the server env vars block**

Find the Railway server env vars list (under "server service env vars:"). Add below the existing optional keys:

```
- `AVIATIONSTACK_API_KEY` — optional, enables flight number lookup + live status (100 req/month free tier)
```

- [ ] **Step 2: Update the Server Routes table**

Locate the row for `flightSearch.ts`:

```
| `flightSearch.ts` | `GET /airports/search` — static bundled airports |
```

Replace with:

```
| `flightSearch.ts` | `GET /airports/search` — static bundled airports; `GET /flights/lookup` — Aviationstack proxy with 24h DB cache; `GET /flights/status` — live status/gate for flights within 24h |
```

- [ ] **Step 3: Update "Server Services" table**

Add a row:

```
| `flightService.ts` | Aviationstack flight lookup + live status; reads/writes `flight_lookup_cache` (24h TTL) |
```

- [ ] **Step 4: Update the DB Schema section**

In the "Caches" list line, change:

```
- **Caches:** `currency_cache`
```

to:

```
- **Caches:** `currency_cache`, `flight_lookup_cache`
```

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add flight lookup + live status to CLAUDE.md"
```

---

## Final Verification (after pushing to Railway)

- [ ] **Push to main:** `git push origin main`

- [ ] **Wait for Railway deploy** — watch the deploy logs; migration 017 should run.

- [ ] **Check env var** — confirm `AVIATIONSTACK_API_KEY` is set on Railway server service (user does this).

- [ ] **Smoke test on deployed dashboard:**
  1. Create/open a trip; go to setup wizard Transport step; type=flight
  2. Type `BA456` into booking ref → spinner → cards appear
  3. Pick a schedule → airline, route, terminals, aircraft, times auto-fill onto your departure date
  4. Save booking
  5. Go to Logistics → Transport — card shows airline, `LHR T5 → FAO T1`, aircraft
  6. Create a booking with a flight in the next 24h → card shows status badge + gate
  7. Type `ZZZ9999` → "not found in recent history" message
  8. Same flight entered by a second traveller → server logs show cache hit (0 Aviationstack calls)
  9. Remove `AVIATIONSTACK_API_KEY` from Railway, redeploy → lookup shows "unavailable" gracefully; re-add key
  10. `npx tsc --noEmit` passes in both `server/` and `dashboard/`

---

## Summary

13 tasks. Each task is a single focused change with a commit. Most tasks are < 5 minutes of edits + typecheck + commit. The plan is structured bottom-up: DB → shared types → service → routes → client → component → integrations → docs. Each layer is verifiable independently.
