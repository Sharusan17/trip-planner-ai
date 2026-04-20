import { Router, Request, Response } from 'express';

const router = Router();

const LITEAPI_BASE = 'https://api.liteapi.travel/v3.0';

interface LiteApiHotel {
  id?: string;
  name?: string;
  address?: string;
  city?: string;
  country?: string;
  starRating?: number;
  rating?: number;
}

/**
 * GET /api/v1/hotels/search?q=hilton+london
 *
 * Proxy for LiteAPI /data/hotels — keeps the API key server-side.
 * Returns PlaceSuggestion[] shaped for the frontend autocomplete.
 */
router.get('/hotels/search', async (req: Request, res: Response) => {
  try {
    const q = (req.query.q as string ?? '').trim();
    if (q.length < 2) return res.json([]);

    const apiKey = process.env.LITEAPI_API_KEY;
    if (!apiKey) {
      // Degrade gracefully if key not configured — frontend falls back to Photon
      return res.status(503).json({ error: 'Hotel search not configured' });
    }

    const url =
      `${LITEAPI_BASE}/data/hotels` +
      `?hotelName=${encodeURIComponent(q)}&limit=8`;

    const upstream = await fetch(url, {
      headers: { 'X-API-Key': apiKey, 'Accept': 'application/json' },
    });

    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: 'LiteAPI error' });
    }

    const payload = await upstream.json();
    const hotels: LiteApiHotel[] = payload.data ?? [];

    const suggestions = hotels
      .filter((h) => h.name)
      .map((h) => {
        const stars = h.starRating ? ' ' + '⭐'.repeat(Math.round(h.starRating)) : '';
        const label = [h.name + stars, h.city, h.country].filter(Boolean).join(', ');
        const addressParts = [h.address, h.city, h.country].filter(Boolean);
        return {
          label,
          name: h.name!,
          address: addressParts.length ? addressParts.join(', ') : undefined,
        };
      });

    res.json(suggestions);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

interface LiteApiAirport {
  iata: string;
  icao?: string;
  name: string;
  city?: string;
  country?: string;
  state?: string;
  lat?: number;
  lon?: number;
  tz?: string;
}

/**
 * GET /api/v1/airports/search?q=LHR  (or ?q=London, ?q=New York)
 *
 * Proxy for LiteAPI GET /data/flights/airports — full airport details.
 * Returns PlaceSuggestion[] with label "JFK — John F Kennedy International, New York, US".
 */
router.get('/airports/search', async (req: Request, res: Response) => {
  try {
    const q = (req.query.q as string ?? '').trim();
    if (q.length < 2) return res.json([]);

    const apiKey = process.env.LITEAPI_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ error: 'Airport search not configured' });
    }

    const url = `${LITEAPI_BASE}/data/flights/airports?q=${encodeURIComponent(q)}`;

    const upstream = await fetch(url, {
      headers: { 'X-API-Key': apiKey, 'Accept': 'application/json' },
    });

    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: 'LiteAPI error' });
    }

    const payload = await upstream.json();
    // Response: { data: [{ airports: [...], count: N }] }
    const airports: LiteApiAirport[] = payload.data?.[0]?.airports ?? [];

    const suggestions = airports
      .filter((a) => a.iata && a.name)
      .slice(0, 8)
      .map((a) => {
        const location = [a.city, a.country].filter(Boolean).join(', ');
        const label = location
          ? `${a.iata} — ${a.name}, ${location}`
          : `${a.iata} — ${a.name}`;
        return {
          label,
          name: `${a.name} (${a.iata})`,
        };
      });

    res.json(suggestions);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
