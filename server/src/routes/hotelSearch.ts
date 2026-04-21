import { Router, Request, Response } from 'express';
import { createLogger } from '../utils/logger';

const log = createLogger('hotel');
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
      log.warn('LITEAPI_API_KEY not configured — hotel search unavailable');
      return res.status(503).json({ error: 'Hotel search not configured' });
    }

    const url =
      `${LITEAPI_BASE}/data/hotels` +
      `?hotelName=${encodeURIComponent(q)}&limit=8`;

    const start = Date.now();
    const upstream = await fetch(url, {
      headers: { 'X-API-Key': apiKey, 'Accept': 'application/json' },
    });
    const dur = Date.now() - start;

    if (!upstream.ok) {
      const bodyText = await upstream.text().catch(() => '');
      log.warn(`LiteAPI HTTP ${upstream.status} for "${q}" in ${dur}ms`, { bodyPreview: bodyText.slice(0, 300) });
      return res.status(upstream.status).json({ error: 'LiteAPI error' });
    }

    const payload = await upstream.json();
    const hotels: LiteApiHotel[] = payload.data ?? [];
    log.info(`search "${q}" → ${hotels.length} results in ${dur}ms`);

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
    log.error('unexpected error', { message: (err as Error).message, stack: (err as Error).stack });
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
