import { Router, Request, Response } from 'express';
import pool from '../db/pool';
import { getRate } from '../services/currencyService';

const router = Router();

// GET /trips/:tripId/deposits
router.get('/trips/:tripId/deposits', async (req: Request, res: Response) => {
  try {
    const { status } = req.query;
    let query = `SELECT * FROM deposits WHERE trip_id = $1`;
    const params: unknown[] = [req.params.tripId];
    if (status) {
      query += ` AND status = $2`;
      params.push(status);
    }
    query += ` ORDER BY CASE status WHEN 'overdue' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END, due_date NULLS LAST`;
    const result = await pool.query(query, params);
    res.json(result.rows.map((r) => ({
      ...r,
      amount: parseFloat(r.amount),
      amount_home: r.amount_home ? parseFloat(r.amount_home) : null,
    })));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /trips/:tripId/deposits/summary
router.get('/trips/:tripId/deposits/summary', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT
         COALESCE(SUM(CASE WHEN status = 'pending' THEN amount_home ELSE 0 END), 0) AS total_pending_home,
         COALESCE(SUM(CASE WHEN status = 'paid' THEN amount_home ELSE 0 END), 0) AS total_paid_home,
         COALESCE(SUM(CASE WHEN status = 'overdue' THEN amount_home ELSE 0 END), 0) AS total_overdue_home,
         COUNT(CASE WHEN status = 'pending' THEN 1 END) AS count_pending,
         COUNT(CASE WHEN status = 'overdue' THEN 1 END) AS count_overdue
       FROM deposits WHERE trip_id = $1`,
      [req.params.tripId]
    );
    const r = result.rows[0];
    res.json({
      total_pending_home: parseFloat(r.total_pending_home),
      total_paid_home: parseFloat(r.total_paid_home),
      total_overdue_home: parseFloat(r.total_overdue_home),
      count_pending: parseInt(r.count_pending),
      count_overdue: parseInt(r.count_overdue),
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /trips/:tripId/deposits
router.post('/trips/:tripId/deposits', async (req: Request, res: Response) => {
  try {
    const { tripId } = req.params;
    const { description, amount, currency, due_date, linked_type, linked_id, notes } = req.body;

    const tripResult = await pool.query(`SELECT home_currency FROM trips WHERE id = $1`, [tripId]);
    const homeCurrency: string = tripResult.rows[0]?.home_currency ?? 'GBP';
    let amountHome: number | null = null;
    try {
      if (currency !== homeCurrency) {
        const { rate } = await getRate(currency, homeCurrency);
        amountHome = Math.round(parseFloat(amount) * rate * 100) / 100;
      } else {
        amountHome = parseFloat(amount);
      }
    } catch { amountHome = null; }

    const result = await pool.query(
      `INSERT INTO deposits
         (trip_id, description, amount, currency, amount_home, due_date, linked_type, linked_id, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [tripId, description, amount, currency, amountHome,
       due_date || null, linked_type || null, linked_id || null, notes || null]
    );

    const r = result.rows[0];
    res.status(201).json({
      ...r,
      amount: parseFloat(r.amount),
      amount_home: r.amount_home ? parseFloat(r.amount_home) : null,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// PUT /deposits/:id
router.put('/deposits/:id', async (req: Request, res: Response) => {
  try {
    const { description, amount, currency, due_date, status, linked_type, linked_id, notes } = req.body;
    const result = await pool.query(
      `UPDATE deposits SET
         description = COALESCE($1, description),
         amount = COALESCE($2, amount),
         currency = COALESCE($3, currency),
         due_date = COALESCE($4, due_date),
         status = COALESCE($5, status),
         linked_type = COALESCE($6, linked_type),
         linked_id = COALESCE($7, linked_id),
         notes = COALESCE($8, notes),
         updated_at = NOW()
       WHERE id = $9 RETURNING *`,
      [description ?? null, amount ?? null, currency ?? null,
       due_date ?? null, status ?? null, linked_type ?? null,
       linked_id ?? null, notes ?? null, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const r = result.rows[0];
    res.json({
      ...r,
      amount: parseFloat(r.amount),
      amount_home: r.amount_home ? parseFloat(r.amount_home) : null,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// PATCH /deposits/:id/status
router.patch('/deposits/:id/status', async (req: Request, res: Response) => {
  try {
    const { status } = req.body;
    const paidAt = status === 'paid' ? 'NOW()' : 'NULL';
    const result = await pool.query(
      `UPDATE deposits SET status = $1, paid_at = ${paidAt}, updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [status, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const r = result.rows[0];
    res.json({
      ...r,
      amount: parseFloat(r.amount),
      amount_home: r.amount_home ? parseFloat(r.amount_home) : null,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// DELETE /deposits/:id
router.delete('/deposits/:id', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `DELETE FROM deposits WHERE id = $1 RETURNING id`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
