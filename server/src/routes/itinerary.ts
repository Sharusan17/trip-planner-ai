import { Router, Request, Response } from 'express';
import pool from '../db/pool';
import { createLinkedExpense, syncLinkedExpense } from '../utils/autoExpense';

const router = Router();

// GET /api/v1/trips/:tripId/days — all days with activities
router.get('/trips/:tripId/days', async (req: Request, res: Response) => {
  try {
    const daysResult = await pool.query(
      'SELECT * FROM itinerary_days WHERE trip_id = $1 ORDER BY date, day_number',
      [req.params.tripId]
    );

    // Deduplicate: if multiple rows share the same date, keep only the first (oldest day_number)
    const seen = new Set<string>();
    const days = daysResult.rows.filter((d: any) => {
      const key = String(d.date).slice(0, 10);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (days.length === 0) {
      return res.json([]);
    }

    const dayIds = days.map((d: any) => d.id);
    const activitiesResult = await pool.query(
      'SELECT * FROM activities WHERE day_id = ANY($1) ORDER BY sort_order, time',
      [dayIds]
    );

    const activitiesByDay = new Map<string, any[]>();
    for (const a of activitiesResult.rows) {
      if (!activitiesByDay.has(a.day_id)) {
        activitiesByDay.set(a.day_id, []);
      }
      activitiesByDay.get(a.day_id)!.push(a);
    }

    const result = days.map((d: any) => ({
      ...d,
      activities: activitiesByDay.get(d.id) || [],
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /api/v1/trips/:tripId/days
router.post('/trips/:tripId/days', async (req: Request, res: Response) => {
  try {
    const { date, day_number, title, notes } = req.body;
    const result = await pool.query(
      `INSERT INTO itinerary_days (trip_id, date, day_number, title, notes)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.params.tripId, date, day_number, title || null, notes || null]
    );
    res.status(201).json({ ...result.rows[0], activities: [] });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// PUT /api/v1/days/:dayId
router.put('/days/:dayId', async (req: Request, res: Response) => {
  try {
    const { title, notes, date, day_number } = req.body;
    const result = await pool.query(
      `UPDATE itinerary_days SET title = COALESCE($1, title), notes = COALESCE($2, notes),
       date = COALESCE($3, date), day_number = COALESCE($4, day_number)
       WHERE id = $5 RETURNING *`,
      [title, notes, date, day_number, req.params.dayId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Day not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// DELETE /api/v1/days/:dayId
router.delete('/days/:dayId', async (req: Request, res: Response) => {
  try {
    const result = await pool.query('DELETE FROM itinerary_days WHERE id = $1 RETURNING id', [req.params.dayId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Day not found' });
    }
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /api/v1/days/:dayId/activities
router.post('/days/:dayId/activities', async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const { time, type, description, notes, location_tag, latitude, longitude, kid_friendly, price, currency, created_by } = req.body;

    // Look up trip_id + date from the day, and home_currency from the trip
    const dayResult = await client.query(
      `SELECT d.id, d.date, d.trip_id, t.home_currency
       FROM itinerary_days d JOIN trips t ON t.id = d.trip_id
       WHERE d.id = $1`,
      [req.params.dayId]
    );
    if (dayResult.rows.length === 0) return res.status(404).json({ error: 'Day not found' });
    const day = dayResult.rows[0];
    const homeCurrency: string = day.home_currency;
    const tripId: string = day.trip_id;

    // Resolve paid_by
    let paidBy: string = created_by || '';
    if (!paidBy && price) {
      const orgResult = await client.query(
        `SELECT id FROM travellers WHERE trip_id=$1 AND role='organiser' LIMIT 1`, [tripId]
      );
      paidBy = orgResult.rows[0]?.id ?? '';
    }

    const maxOrder = await client.query(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order FROM activities WHERE day_id = $1',
      [req.params.dayId]
    );

    await client.query('BEGIN');

    const result = await client.query(
      `INSERT INTO activities (day_id, time, type, description, notes, location_tag, latitude, longitude, kid_friendly, sort_order, price, currency, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
      [
        req.params.dayId, time || null, type || 'custom', description,
        notes || null, location_tag || null, latitude || null, longitude || null,
        kid_friendly ?? true, maxOrder.rows[0].next_order,
        price ? parseFloat(price) : null, currency || null, paidBy || null,
      ]
    );
    const activity = result.rows[0];

    // Auto-create flagged expense if activity has a price
    if (price && currency && paidBy) {
      const allTravellers = await client.query(
        `SELECT id FROM travellers WHERE trip_id=$1`, [tripId]
      );
      const travellerIds: string[] = allTravellers.rows.map((r: any) => r.id);
      if (travellerIds.length > 0) {
        const expenseId = await createLinkedExpense(client, {
          tripId, paidBy, amount: parseFloat(price), currency, homeCurrency,
          description: description, category: 'activities',
          expenseDate: new Date().toISOString().split('T')[0],
          travellerIds,
        });
        if (expenseId) {
          await client.query(`UPDATE activities SET linked_expense_id=$1 WHERE id=$2`, [expenseId, activity.id]);
          activity.linked_expense_id = expenseId;
        }
      }
    }

    await client.query('COMMIT');
    res.status(201).json({
      ...activity,
      price: activity.price ? parseFloat(activity.price) : null,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: (err as Error).message });
  } finally {
    client.release();
  }
});

// PUT /api/v1/activities/:id
router.put('/activities/:id', async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const { time, type, description, notes, location_tag, latitude, longitude, kid_friendly, price, currency } = req.body;

    // Fetch existing activity + day + trip
    const existingResult = await client.query(
      `SELECT a.*, d.date, d.trip_id, t.home_currency
       FROM activities a
       JOIN itinerary_days d ON d.id = a.day_id
       JOIN trips t ON t.id = d.trip_id
       WHERE a.id = $1`,
      [req.params.id]
    );
    if (existingResult.rows.length === 0) return res.status(404).json({ error: 'Activity not found' });
    const prev = existingResult.rows[0];
    const homeCurrency: string = prev.home_currency;
    const tripId: string = prev.trip_id;

    const newPrice = price !== undefined ? (price ? parseFloat(price) : null) : (prev.price ? parseFloat(prev.price) : null);
    const newCurrency = currency ?? prev.currency;

    await client.query('BEGIN');

    const result = await client.query(
      `UPDATE activities SET time = COALESCE($1, time), type = COALESCE($2, type),
       description = COALESCE($3, description), notes = $4,
       location_tag = COALESCE($5, location_tag),
       latitude = COALESCE($6, latitude), longitude = COALESCE($7, longitude),
       kid_friendly = COALESCE($8, kid_friendly),
       price = $9, currency = $10
       WHERE id = $11 RETURNING *`,
      [time, type, description, notes || null, location_tag, latitude, longitude, kid_friendly,
       newPrice, newCurrency || null, req.params.id]
    );
    const activity = result.rows[0];

    // Sync linked expense if price provided and paid_by known
    const paidBy: string = prev.created_by ?? '';
    if (newPrice && newCurrency && paidBy) {
      const allTravellers = await client.query(`SELECT id FROM travellers WHERE trip_id=$1`, [tripId]);
      const travellerIds: string[] = allTravellers.rows.map((r: any) => r.id);
      if (travellerIds.length > 0) {
        if (prev.linked_expense_id) {
          await syncLinkedExpense(client, {
            expenseId: prev.linked_expense_id, amount: newPrice, currency: newCurrency,
            homeCurrency, description: activity.description, travellerIds,
          });
        } else {
          const expenseId = await createLinkedExpense(client, {
            tripId, paidBy, amount: newPrice, currency: newCurrency, homeCurrency,
            description: activity.description, category: 'activities',
            expenseDate: new Date().toISOString().split('T')[0],
            travellerIds,
          });
          if (expenseId) {
            await client.query(`UPDATE activities SET linked_expense_id=$1 WHERE id=$2`, [expenseId, req.params.id]);
          }
        }
      }
    }

    await client.query('COMMIT');
    res.json({
      ...activity,
      price: activity.price ? parseFloat(activity.price) : null,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: (err as Error).message });
  } finally {
    client.release();
  }
});

// DELETE /api/v1/activities/:id
router.delete('/activities/:id', async (req: Request, res: Response) => {
  try {
    // Fetch the activity first so we can delete any linked expense
    const existing = await pool.query(
      `SELECT id, linked_expense_id FROM activities WHERE id = $1`, [req.params.id]
    );
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Activity not found' });

    const { linked_expense_id } = existing.rows[0];

    // Delete linked expense (and its splits, via FK cascade) before deleting the activity
    if (linked_expense_id) {
      await pool.query(`DELETE FROM expense_splits WHERE expense_id = $1`, [linked_expense_id]);
      await pool.query(`DELETE FROM expenses WHERE id = $1`, [linked_expense_id]);
    }

    await pool.query('DELETE FROM activities WHERE id = $1', [req.params.id]);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// PATCH /api/v1/days/:dayId/activities/reorder
router.patch('/days/:dayId/activities/reorder', async (req: Request, res: Response) => {
  try {
    const { orderedIds } = req.body as { orderedIds: string[] };
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (let i = 0; i < orderedIds.length; i++) {
        await client.query(
          'UPDATE activities SET sort_order = $1 WHERE id = $2 AND day_id = $3',
          [i, orderedIds[i], req.params.dayId]
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    res.json({ reordered: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
