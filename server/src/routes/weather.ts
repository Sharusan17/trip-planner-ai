import { Router, Request, Response } from 'express';
import { fetchWeather } from '../services/weatherService';

const router = Router();

// GET /api/v1/weather?lat=X&lng=Y
router.get('/', async (req: Request, res: Response) => {
  try {
    const lat = parseFloat(req.query.lat as string);
    const lng = parseFloat(req.query.lng as string);

    if (isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({ error: 'lat and lng are required' });
    }

    const data = await fetchWeather(lat, lng);
    // Tell browsers/CDN to cache for 1 h; serve stale up to 1 h more while revalidating.
    res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=3600');
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
