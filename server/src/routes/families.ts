import { Router, Request, Response } from 'express';
import pool from '../db/pool';

const router = Router();

// GET /api/v1/trips/:tripId/families — list all families with their members
router.get('/trips/:tripId/families', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT f.*,
        COALESCE(json_agg(
          json_build_object(
            'id', t.id,
            'name', t.name,
            'avatar_colour', t.avatar_colour,
            'has_photo', (t.avatar_photo IS NOT NULL),
            'cost_split_weight', t.cost_split_weight,
            'type', t.type
          ) ORDER BY t.sort_order
        ) FILTER (WHERE t.id IS NOT NULL), '[]') AS members
       FROM families f
       LEFT JOIN travellers t ON t.family_id = f.id
       WHERE f.trip_id = $1
       GROUP BY f.id
       ORDER BY f.created_at`,
      [req.params.tripId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /api/v1/trips/:tripId/families — create a family and assign members
router.post('/trips/:tripId/families', async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const { name, lead_traveller_id, colour, member_ids = [] } = req.body;
    if (!name || !lead_traveller_id) {
      return res.status(400).json({ error: 'name and lead_traveller_id are required' });
    }

    await client.query('BEGIN');

    const familyResult = await client.query(
      `INSERT INTO families (trip_id, name, lead_traveller_id, colour)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.params.tripId, name.trim(), lead_traveller_id, colour || '#1B3A5C']
    );
    const family = familyResult.rows[0];

    // Ensure lead is always in member_ids
    const allMembers = Array.from(new Set([lead_traveller_id, ...member_ids]));

    if (allMembers.length > 0) {
      await client.query(
        `UPDATE travellers SET family_id = $1
         WHERE id = ANY($2) AND trip_id = $3`,
        [family.id, allMembers, req.params.tripId]
      );
    }

    await client.query('COMMIT');

    // Return with members populated
    const full = await pool.query(
      `SELECT f.*,
        COALESCE(json_agg(
          json_build_object(
            'id', t.id, 'name', t.name, 'avatar_colour', t.avatar_colour,
            'has_photo', (t.avatar_photo IS NOT NULL),
            'cost_split_weight', t.cost_split_weight, 'type', t.type
          ) ORDER BY t.sort_order
        ) FILTER (WHERE t.id IS NOT NULL), '[]') AS members
       FROM families f
       LEFT JOIN travellers t ON t.family_id = f.id
       WHERE f.id = $1
       GROUP BY f.id`,
      [family.id]
    );
    res.status(201).json(full.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: (err as Error).message });
  } finally {
    client.release();
  }
});

// PUT /api/v1/families/:id — update name/lead/colour and reassign members
router.put('/families/:id', async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const { name, lead_traveller_id, colour, member_ids } = req.body;

    await client.query('BEGIN');

    // Fetch current family to get trip_id
    const existing = await client.query(
      'SELECT * FROM families WHERE id = $1', [req.params.id]
    );
    if (existing.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Family not found' });
    }
    const tripId = existing.rows[0].trip_id;

    // Update family record
    const updated = await client.query(
      `UPDATE families SET
        name = COALESCE($1, name),
        lead_traveller_id = COALESCE($2, lead_traveller_id),
        colour = COALESCE($3, colour)
       WHERE id = $4 RETURNING *`,
      [name?.trim() || null, lead_traveller_id || null, colour || null, req.params.id]
    );

    // Reassign members if provided
    if (Array.isArray(member_ids)) {
      const allMembers = Array.from(
        new Set([(lead_traveller_id || existing.rows[0].lead_traveller_id), ...member_ids])
      );

      // Clear current members
      await client.query(
        'UPDATE travellers SET family_id = NULL WHERE family_id = $1',
        [req.params.id]
      );

      // Set new members
      if (allMembers.length > 0) {
        await client.query(
          `UPDATE travellers SET family_id = $1
           WHERE id = ANY($2) AND trip_id = $3`,
          [req.params.id, allMembers, tripId]
        );
      }
    }

    await client.query('COMMIT');

    // Return with members
    const full = await pool.query(
      `SELECT f.*,
        COALESCE(json_agg(
          json_build_object(
            'id', t.id, 'name', t.name, 'avatar_colour', t.avatar_colour,
            'has_photo', (t.avatar_photo IS NOT NULL),
            'cost_split_weight', t.cost_split_weight, 'type', t.type
          ) ORDER BY t.sort_order
        ) FILTER (WHERE t.id IS NOT NULL), '[]') AS members
       FROM families f
       LEFT JOIN travellers t ON t.family_id = f.id
       WHERE f.id = $1
       GROUP BY f.id`,
      [req.params.id]
    );
    res.json(full.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: (err as Error).message });
  } finally {
    client.release();
  }
});

// DELETE /api/v1/families/:id — unassign all members then delete
router.delete('/families/:id', async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Detach all members first (avoids FK constraint issues)
    await client.query(
      'UPDATE travellers SET family_id = NULL WHERE family_id = $1',
      [req.params.id]
    );
    const result = await client.query(
      'DELETE FROM families WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Family not found' });
    }
    await client.query('COMMIT');
    res.json({ deleted: true });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: (err as Error).message });
  } finally {
    client.release();
  }
});

export default router;
