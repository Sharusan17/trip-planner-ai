import { Router, Request, Response } from 'express';
import pool from '../db/pool';
import type { PoolClient } from 'pg';
import { getRate } from '../services/currencyService';

const router = Router();

async function syncExpenseForActivity(
  activityId: string, description: string,
  cost: number | null, costCurrency: string | null,
  dayDate: string, tripId: string
): Promise<void> {
  if (!cost || cost <= 0 || !costCurrency) return;
  const client: PoolClient = await pool.connect();
  try {
    const tripRes = await client.query(`SELECT home_currency FROM trips WHERE id=$1`, [tripId]);
    const homeCurrency: string = tripRes.rows[0]?.home_currency ?? 'GBP';
    let amountHome: number | null = null;
    try {
      if (costCurrency !== homeCurrency) {
        const { rate } = await getRate(costCurrency, homeCurrency);
        amountHome = Math.round(cost * rate * 100) / 100;
      } else {
        amountHome = cost;
      }
    } catch { amountHome = null; }

    await client.query('BEGIN');
    const existing = await client.query(
      `SELECT id FROM expenses WHERE activity_id=$1`, [activityId]
    );
    if (existing.rows.length > 0) {
      const expId = existing.rows[0].id as string;
      await client.query(
        `UPDATE expenses SET amount=$1, currency=$2, amount_home=$3, description=$4, expense_date=$5, updated_at=NOW() WHERE id=$6`,
        [cost, costCurrency, amountHome, description, dayDate, expId]
      );
      const splitsRes = await client.query(`SELECT traveller_id FROM expense_splits WHERE expense_id=$1`, [expId]);
      if (splitsRes.rows.length > 0) {
        const tIds: string[] = splitsRes.rows.map((r: { traveller_id: string }) => r.traveller_id);
        await client.query(`DELETE FROM expense_splits WHERE expense_id=$1`, [expId]);
        for (let i = 0; i < tIds.length; i++) {
          const base = Math.floor(cost * 100 / tIds.length) / 100;
          const rem  = i === 0 ? Math.round((cost - base * tIds.length) * 100) / 100 : 0;
          const splitAmt  = base + rem;
          const splitHome = amountHome ? Math.round(splitAmt * amountHome / cost * 100) / 100 : null;
          await client.query(
            `INSERT INTO expense_splits (expense_id, traveller_id, amount, amount_home) VALUES ($1,$2,$3,$4)`,
            [expId, tIds[i], splitAmt, splitHome]
          );
        }
      }
    } else {
      const paidByRes = await client.query(
        `SELECT id FROM travellers WHERE trip_id=$1 ORDER BY CASE WHEN role='organiser' THEN 0 ELSE 1 END, created_at LIMIT 1`,
        [tripId]
      );
      if (paidByRes.rows.length === 0) { await client.query('ROLLBACK'); return; }
      const paidBy = paidByRes.rows[0].id as string;
      const tRes = await client.query(`SELECT id FROM travellers WHERE trip_id=$1 ORDER BY created_at`, [tripId]);
      const tIds: string[] = tRes.rows.map((r: { id: string }) => r.id);
      const expRes = await client.query(
        `INSERT INTO expenses (trip_id, paid_by, amount, currency, amount_home, description, category, split_mode, expense_date, activity_id)
         VALUES ($1,$2,$3,$4,$5,$6,'activities','equal',$7,$8) RETURNING id`,
        [tripId, paidBy, cost, costCurrency, amountHome, description, dayDate, activityId]
      );
      const expId = expRes.rows[0].id as string;
      for (let i = 0; i < tIds.length; i++) {
        const base = Math.floor(cost * 100 / tIds.length) / 100;
        const rem  = i === 0 ? Math.round((cost - base * tIds.length) * 100) / 100 : 0;
        const splitAmt  = base + rem;
        const splitHome = amountHome ? Math.round(splitAmt * amountHome / cost * 100) / 100 : null;
        await client.query(
          `INSERT INTO expense_splits (expense_id, traveller_id, amount, amount_home) VALUES ($1,$2,$3,$4)`,
          [expId, tIds[i], splitAmt, splitHome]
        );
      }
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('activity expense sync failed', activityId, (err as Error).message);
  } finally {
    client.release();
  }
}

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
  try {
    const { time, type, description, notes, location_tag, latitude, longitude, kid_friendly, cost, cost_currency } = req.body;

    const maxOrder = await pool.query(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order FROM activities WHERE day_id = $1',
      [req.params.dayId]
    );

    const result = await pool.query(
      `INSERT INTO activities (day_id, time, type, description, notes, location_tag, latitude, longitude, kid_friendly, sort_order, cost, cost_currency)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [
        req.params.dayId, time || null, type || 'custom', description,
        notes || null, location_tag || null, latitude || null, longitude || null,
        kid_friendly ?? true, maxOrder.rows[0].next_order,
        cost || null, cost_currency || null,
      ]
    );
    const activity = result.rows[0];
    res.status(201).json(activity);

    // Sync expense (best-effort after response)
    if (cost && cost > 0) {
      const dayRes = await pool.query(`SELECT date, trip_id FROM itinerary_days WHERE id=$1`, [req.params.dayId]);
      if (dayRes.rows.length > 0) {
        syncExpenseForActivity(
          activity.id as string, description as string,
          parseFloat(cost), cost_currency as string,
          dayRes.rows[0].date as string, dayRes.rows[0].trip_id as string
        ).catch(() => {});
      }
    }
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// PUT /api/v1/activities/:id
router.put('/activities/:id', async (req: Request, res: Response) => {
  try {
    const { time, type, description, notes, location_tag, latitude, longitude, kid_friendly, cost, cost_currency } = req.body;
    const result = await pool.query(
      `UPDATE activities SET time=COALESCE($1,time), type=COALESCE($2,type),
       description=COALESCE($3,description), notes=$4,
       location_tag=COALESCE($5,location_tag),
       latitude=COALESCE($6,latitude), longitude=COALESCE($7,longitude),
       kid_friendly=COALESCE($8,kid_friendly),
       cost=COALESCE($9,cost), cost_currency=COALESCE($10,cost_currency)
       WHERE id=$11 RETURNING *`,
      [time, type, description, notes || null, location_tag, latitude, longitude, kid_friendly,
       cost ?? null, cost_currency ?? null, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Activity not found' });
    }
    const activity = result.rows[0];
    res.json(activity);

    // Sync expense (best-effort after response)
    if (activity.cost && parseFloat(activity.cost) > 0) {
      const dayRes = await pool.query(
        `SELECT d.date, d.trip_id FROM itinerary_days d WHERE d.id=$1`, [activity.day_id]
      );
      if (dayRes.rows.length > 0) {
        syncExpenseForActivity(
          activity.id as string, activity.description as string,
          parseFloat(activity.cost), activity.cost_currency as string,
          dayRes.rows[0].date as string, dayRes.rows[0].trip_id as string
        ).catch(() => {});
      }
    }
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// DELETE /api/v1/activities/:id
router.delete('/activities/:id', async (req: Request, res: Response) => {
  try {
    const result = await pool.query('DELETE FROM activities WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Activity not found' });
    }
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
