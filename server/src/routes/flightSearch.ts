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
 * GET /api/v1/flights/lookup?iata=BA456&date=2026-05-15
 *
 * Returns a single-element array with the flight's schedule on the given date
 * (or today if date is omitted). Cache-read-through to FlightAPI.io, 24h TTL.
 */
router.get('/flights/lookup', async (req: Request, res: Response) => {
  const raw = (req.query.iata as string ?? '').trim().toUpperCase().replace(/\s+/g, '');
  const date = (req.query.date as string ?? '').trim();
  if (!/^([A-Z0-9]{2}|[A-Z]{3})\d{1,4}[A-Z]?$/.test(raw)) {
    return res.status(400).json({ error: 'Invalid flight IATA format' });
  }
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Invalid date format (expected YYYY-MM-DD)' });
  }
  try {
    const instances = await lookupFlight(raw, date || undefined);
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
  if (!/^([A-Z0-9]{2}|[A-Z]{3})\d{1,4}[A-Z]?$/.test(iata)) {
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
