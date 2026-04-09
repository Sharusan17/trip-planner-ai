import { Router, Request, Response } from 'express';
import pool from '../db/pool';

const router = Router();

// GET /trips/:tripId/announcements
router.get('/trips/:tripId/announcements', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT a.*, t.name AS author_name, t.avatar_colour AS author_colour
       FROM announcements a
       JOIN travellers t ON t.id = a.author_id
       WHERE a.trip_id = $1
       ORDER BY a.pinned DESC, a.created_at DESC`,
      [req.params.tripId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /trips/:tripId/announcements
router.post('/trips/:tripId/announcements', async (req: Request, res: Response) => {
  try {
    const { title, content, author_id, pinned = false } = req.body;
    const result = await pool.query(
      `INSERT INTO announcements (trip_id, author_id, title, content, pinned)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [req.params.tripId, author_id, title, content, pinned]
    );
    const row = result.rows[0];
    const traveller = await pool.query(
      `SELECT name, avatar_colour FROM travellers WHERE id = $1`,
      [row.author_id]
    );
    res.status(201).json({
      ...row,
      author_name: traveller.rows[0]?.name,
      author_colour: traveller.rows[0]?.avatar_colour,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// PATCH /announcements/:id/pin
router.patch('/announcements/:id/pin', async (req: Request, res: Response) => {
  try {
    const { pinned } = req.body;
    const result = await pool.query(
      `UPDATE announcements SET pinned = $1 WHERE id = $2 RETURNING *`,
      [pinned, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// DELETE /announcements/:id
router.delete('/announcements/:id', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `DELETE FROM announcements WHERE id = $1 RETURNING id`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
