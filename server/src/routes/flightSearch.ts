import { Router, Request, Response } from 'express';
import { searchAirports } from '../services/airportCache';

const router = Router();

/**
 * GET /api/v1/airports/search?q=LHR
 *
 * Filters the in-process airport cache (loaded from GitHub on first use).
 * Zero external API calls — no rate limits, no key required.
 */
router.get('/airports/search', async (req: Request, res: Response) => {
  const q = (req.query.q as string ?? '').trim();
  if (q.length < 2) return res.json([]);

  const airports = await searchAirports(q);
  const suggestions = airports.map((a) => {
    const location = [a.city, a.country].filter(Boolean).join(', ');
    const label = location
      ? `${a.iata} — ${a.name}, ${location}`
      : `${a.iata} — ${a.name}`;
    return { label, name: `${a.name} (${a.iata})` };
  });

  res.json(suggestions);
});

export default router;
