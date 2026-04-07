import { Router, Request, Response } from 'express';
import pool from '../db/pool';

const router = Router();

interface Balance {
  traveller_id: string;
  net: number;
}

function simplifyDebts(balances: Balance[]): { from: string; to: string; amount: number }[] {
  const creditors = balances
    .filter((b) => b.net > 0.005)
    .sort((a, b) => b.net - a.net)
    .map((b) => ({ ...b }));
  const debtors = balances
    .filter((b) => b.net < -0.005)
    .sort((a, b) => a.net - b.net)
    .map((b) => ({ ...b }));

  const settlements: { from: string; to: string; amount: number }[] = [];

  while (creditors.length > 0 && debtors.length > 0) {
    const creditor = creditors[0];
    const debtor = debtors[0];

    const amount = Math.min(creditor.net, Math.abs(debtor.net));
    const rounded = Math.round(amount * 100) / 100;

    if (rounded >= 0.01) {
      settlements.push({ from: debtor.traveller_id, to: creditor.traveller_id, amount: rounded });
    }

    creditor.net = Math.round((creditor.net - amount) * 100) / 100;
    debtor.net = Math.round((debtor.net + amount) * 100) / 100;

    if (creditor.net < 0.005) creditors.shift();
    if (debtor.net > -0.005) debtors.shift();
  }

  return settlements;
}

// GET /trips/:tripId/settlements
router.get('/trips/:tripId/settlements', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT * FROM settlements WHERE trip_id = $1 ORDER BY status, amount DESC`,
      [req.params.tripId]
    );
    res.json(result.rows.map((r) => ({ ...r, amount: parseFloat(r.amount) })));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /trips/:tripId/settlements/calculate
router.post('/trips/:tripId/settlements/calculate', async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const { tripId } = req.params;

    const tripResult = await client.query(`SELECT home_currency FROM trips WHERE id = $1`, [tripId]);
    if (tripResult.rows.length === 0) return res.status(404).json({ error: 'Trip not found' });
    const homeCurrency: string = tripResult.rows[0].home_currency;

    // Build net balances: credits (paid_by) minus debits (splits)
    const creditsResult = await client.query(
      `SELECT paid_by AS traveller_id, COALESCE(SUM(amount_home), 0) AS total
       FROM expenses WHERE trip_id = $1 AND amount_home IS NOT NULL
       GROUP BY paid_by`,
      [tripId]
    );
    const debitsResult = await client.query(
      `SELECT es.traveller_id, COALESCE(SUM(es.amount_home), 0) AS total
       FROM expense_splits es
       JOIN expenses e ON e.id = es.expense_id
       WHERE e.trip_id = $1 AND es.amount_home IS NOT NULL
       GROUP BY es.traveller_id`,
      [tripId]
    );

    const netMap: Record<string, number> = {};
    for (const row of creditsResult.rows) {
      netMap[row.traveller_id] = (netMap[row.traveller_id] ?? 0) + parseFloat(row.total);
    }
    for (const row of debitsResult.rows) {
      netMap[row.traveller_id] = (netMap[row.traveller_id] ?? 0) - parseFloat(row.total);
    }

    const balances: Balance[] = Object.entries(netMap).map(([traveller_id, net]) => ({
      traveller_id,
      net: Math.round(net * 100) / 100,
    }));

    const newSettlements = simplifyDebts(balances);

    await client.query('BEGIN');
    await client.query(
      `DELETE FROM settlements WHERE trip_id = $1 AND status = 'pending'`,
      [tripId]
    );

    const results = [];
    for (const s of newSettlements) {
      const r = await client.query(
        `INSERT INTO settlements (trip_id, from_traveller, to_traveller, amount, currency)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [tripId, s.from, s.to, s.amount, homeCurrency]
      );
      results.push({ ...r.rows[0], amount: parseFloat(r.rows[0].amount) });
    }

    await client.query('COMMIT');
    res.json(results);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: (err as Error).message });
  } finally {
    client.release();
  }
});

// PATCH /settlements/:id/pay
router.patch('/settlements/:id/pay', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `UPDATE settlements SET status = 'paid', paid_at = NOW()
       WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ ...result.rows[0], amount: parseFloat(result.rows[0].amount) });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// DELETE /settlements/:id
router.delete('/settlements/:id', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `DELETE FROM settlements WHERE id = $1 RETURNING id`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
