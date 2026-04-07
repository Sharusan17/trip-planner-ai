import { Router, Request, Response } from 'express';
import pool from '../db/pool';

const router = Router();

// GET /api/v1/trips/:tripId/days — all days with activities
router.get('/trips/:tripId/days', async (req: Request, res: Response) => {
  try {
    const daysResult = await pool.query(
      'SELECT * FROM itinerary_days WHERE trip_id = $1 ORDER BY day_number',
      [req.params.tripId]
    );

    const days = daysResult.rows;
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
    const { time, type, description, location_tag, latitude, longitude, kid_friendly } = req.body;

    const maxOrder = await pool.query(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order FROM activities WHERE day_id = $1',
      [req.params.dayId]
    );

    const result = await pool.query(
      `INSERT INTO activities (day_id, time, type, description, location_tag, latitude, longitude, kid_friendly, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [
        req.params.dayId, time || null, type || 'custom', description,
        location_tag || null, latitude || null, longitude || null,
        kid_friendly ?? true, maxOrder.rows[0].next_order
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// PUT /api/v1/activities/:id
router.put('/activities/:id', async (req: Request, res: Response) => {
  try {
    const { time, type, description, location_tag, latitude, longitude, kid_friendly } = req.body;
    const result = await pool.query(
      `UPDATE activities SET time = COALESCE($1, time), type = COALESCE($2, type),
       description = COALESCE($3, description), location_tag = COALESCE($4, location_tag),
       latitude = COALESCE($5, latitude), longitude = COALESCE($6, longitude),
       kid_friendly = COALESCE($7, kid_friendly) WHERE id = $8 RETURNING *`,
      [time, type, description, location_tag, latitude, longitude, kid_friendly, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Activity not found' });
    }
    res.json(result.rows[0]);
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
