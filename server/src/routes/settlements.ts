import { Router, Request, Response } from 'express';
import pool from '../db/pool';
import { getRate } from '../services/currencyService';

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
// Computes net balances from expenses + transfers, then produces minimal settlement set.
// Transfers offset balances: payer's net increases, receiver's net decreases.
router.post('/trips/:tripId/settlements/calculate', async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const { tripId } = req.params;

    const tripResult = await client.query(`SELECT home_currency FROM trips WHERE id = $1`, [tripId]);
    if (tripResult.rows.length === 0) return res.status(404).json({ error: 'Trip not found' });
    const homeCurrency: string = tripResult.rows[0].home_currency;

    // Build net balances from expenses
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

    // Adjust for transfers: payer gains credit, receiver loses credit
    const transfersResult = await client.query(
      `SELECT from_traveller, to_traveller, COALESCE(amount_home, amount) AS effective_amount
       FROM transfers WHERE trip_id = $1`,
      [tripId]
    );
    for (const row of transfersResult.rows) {
      const amt = parseFloat(row.effective_amount);
      netMap[row.from_traveller] = (netMap[row.from_traveller] ?? 0) + amt;
      netMap[row.to_traveller]   = (netMap[row.to_traveller]   ?? 0) - amt;
    }

    // Adjust for already-paid settlements — they represent money that has already moved,
    // so they reduce the remaining balance just like transfers do.
    const paidResult = await client.query(
      `SELECT from_traveller, to_traveller, amount FROM settlements
       WHERE trip_id = $1 AND status = 'paid'`,
      [tripId]
    );
    for (const row of paidResult.rows) {
      const amt = parseFloat(row.amount);
      netMap[row.from_traveller] = (netMap[row.from_traveller] ?? 0) + amt;
      netMap[row.to_traveller]   = (netMap[row.to_traveller]   ?? 0) - amt;
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

// PATCH /settlements/:id/unpay — reverse a paid settlement back to pending
router.patch('/settlements/:id/unpay', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `UPDATE settlements SET status = 'pending', paid_at = NULL
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

// ── Transfer routes ──────────────────────────────────────────────────────────

// GET /trips/:tripId/transfers
router.get('/trips/:tripId/transfers', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT t.*,
              tf.name AS from_name, tf.avatar_colour AS from_colour,
              tt.name AS to_name,   tt.avatar_colour AS to_colour
       FROM transfers t
       JOIN travellers tf ON tf.id = t.from_traveller
       JOIN travellers tt ON tt.id = t.to_traveller
       WHERE t.trip_id = $1
       ORDER BY t.transfer_date DESC, t.created_at DESC`,
      [req.params.tripId]
    );
    res.json(result.rows.map((r) => ({
      ...r,
      amount:      parseFloat(r.amount),
      amount_home: r.amount_home ? parseFloat(r.amount_home) : null,
    })));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /trips/:tripId/transfers
router.post('/trips/:tripId/transfers', async (req: Request, res: Response) => {
  try {
    const { tripId } = req.params;
    const { from_traveller, to_traveller, amount, currency, note, transfer_date } = req.body;

    if (!from_traveller || !to_traveller || !amount || !currency) {
      return res.status(400).json({ error: 'from_traveller, to_traveller, amount, currency are required' });
    }
    if (from_traveller === to_traveller) {
      return res.status(400).json({ error: 'from_traveller and to_traveller must be different' });
    }

    // Resolve amount in home currency
    const tripResult = await pool.query(`SELECT home_currency FROM trips WHERE id = $1`, [tripId]);
    if (tripResult.rows.length === 0) return res.status(404).json({ error: 'Trip not found' });
    const homeCurrency: string = tripResult.rows[0].home_currency;

    let amountHome: number | null = null;
    try {
      if (currency === homeCurrency) {
        amountHome = parseFloat(amount);
      } else {
        const { rate } = await getRate(currency, homeCurrency);
        amountHome = Math.round(parseFloat(amount) * rate * 100) / 100;
      }
    } catch {
      // If rate lookup fails, store without home amount
    }

    const result = await pool.query(
      `INSERT INTO transfers (trip_id, from_traveller, to_traveller, amount, currency, amount_home, note, transfer_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [tripId, from_traveller, to_traveller, parseFloat(amount), currency, amountHome,
       note || null, transfer_date || new Date().toISOString().split('T')[0]]
    );

    const row = result.rows[0];
    res.status(201).json({
      ...row,
      amount:      parseFloat(row.amount),
      amount_home: row.amount_home ? parseFloat(row.amount_home) : null,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// PATCH /transfers/:id — edit a transfer
router.patch('/transfers/:id', async (req: Request, res: Response) => {
  try {
    const { amount, currency, note, transfer_date, from_traveller, to_traveller } = req.body;
    const result = await pool.query(
      `UPDATE transfers
       SET amount = COALESCE($1, amount),
           currency = COALESCE($2, currency),
           note = $3,
           transfer_date = COALESCE($4, transfer_date),
           from_traveller = COALESCE($5, from_traveller),
           to_traveller = COALESCE($6, to_traveller)
       WHERE id = $7
       RETURNING *`,
      [amount ?? null, currency ?? null, note ?? null, transfer_date ?? null,
       from_traveller ?? null, to_traveller ?? null, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const row = result.rows[0];
    res.json({ ...row, amount: parseFloat(row.amount), amount_home: row.amount_home ? parseFloat(row.amount_home) : null });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// DELETE /transfers/:id
router.delete('/transfers/:id', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `DELETE FROM transfers WHERE id = $1 RETURNING id`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
