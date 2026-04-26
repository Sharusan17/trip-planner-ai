import { Router, Request, Response } from 'express';
import pool from '../db/pool';
import bcrypt from 'bcryptjs';
import { uploadPhoto } from '../middleware/upload';

const router = Router();

const TRAVELLER_COLS = `id, trip_id, name, type, role, avatar_colour, cost_split_weight,
  notes, (medical_pin IS NOT NULL) as has_medical_pin,
  (avatar_photo IS NOT NULL) as has_photo, sort_order, created_at`;

// GET /api/v1/trips/:tripId/travellers
router.get('/trips/:tripId/travellers', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT ${TRAVELLER_COLS} FROM travellers WHERE trip_id = $1 ORDER BY sort_order, created_at`,
      [req.params.tripId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /api/v1/trips/:tripId/travellers
router.post('/trips/:tripId/travellers', async (req: Request, res: Response) => {
  try {
    const { name, type, role, avatar_colour, cost_split_weight, notes, medical_notes, medical_pin } = req.body;

    let hashedPin: string | null = null;
    if (medical_pin) {
      hashedPin = await bcrypt.hash(medical_pin, 10);
    }

    const defaultWeight = type === 'infant' ? 0 : type === 'child' ? 0.5 : 1.0;

    const result = await pool.query(
      `INSERT INTO travellers (trip_id, name, type, role, avatar_colour, cost_split_weight, notes, medical_notes, medical_pin)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING ${TRAVELLER_COLS}`,
      [
        req.params.tripId, name, type || 'adult', role || 'member',
        avatar_colour || '#1B3A5C', cost_split_weight ?? defaultWeight,
        notes || null, medical_notes || null, hashedPin
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// PUT /api/v1/travellers/:id
router.put('/travellers/:id', async (req: Request, res: Response) => {
  try {
    const { name, type, role, avatar_colour, cost_split_weight, notes, medical_notes, medical_pin } = req.body;

    let hashedPin: string | undefined;
    if (medical_pin !== undefined) {
      hashedPin = medical_pin ? await bcrypt.hash(medical_pin, 10) : '';
    }

    const setClauses: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (name !== undefined) { setClauses.push(`name = $${idx++}`); values.push(name); }
    if (type !== undefined) { setClauses.push(`type = $${idx++}`); values.push(type); }
    if (role !== undefined) { setClauses.push(`role = $${idx++}`); values.push(role); }
    if (avatar_colour !== undefined) { setClauses.push(`avatar_colour = $${idx++}`); values.push(avatar_colour); }
    if (cost_split_weight !== undefined) { setClauses.push(`cost_split_weight = $${idx++}`); values.push(cost_split_weight); }
    if (notes !== undefined) { setClauses.push(`notes = $${idx++}`); values.push(notes || null); }
    if (medical_notes !== undefined) { setClauses.push(`medical_notes = $${idx++}`); values.push(medical_notes); }
    if (hashedPin !== undefined) { setClauses.push(`medical_pin = $${idx++}`); values.push(hashedPin || null); }

    if (setClauses.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(req.params.id);
    const result = await pool.query(
      `UPDATE travellers SET ${setClauses.join(', ')} WHERE id = $${idx}
       RETURNING ${TRAVELLER_COLS}`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Traveller not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// DELETE /api/v1/travellers/:id
router.delete('/travellers/:id', async (req: Request, res: Response) => {
  try {
    const result = await pool.query('DELETE FROM travellers WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Traveller not found' });
    }
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /api/v1/travellers/:id/verify-pin
router.post('/travellers/:id/verify-pin', async (req: Request, res: Response) => {
  try {
    const { pin } = req.body;
    const result = await pool.query(
      'SELECT medical_pin, medical_notes FROM travellers WHERE id = $1',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Traveller not found' });
    }

    const { medical_pin, medical_notes } = result.rows[0];
    if (!medical_pin) {
      return res.status(400).json({ error: 'No PIN set' });
    }

    const valid = await bcrypt.compare(pin, medical_pin);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid PIN' });
    }

    res.json({ medical_notes });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /api/v1/travellers/:id/photo — upload profile picture
router.post('/travellers/:id/photo', uploadPhoto.single('photo'), async (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No photo uploaded' });

    await pool.query(
      `UPDATE travellers SET avatar_photo = $1, avatar_photo_mime = $2 WHERE id = $3`,
      [req.file.buffer, req.file.mimetype, req.params.id]
    );

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// DELETE /api/v1/travellers/:id/photo — remove profile picture
router.delete('/travellers/:id/photo', async (req: Request, res: Response) => {
  try {
    await pool.query(
      `UPDATE travellers SET avatar_photo = NULL, avatar_photo_mime = NULL WHERE id = $1`,
      [req.params.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/v1/travellers/:id/photo — serve profile picture
router.get('/travellers/:id/photo', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT avatar_photo, avatar_photo_mime FROM travellers WHERE id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0 || !result.rows[0].avatar_photo) {
      return res.status(404).json({ error: 'No photo' });
    }
    const { avatar_photo, avatar_photo_mime } = result.rows[0];

    let buf: Buffer;
    if (Buffer.isBuffer(avatar_photo)) {
      buf = avatar_photo;
    } else if (typeof avatar_photo === 'string') {
      const hex = avatar_photo.startsWith('\\x') ? avatar_photo.slice(2) : avatar_photo;
      buf = Buffer.from(hex, 'hex');
    } else {
      buf = Buffer.from(avatar_photo as any);
    }

    res.set('Content-Type', avatar_photo_mime || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=86400');
    res.set('Content-Length', String(buf.length));
    res.end(buf);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
