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
 * Degrades gracefully (503) if LITEAPI_API_KEY is not configured.
 */
router.get('/hotels/search', async (req: Request, res: Response) => {
  try {
    const q = (req.query.q as string ?? '').trim();
    if (q.length < 2) return res.json([]);

    const apiKey = process.env.LITEAPI_API_KEY;
    if (!apiKey) {
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

export default router;
