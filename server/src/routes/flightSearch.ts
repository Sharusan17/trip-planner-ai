import { Router, Request, Response } from 'express';
import { searchAirports } from '../services/airportCache';

const router = Router();

const AVIATIONSTACK_BASE = 'https://api.aviationstack.com/v1';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Convert an ISO timestamp to datetime-local format (YYYY-MM-DDTHH:MM). */
function toDatetimeLocal(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined;
  try {
    return new Date(iso).toISOString().slice(0, 16);
  } catch {
    return undefined;
  }
}

// ── Airport autocomplete ──────────────────────────────────────────────────────

/**
 * GET /api/v1/airports/search?q=LHR
 *
 * Filters the in-process airport cache (loaded from GitHub at startup).
 * Zero Aviationstack API calls — no rate limits.
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

// ── Flight number lookup ──────────────────────────────────────────────────────

/**
 * GET /api/v1/flights/lookup?iata=BA456
 *
 * Returns the most recent flight matching the IATA code.
 * Works on Aviationstack free tier for current-day and recent past flights.
 * Returns 404 if the flight is not yet in the live feed (e.g. future booking).
 */
router.get('/flights/lookup', async (req: Request, res: Response) => {
  const iata = ((req.query.iata as string) ?? '').trim().toUpperCase();
  if (!iata) return res.status(400).json({ error: 'iata parameter required' });

  const key = process.env.AVIATIONSTACK_API_KEY;
  if (!key) return res.status(503).json({ error: 'Flight lookup not configured' });

  try {
    const url =
      `${AVIATIONSTACK_BASE}/flights` +
      `?access_key=${encodeURIComponent(key)}` +
      `&flight_iata=${encodeURIComponent(iata)}` +
      `&limit=1`;

    const upstream = await fetch(url);
    if (!upstream.ok) return res.status(upstream.status).json({ error: 'Aviationstack error' });

    const payload = await upstream.json();
    const flights: any[] = payload.data ?? [];

    if (flights.length === 0) {
      return res.status(404).json({
        error: 'Flight not found in live feed. It may be too far in the future — enter details manually.',
      });
    }

    const f = flights[0];
    res.json({
      flightNumber:     f.flight?.iata ?? iata,
      airline:          f.airline?.name ?? '',
      from_location:    f.departure?.airport ? `${f.departure.airport} (${f.departure.iata})` : '',
      to_location:      f.arrival?.airport   ? `${f.arrival.airport} (${f.arrival.iata})`     : '',
      departure_time:   toDatetimeLocal(f.departure?.scheduled),
      arrival_time:     toDatetimeLocal(f.arrival?.scheduled),
      status:           f.flight_status ?? '',
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── Route search ──────────────────────────────────────────────────────────────

/**
 * GET /api/v1/flights/search?dep=LHR&arr=FAO&date=2024-07-15
 *
 * Returns all flights on a route for the given date.
 * Free tier: works for today and past dates.
 * Future dates: Aviationstack returns empty — client shows a graceful message.
 */
router.get('/flights/search', async (req: Request, res: Response) => {
  const dep  = ((req.query.dep  as string) ?? '').trim().toUpperCase();
  const arr  = ((req.query.arr  as string) ?? '').trim().toUpperCase();
  const date = ((req.query.date as string) ?? '').trim();

  if (!dep || !arr) return res.status(400).json({ error: 'dep and arr parameters required' });

  const key = process.env.AVIATIONSTACK_API_KEY;
  if (!key) return res.status(503).json({ error: 'Flight search not configured' });

  try {
    let url =
      `${AVIATIONSTACK_BASE}/flights` +
      `?access_key=${encodeURIComponent(key)}` +
      `&dep_iata=${encodeURIComponent(dep)}` +
      `&arr_iata=${encodeURIComponent(arr)}` +
      `&limit=20`;

    if (date) url += `&flight_date=${encodeURIComponent(date)}`;

    const upstream = await fetch(url);
    if (!upstream.ok) return res.status(upstream.status).json({ error: 'Aviationstack error' });

    const payload = await upstream.json();
    const flights: any[] = payload.data ?? [];

    const results = flights
      .filter((f) => f.flight?.iata)
      .map((f) => ({
        flightNumber:   f.flight.iata,
        airline:        f.airline?.name ?? '',
        from_location:  f.departure?.airport ? `${f.departure.airport} (${f.departure.iata})` : dep,
        to_location:    f.arrival?.airport   ? `${f.arrival.airport} (${f.arrival.iata})`     : arr,
        departure_time: toDatetimeLocal(f.departure?.scheduled),
        arrival_time:   toDatetimeLocal(f.arrival?.scheduled),
        status:         f.flight_status ?? '',
      }));

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
