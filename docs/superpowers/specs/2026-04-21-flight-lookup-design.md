# Flight Lookup by Reference Number — Design

**Date:** 2026-04-21
**Status:** Approved, ready for implementation plan

## Problem

When a user adds a flight booking (in the setup wizard or the standalone transport form), they currently enter every field by hand: airline, from/to airports, departure time, arrival time, terminals, aircraft. Most of this information is derivable from the flight number alone. We want a smarter, low-friction way to auto-fill these details by typing the flight number, plus richer stored detail (terminals, aircraft) and a live status/gate indicator when the flight is imminent.

## Constraints

- **Aviationstack free tier:** 100 requests/month. Endpoints `GET /v1/flights` (real-time + recent days) work on free plan. `GET /v1/flightsFuture` (future schedules) is **paid-only** and must not be used.
- **Flights in the future (user's booking):** the free endpoint returns nothing for future dates. We must work with *recent instance data* as a proxy for the flight's schedule.
- **Deployment:** Railway only. No localhost; all changes verified on deployed URLs.
- **No breaking changes** to existing transport bookings — all new DB columns are nullable.

## High-Level Approach

Type a flight number → server fans out to Aviationstack for the last 7 days of that flight → group by unique schedule signature → user picks a schedule → times and details copy onto their booking date. A shared DB cache (24h TTL keyed by `flight_iata, flight_date`) ensures subsequent lookups of the same flight are free.

Separately, when a flight booking's departure is within 24h, the booking card fetches live status + gate from Aviationstack and shows a badge.

## Scope

**In scope:**
1. Flight number lookup with debounced auto-fetch
2. Group-by-schedule display of recent instances
3. Auto-fill of `airline`, `from_location`, `to_location`, `departure_terminal`, `arrival_terminal`, `aircraft_type`, `departure_time` (hours/mins only), `arrival_time`
4. New DB columns for the richer fields
5. Shared `flight_lookup_cache` table (24h TTL)
6. Live status/gate on booking cards within 24h of departure
7. Integration into both `SetupStepTransport.tsx` and `TransportBookingFormPage.tsx`

**Out of scope:**
1. Paid `flightsFuture` endpoint
2. Airport autocomplete changes (already uses static bundle)
3. Non-flight transport types
4. Storing gate/status in DB (always live)
5. Multi-leg / connecting flight lookup
6. Post-booking flight schedule change alerts

---

## Data Model

### New table: `flight_lookup_cache`

Shared across all trips and users. Populated on-demand; entries older than 48h cleaned up on server startup.

```sql
CREATE TABLE flight_lookup_cache (
  flight_iata TEXT NOT NULL,
  flight_date DATE NOT NULL,
  data JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (flight_iata, flight_date)
);

CREATE INDEX idx_flight_cache_fetched ON flight_lookup_cache(fetched_at);
```

`data` stores the full Aviationstack flight object (the single element matching `(iata, date)`, or `null` if the API returned no result for that day — we cache negatives too so we don't re-query an empty day).

### New columns on `transport_bookings`

All nullable, all text.

```sql
ALTER TABLE transport_bookings
  ADD COLUMN airline TEXT,
  ADD COLUMN departure_terminal TEXT,
  ADD COLUMN arrival_terminal TEXT,
  ADD COLUMN aircraft_type TEXT;
```

### Never stored (always live-fetched)

- `flight_status` — `scheduled / active / landed / cancelled / delayed / diverted`
- `departure_gate` — e.g. `B44`
- `departure_delay_minutes`
- `arrival_gate`

---

## Server

### `airportCache.ts`
Already in place. Unchanged.

### `flightService.ts` (new)

Thin wrapper around Aviationstack with cache read-through.

```typescript
interface FlightInstance {
  flight_iata: string;          // "BA456"
  flight_date: string;          // "2026-04-21"
  airline: string;              // "British Airways"
  departure_iata: string;       // "LHR"
  departure_airport: string;    // "London Heathrow Airport"
  departure_terminal: string | null;
  departure_time_local: string; // "08:00" — HH:MM in departure timezone
  arrival_iata: string;
  arrival_airport: string;
  arrival_terminal: string | null;
  arrival_time_local: string;   // "11:15"
  aircraft_type: string | null; // "A320"
}

interface FlightLiveStatus {
  flight_status: string;
  departure_gate: string | null;
  departure_delay_minutes: number | null;
  arrival_gate: string | null;
}

async function lookupFlight(iata: string): Promise<FlightInstance[]>;
async function getLiveStatus(iata: string, date: string): Promise<FlightLiveStatus | null>;
```

**`lookupFlight(iata)`** — generates the list of the last 7 dates (today + 6 previous). For each, check cache; if miss, add to fetch-batch. Parallel-fetch misses from Aviationstack (`Promise.all`). Persist fresh results. Return all non-null instances sorted most-recent-first.

**`getLiveStatus(iata, date)`** — single Aviationstack call, in-memory 5-minute cache (module-level `Map`).

### `flightSearch.ts` — new routes added

```
GET  /api/v1/flights/lookup?iata=BA456
GET  /api/v1/flights/status?iata=BA456&date=2026-04-21
```

Both return `404` with `{ error: "..." }` on API failure; the UI handles this as "enter manually" gracefully.

### Cache cleanup

On server startup, run once:
```sql
DELETE FROM flight_lookup_cache WHERE fetched_at < NOW() - INTERVAL '48 hours'
```

### Environment

- Re-add `AVIATIONSTACK_API_KEY` to `.env.example` and Railway (user sets this)
- If missing at startup, log warning and make both routes return `503 { error: "Flight lookup not configured" }`

---

## Dashboard: `FlightLookup` Component

**Location:** `dashboard/src/components/transport/FlightLookup.tsx`

### Props

```typescript
interface Props {
  flightNumber: string;       // current reference_number value
  bookingDate: string;        // YYYY-MM-DD — used for UX copy and date-matching hint
  onAutoFill: (data: FlightAutoFill) => void;
}

interface FlightAutoFill {
  airline: string;
  from_location: string;      // "London Heathrow Airport (LHR)"
  to_location: string;
  departure_terminal: string | null;
  arrival_terminal: string | null;
  aircraft_type: string | null;
  departure_time_hhmm: string; // "08:00" — consumer merges with bookingDate
  arrival_time_hhmm: string;
}
```

### Behavior

- Debounce: 500ms after last keystroke
- Min length: 4 characters before lookup fires
- Input format normalisation: strip spaces, uppercase (`ba 456` → `BA456`)
- React Query hook keyed on `['flight-lookup', iata]`; stale time 1h
- Only renders when parent passes flight-type context

### Grouping logic

After receiving `FlightInstance[]`, group by **schedule signature**:

```
signature = `${departure_iata}-${arrival_iata}-${departure_time_local}-${arrival_time_local}`
```

For each unique signature, build a `ScheduleGroup`:
```typescript
interface ScheduleGroup {
  instances: FlightInstance[];     // all dates sharing this signature
  dayNames: string[];               // ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
  // — whichever days appear in the group
  sample: FlightInstance;          // one representative (most recent)
}
```

### States

1. **Idle** — no card shown (input empty or < 4 chars)
2. **Searching** — small spinner + "Looking up BA456…" next to the field
3. **One schedule found** — one card:
   ```
   ✈ British Airways · BA456
   LHR T5 → FAO T1
   08:00 → 11:15   (3h 15m)
   A320 · Flown daily in the last 7 days
   [Use this schedule]
   ```
4. **Multiple schedules found** — stacked cards, each labelled with the days it applies to:
   ```
   Recent BA456 schedules — pick one to use for your 21 May flight

   ┌ British Airways · LHR T5 → FAO T1 ──────────┐
   │ 08:00 → 11:15   Mon Tue Wed Thu Fri        │
   │ A320                         [Use this →]  │
   └─────────────────────────────────────────────┘
   ┌ British Airways · LHR T5 → FAO T1 ──────────┐
   │ 09:30 → 12:45   Sat Sun                    │
   │ A320                         [Use this →]  │
   └─────────────────────────────────────────────┘
   ```
5. **No results** — "Flight not found in recent history. Enter details manually."
6. **Error / not configured** — "Flight lookup unavailable. Enter details manually." (Red-free; neutral tone.)

### On "Use this"

Component calls `onAutoFill` with the sample's data. Terminals are stored as Aviationstack returns them (typically `"5"` or `"Terminal 5"` — normalised client-side to the bare identifier, e.g. `"5"`). UI renders them prefixed with `T` (e.g. `T5`).

Consumer merges `departure_time_hhmm` with existing `bookingDate` to produce the final `departure_time` datetime. Same for arrival.

**The booking date is never overwritten** — only hours/mins are applied.

---

## Booking Card Live Status

In `LogisticsPage.tsx`, for each `transport_booking` where `transport_type === 'flight'`:

1. Compute `isImminent = departure_time is within next 24h`
2. If imminent, a `<FlightLiveStatus>` sub-component hooks `useQuery` on `['flight-status', iata, date]`
3. Display badge inline on the card:
   ```
   ✈ British Airways · BA456
   LHR T5 → FAO T1
   08:00 · Gate B44    11:15
   [🟢 On time]
   ```
4. Status → badge colour mapping:
   - `scheduled` / `active` → green "On time" (or delay minutes if > 0 → amber "Delayed 15min")
   - `landed` → grey "Landed"
   - `cancelled` → red "Cancelled"
   - `diverted` → amber "Diverted"

5. Not imminent → only stored fields shown; no API call.

---

## Integration

### `SetupStepTransport.tsx`

When `draft.transport_type === 'flight'`:
- Reference number input gets `<FlightLookup>` below it
- `onAutoFill` updates all draft fields atomically (single `setDraft` call)

### `TransportBookingFormPage.tsx`

Same pattern: `<FlightLookup>` below reference field when type is flight.

### `LogisticsPage.tsx`

Transport cards check `isImminent` and render `<FlightLiveStatus>` inline.

### Shared type: `TransportBooking`

Add optional fields:
```typescript
airline?: string;
departure_terminal?: string;
arrival_terminal?: string;
aircraft_type?: string;
```

### `transport.ts` (server route)

- `POST /transport` — accept new fields in body; write through
- `PATCH /transport/:id` — accept new fields; partial update
- `GET` endpoints — return new fields in response

---

## API Budget Math

- **First lookup of a flight (cache cold):** 7 requests
- **Subsequent lookups within 24h (any user, any trip):** 0 requests
- **Live status check:** 1 request per card-render per 5-min window, **only when flight is within 24h of departure**

Realistic monthly load for a small user base:
- 10 distinct flights entered across all trips × 7 requests = 70 reqs/mo for lookups
- ~30 live-status checks (flights in the 24h window get ~3 views each) = 30 reqs/mo
- **Total ~100 reqs/mo** — right at the free-tier limit, with caching making it sustainable.

If usage exceeds the limit, Aviationstack returns HTTP 429 → server returns `503`, UI shows "Flight lookup unavailable".

---

## Error Handling

| Situation | Response |
|---|---|
| No API key configured | Routes return `503 { error: "Flight lookup not configured" }`, UI shows neutral "unavailable" |
| Aviationstack rate-limited | Same as above |
| Aviationstack 5xx | Cache miss not persisted; UI shows "unavailable" |
| Aviationstack returns empty for a date | Cache the empty result as `null`; count as negative hit |
| All 7 days empty | UI shows "Flight not found in recent history" |
| Network timeout (5s) | Abort, UI shows "unavailable" |
| Invalid IATA format (user typo) | Client-side regex gate `^[A-Z]{2,3}\d{1,4}$` — no request fires |

---

## Testing (Manual, on Railway)

1. Open trip setup, add a transport entry, type = flight
2. Type `BA456` in reference — after 500ms see spinner, then card(s)
3. Pick a schedule → confirm airline, route, terminals, aircraft, times auto-fill; date stays as user set
4. Type `ZZZ9999` → "Flight not found in recent history"
5. Pick a flight with departure in the next 24h → card shows live status badge and gate
6. Pick a flight 3+ months out → no live fetch, just stored details
7. Same flight looked up from a second device → server logs show cache hit (0 Aviationstack calls)
8. Remove `AVIATIONSTACK_API_KEY` from Railway → lookup shows "unavailable" gracefully
9. `npx tsc --noEmit` passes in both `server/` and `dashboard/`

---

## File Changes

### New
1. `server/src/services/flightService.ts`
2. `dashboard/src/components/transport/FlightLookup.tsx`
3. `dashboard/src/components/transport/FlightLiveStatus.tsx`
4. `dashboard/src/api/flights.ts` — client for `/flights/lookup` and `/flights/status`

### Modified
5. `server/src/db/migrate.ts` — append migration block for new table + columns
6. `server/src/routes/flightSearch.ts` — add `/flights/lookup` and `/flights/status`
7. `server/src/app.ts` — call cache cleanup on startup
8. `server/src/routes/transport.ts` — accept/return new fields
9. `server/.env.example` — re-add `AVIATIONSTACK_API_KEY`
10. `shared/src/types/transport.ts` — new optional fields on `TransportBooking`
11. `dashboard/src/components/setup/SetupStepTransport.tsx` — integrate `FlightLookup`
12. `dashboard/src/pages/TransportBookingFormPage.tsx` — integrate `FlightLookup`
13. `dashboard/src/pages/LogisticsPage.tsx` — integrate `FlightLiveStatus`
14. `CLAUDE.md` — mention Aviationstack env var + cache table in env/routes sections
