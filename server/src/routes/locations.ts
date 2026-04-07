import { Router, Request, Response } from 'express';
import pool from '../db/pool';

const router = Router();

// GET /api/v1/trips/:tripId/locations — manual pins + activity-derived pins
router.get('/trips/:tripId/locations', async (req: Request, res: Response) => {
  try {
    // Manual pins
    const manualResult = await pool.query(
      'SELECT * FROM locations WHERE trip_id = $1',
      [req.params.tripId]
    );

    // Activity-derived pins
    const activityResult = await pool.query(
      `SELECT a.id, a.description as name, a.type as category, a.latitude, a.longitude,
       a.location_tag as notes, a.type as activity_type, d.day_number, a.time
       FROM activities a
       JOIN itinerary_days d ON a.day_id = d.id
       WHERE d.trip_id = $1 AND a.latitude IS NOT NULL AND a.longitude IS NOT NULL`,
      [req.params.tripId]
    );

    res.json({
      manual: manualResult.rows,
      activities: activityResult.rows,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /api/v1/trips/:tripId/locations
router.post('/trips/:tripId/locations', async (req: Request, res: Response) => {
  try {
    const { name, category, latitude, longitude, notes } = req.body;
    const result = await pool.query(
      `INSERT INTO locations (trip_id, name, category, latitude, longitude, notes)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.params.tripId, name, category || null, latitude, longitude, notes || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// DELETE /api/v1/locations/:id
router.delete('/locations/:id', async (req: Request, res: Response) => {
  try {
    const result = await pool.query('DELETE FROM locations WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Location not found' });
    }
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
