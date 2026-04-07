import { Router, Request, Response } from 'express';
import { getRate } from '../services/currencyService';

const router = Router();

// GET /api/v1/currency?from=GBP&to=EUR&amount=100
router.get('/', async (req: Request, res: Response) => {
  try {
    const from = (req.query.from as string || 'GBP').toUpperCase();
    const to = (req.query.to as string || 'EUR').toUpperCase();
    const amount = parseFloat(req.query.amount as string) || 1;

    const { rate, fetched_at } = await getRate(from, to);

    res.json({
      from,
      to,
      amount,
      converted: Math.round(amount * rate * 100) / 100,
      rate,
      fetched_at,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/v1/currency/rate?from=GBP&to=EUR
router.get('/rate', async (req: Request, res: Response) => {
  try {
    const from = (req.query.from as string || 'GBP').toUpperCase();
    const to = (req.query.to as string || 'EUR').toUpperCase();

    const { rate, fetched_at } = await getRate(from, to);

    res.json({ base: from, target: to, rate, fetched_at });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
