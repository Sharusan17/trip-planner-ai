import { Router, Request, Response } from 'express';
import pool from '../db/pool';
import { getRate } from '../services/currencyService';

const router = Router();

async function attachTravellers(bookings: Record<string, unknown>[]): Promise<Record<string, unknown>[]> {
  if (bookings.length === 0) return bookings;
  const ids = bookings.map((b) => b.id);
  const result = await pool.query(
    `SELECT accommodation_id, traveller_id FROM accommodation_travellers WHERE accommodation_id = ANY($1)`,
    [ids]
  );
  const map: Record<string, string[]> = {};
  for (const row of result.rows) {
    if (!map[row.accommodation_id]) map[row.accommodation_id] = [];
    map[row.accommodation_id].push(row.traveller_id);
  }
  return bookings.map((b) => ({ ...b, traveller_ids: map[b.id as string] || [] }));
}

// GET /trips/:tripId/accommodation
router.get('/trips/:tripId/accommodation', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT * FROM accommodation_bookings WHERE trip_id = $1 ORDER BY check_in_date`,
      [req.params.tripId]
    );
    const bookings = await attachTravellers(result.rows);
    res.json(bookings.map((b) => ({
      ...b,
      price: b.price ? parseFloat(b.price as string) : null,
      price_home: b.price_home ? parseFloat(b.price_home as string) : null,
    })));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /trips/:tripId/accommodation
router.post('/trips/:tripId/accommodation', async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const { tripId } = req.params;
    const {
      name, address, check_in_date, check_out_date,
      reference_number, price, currency, notes, traveller_ids,
    } = req.body;

    const tripResult = await client.query(`SELECT home_currency FROM trips WHERE id = $1`, [tripId]);
    const homeCurrency: string = tripResult.rows[0]?.home_currency ?? 'GBP';
    let priceHome: number | null = null;
    if (price && currency) {
      try {
        if (currency !== homeCurrency) {
          const { rate } = await getRate(currency, homeCurrency);
          priceHome = Math.round(parseFloat(price) * rate * 100) / 100;
        } else {
          priceHome = parseFloat(price);
        }
      } catch { priceHome = null; }
    }

    await client.query('BEGIN');

    const bookingResult = await client.query(
      `INSERT INTO accommodation_bookings
         (trip_id, name, address, check_in_date, check_out_date, reference_number, price, currency, price_home, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [tripId, name, address || null, check_in_date, check_out_date,
       reference_number || null, price || null, currency || null, priceHome, notes || null]
    );
    const booking = bookingResult.rows[0];

    if (traveller_ids?.length > 0) {
      for (const tid of traveller_ids) {
        await client.query(
          `INSERT INTO accommodation_travellers (accommodation_id, traveller_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
          [booking.id, tid]
        );
      }
    }

    await client.query('COMMIT');

    res.status(201).json({
      ...booking,
      price: booking.price ? parseFloat(booking.price) : null,
      price_home: booking.price_home ? parseFloat(booking.price_home) : null,
      traveller_ids: traveller_ids || [],
    });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: (err as Error).message });
  } finally {
    client.release();
  }
});

// GET /accommodation/:id
router.get('/accommodation/:id', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`SELECT * FROM accommodation_bookings WHERE id = $1`, [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const bookings = await attachTravellers(result.rows);
    const b = bookings[0];
    res.json({
      ...b,
      price: b.price ? parseFloat(b.price as string) : null,
      price_home: b.price_home ? parseFloat(b.price_home as string) : null,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// PUT /accommodation/:id
router.put('/accommodation/:id', async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const {
      name, address, check_in_date, check_out_date,
      reference_number, price, currency, notes, traveller_ids,
    } = req.body;

    const existing = await client.query(
      `SELECT * FROM accommodation_bookings WHERE id = $1`,
      [req.params.id]
    );
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const prev = existing.rows[0];

    const newPrice = price !== undefined ? parseFloat(price) : (prev.price ? parseFloat(prev.price) : null);
    const newCurrency = currency ?? prev.currency;
    const tripResult = await client.query(`SELECT home_currency FROM trips WHERE id = $1`, [prev.trip_id]);
    const homeCurrency: string = tripResult.rows[0]?.home_currency ?? 'GBP';
    let priceHome: number | null = prev.price_home ? parseFloat(prev.price_home) : null;
    if (price !== undefined || currency !== undefined) {
      try {
        if (newPrice && newCurrency && newCurrency !== homeCurrency) {
          const { rate } = await getRate(newCurrency, homeCurrency);
          priceHome = Math.round(newPrice * rate * 100) / 100;
        } else if (newPrice) {
          priceHome = newPrice;
        }
      } catch { priceHome = null; }
    }

    await client.query('BEGIN');

    const updResult = await client.query(
      `UPDATE accommodation_bookings SET
         name = COALESCE($1, name),
         address = COALESCE($2, address),
         check_in_date = COALESCE($3, check_in_date),
         check_out_date = COALESCE($4, check_out_date),
         reference_number = COALESCE($5, reference_number),
         price = $6, currency = $7, price_home = $8,
         notes = COALESCE($9, notes),
         updated_at = NOW()
       WHERE id = $10 RETURNING *`,
      [name ?? null, address ?? null, check_in_date ?? null, check_out_date ?? null,
       reference_number ?? null, newPrice, newCurrency, priceHome,
       notes ?? null, req.params.id]
    );
    const booking = updResult.rows[0];

    if (traveller_ids !== undefined) {
      await client.query(
        `DELETE FROM accommodation_travellers WHERE accommodation_id = $1`,
        [req.params.id]
      );
      for (const tid of traveller_ids) {
        await client.query(
          `INSERT INTO accommodation_travellers (accommodation_id, traveller_id) VALUES ($1,$2)`,
          [req.params.id, tid]
        );
      }
    }

    await client.query('COMMIT');

    const tResult = await client.query(
      `SELECT traveller_id FROM accommodation_travellers WHERE accommodation_id = $1`,
      [req.params.id]
    );
    res.json({
      ...booking,
      price: booking.price ? parseFloat(booking.price) : null,
      price_home: booking.price_home ? parseFloat(booking.price_home) : null,
      traveller_ids: tResult.rows.map((r) => r.traveller_id),
    });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: (err as Error).message });
  } finally {
    client.release();
  }
});

// DELETE /accommodation/:id
router.delete('/accommodation/:id', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `DELETE FROM accommodation_bookings WHERE id = $1 RETURNING id`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
