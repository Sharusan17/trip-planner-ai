import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import pool from '../db/pool';
import { uploadPhoto } from '../middleware/upload';

const router = Router();

// GET /trips/:tripId/photos
router.get('/trips/:tripId/photos', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT p.*, t.name AS uploader_name, t.avatar_colour AS uploader_colour
       FROM trip_photos p
       JOIN travellers t ON t.id = p.uploader_id
       WHERE p.trip_id = $1
       ORDER BY p.created_at DESC`,
      [req.params.tripId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /trips/:tripId/photos  (multipart)
router.post('/trips/:tripId/photos', uploadPhoto.single('photo'), async (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No photo uploaded' });
    const { uploader_id, caption, day_id } = req.body;

    const result = await pool.query(
      `INSERT INTO trip_photos (trip_id, uploader_id, day_id, filename, original_name, caption)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.params.tripId, uploader_id, day_id || null, req.file.filename, req.file.originalname, caption || null]
    );
    const row = result.rows[0];
    const traveller = await pool.query(
      `SELECT name, avatar_colour FROM travellers WHERE id = $1`, [uploader_id]
    );
    res.status(201).json({
      ...row,
      uploader_name: traveller.rows[0]?.name,
      uploader_colour: traveller.rows[0]?.avatar_colour,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// DELETE /photos/:id
router.delete('/photos/:id', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `DELETE FROM trip_photos WHERE id = $1 RETURNING filename`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });

    // Delete file from disk
    const filePath = path.join(__dirname, '../../uploads/photos', result.rows[0].filename);
    fs.unlink(filePath, () => {}); // ignore error if file missing

    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
