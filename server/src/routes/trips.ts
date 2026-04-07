import { Router, Request, Response } from 'express';
import pool from '../db/pool';
import crypto from 'crypto';

const router = Router();

function generateGroupCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars[crypto.randomInt(chars.length)];
  }
  return code.slice(0, 4) + '-' + code.slice(4);
}

// GET /api/v1/trips — list trips or find by group_code
router.get('/', async (req: Request, res: Response) => {
  try {
    const { code } = req.query;
    if (code) {
      const result = await pool.query(
        'SELECT * FROM trips WHERE group_code = $1',
        [code]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Trip not found' });
      }
      return res.json(result.rows[0]);
    }
    const result = await pool.query('SELECT * FROM trips ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/v1/trips/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM trips WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Trip not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /api/v1/trips
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, destination, latitude, longitude, start_date, end_date, home_currency, dest_currency } = req.body;
    const group_code = generateGroupCode();
    const result = await pool.query(
      `INSERT INTO trips (name, group_code, destination, latitude, longitude, start_date, end_date, home_currency, dest_currency)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [name, group_code, destination, latitude, longitude, start_date, end_date, home_currency || 'GBP', dest_currency || 'EUR']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// PUT /api/v1/trips/:id
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { name, destination, latitude, longitude, start_date, end_date, home_currency, dest_currency } = req.body;
    const result = await pool.query(
      `UPDATE trips SET name = COALESCE($1, name), destination = COALESCE($2, destination),
       latitude = COALESCE($3, latitude), longitude = COALESCE($4, longitude),
       start_date = COALESCE($5, start_date), end_date = COALESCE($6, end_date),
       home_currency = COALESCE($7, home_currency), dest_currency = COALESCE($8, dest_currency),
       updated_at = NOW() WHERE id = $9 RETURNING *`,
      [name, destination, latitude, longitude, start_date, end_date, home_currency, dest_currency, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Trip not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// DELETE /api/v1/trips/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const result = await pool.query('DELETE FROM trips WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Trip not found' });
    }
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
