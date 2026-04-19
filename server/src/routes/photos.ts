import { Router, Request, Response } from 'express';
import pool from '../db/pool';
import { uploadPhoto } from '../middleware/upload';

const router = Router();

// GET /trips/:tripId/photos — list metadata (no binary data)
router.get('/trips/:tripId/photos', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT p.id, p.trip_id, p.uploader_id, p.day_id, p.original_name, p.mime_type,
              p.caption, p.created_at,
              t.name AS uploader_name, t.avatar_colour AS uploader_colour
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

// GET /photos/:id/image — serve photo binary from DB
router.get('/photos/:id/image', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT data, mime_type FROM trip_photos WHERE id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0 || !result.rows[0].data) {
      console.warn('[photo] Not found or no data for id:', req.params.id);
      return res.status(404).json({ error: 'Not found' });
    }
    const { data, mime_type } = result.rows[0];

    // pg returns bytea as Buffer, but handle hex-string fallback just in case
    let buf: Buffer;
    if (Buffer.isBuffer(data)) {
      buf = data;
    } else if (typeof data === 'string') {
      const hex = data.startsWith('\\x') ? data.slice(2) : data;
      buf = Buffer.from(hex, 'hex');
    } else {
      buf = Buffer.from(data as any);
    }

    console.log('[photo] Serving id:', req.params.id, 'size:', buf.length, 'type:', mime_type);

    res.set('Content-Type', mime_type || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=31536000');
    res.set('Content-Length', String(buf.length));
    res.end(buf);
  } catch (err) {
    console.error('[photo] Error serving photo:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /trips/:tripId/photos (multipart)
router.post('/trips/:tripId/photos', uploadPhoto.single('photo'), async (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No photo uploaded' });
    const { uploader_id, caption, day_id } = req.body;

    const result = await pool.query(
      `INSERT INTO trip_photos (trip_id, uploader_id, day_id, filename, original_name, caption, data, mime_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, trip_id, uploader_id, day_id, original_name, mime_type, caption, created_at`,
      [
        req.params.tripId,
        uploader_id,
        day_id || null,
        req.file.originalname, // keep original name as filename field
        req.file.originalname,
        caption || null,
        req.file.buffer,
        req.file.mimetype,
      ]
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
      `DELETE FROM trip_photos WHERE id = $1 RETURNING id`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
