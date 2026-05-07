import { Router, Request, Response } from 'express';
import pool from '../db/pool';

const router = Router();

const DEFAULT_ITEMS = [
  'Passport / ID',
  'Travel insurance documents',
  'Flight & hotel confirmation',
  'House keys',
  'Phone charger & adaptor',
  'Medication',
  'Luggage (packed)',
  'Check-in completed',
];

// GET /trips/:tripId/checklist?traveller_id=
// Returns shared items + caller's private items, each with their checked state.
// Seeds default shared items the first time the trip's checklist is accessed.
router.get('/trips/:tripId/checklist', async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const { tripId } = req.params;
    const travellerId = req.query.traveller_id as string | undefined;

    // Seed defaults if the trip has no items at all
    const countRes = await client.query(
      `SELECT COUNT(*) FROM trip_checklist_items WHERE trip_id = $1`,
      [tripId]
    );
    if (parseInt(countRes.rows[0].count) === 0) {
      await client.query('BEGIN');
      for (let i = 0; i < DEFAULT_ITEMS.length; i++) {
        await client.query(
          `INSERT INTO trip_checklist_items (trip_id, label, is_shared, sort_order)
           VALUES ($1, $2, TRUE, $3)`,
          [tripId, DEFAULT_ITEMS[i], i]
        );
      }
      await client.query('COMMIT');
    }

    // Fetch shared items + private items belonging to this traveller
    const itemsRes = await client.query(
      `SELECT i.*,
              COALESCE(c.checked, FALSE) AS checked,
              c.checked_at
       FROM trip_checklist_items i
       LEFT JOIN trip_checklist_checks c
         ON c.item_id = i.id AND c.traveller_id = $2
       WHERE i.trip_id = $1
         AND (i.is_shared = TRUE OR i.created_by = $2)
       ORDER BY i.is_shared DESC, i.sort_order ASC, i.created_at ASC`,
      [tripId, travellerId ?? null]
    );

    res.json(itemsRes.rows.map((r) => ({ ...r, checked: r.checked === true })));
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(500).json({ error: (err as Error).message });
  } finally {
    client.release();
  }
});

// POST /trips/:tripId/checklist/items
router.post('/trips/:tripId/checklist/items', async (req: Request, res: Response) => {
  try {
    const { tripId } = req.params;
    const { label, is_shared = true, created_by } = req.body;

    // Place at end of list
    const orderRes = await pool.query(
      `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM trip_checklist_items WHERE trip_id = $1`,
      [tripId]
    );
    const sortOrder: number = orderRes.rows[0].next;

    const result = await pool.query(
      `INSERT INTO trip_checklist_items (trip_id, label, is_shared, created_by, sort_order)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [tripId, label, is_shared, created_by || null, sortOrder]
    );
    res.status(201).json({ ...result.rows[0], checked: false, checked_at: null });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// PATCH /checklist-items/:id — update label or promote to shared
router.patch('/checklist-items/:id', async (req: Request, res: Response) => {
  try {
    const { label, is_shared, sort_order } = req.body;
    const result = await pool.query(
      `UPDATE trip_checklist_items
         SET label       = COALESCE($1, label),
             is_shared   = COALESCE($2, is_shared),
             sort_order  = COALESCE($3, sort_order)
       WHERE id = $4 RETURNING *`,
      [label ?? null, is_shared ?? null, sort_order ?? null, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ ...result.rows[0], checked: false, checked_at: null });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// DELETE /checklist-items/:id
router.delete('/checklist-items/:id', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `DELETE FROM trip_checklist_items WHERE id = $1 RETURNING id`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// PATCH /checklist-items/:id/check — upsert per-traveller checked state
router.patch('/checklist-items/:id/check', async (req: Request, res: Response) => {
  try {
    const { traveller_id, checked } = req.body as { traveller_id: string; checked: boolean };
    await pool.query(
      `INSERT INTO trip_checklist_checks (item_id, traveller_id, checked, checked_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (item_id, traveller_id)
       DO UPDATE SET checked = $3, checked_at = $4`,
      [req.params.id, traveller_id, checked, checked ? new Date() : null]
    );
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
