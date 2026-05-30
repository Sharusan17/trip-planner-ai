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
// Handles null amount_home (currency API failures) by resolving rates on-the-fly.
// Uses proportional split recomputation so rounding drift can't cause phantom debt.
router.post('/trips/:tripId/settlements/calculate', async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const { tripId } = req.params;

    const tripResult = await client.query(`SELECT home_currency FROM trips WHERE id = $1`, [tripId]);
    if (tripResult.rows.length === 0) return res.status(404).json({ error: 'Trip not found' });
    const homeCurrency: string = tripResult.rows[0].home_currency;

    // Rate cache — avoid duplicate API calls for the same currency pair
    const rateCache: Record<string, number> = {};
    async function toHome(amount: number, currency: string, storedHome: number | null): Promise<number> {
      if (storedHome !== null) return storedHome;
      if (currency === homeCurrency) return amount;
      const key = `${currency}:${homeCurrency}`;
      if (rateCache[key] === undefined) {
        try {
          const { rate } = await getRate(currency, homeCurrency);
          rateCache[key] = rate;
        } catch {
          // If rate still unavailable, fall back to 1:1 so the expense is at least counted.
          // This is incorrect in absolute terms but far better than silently dropping the debt.
          rateCache[key] = 1;
        }
      }
      return Math.round(amount * rateCache[key] * 100) / 100;
    }

    // Fetch ALL expenses with their splits (including those with null amount_home)
    const expensesResult = await client.query(
      `SELECT e.id, e.paid_by, e.amount::float AS amount, e.currency, e.amount_home::float AS amount_home,
              COALESCE(
                json_agg(
                  json_build_object(
                    'traveller_id', es.traveller_id,
                    'amount',       es.amount::float
                  ) ORDER BY es.traveller_id
                ) FILTER (WHERE es.id IS NOT NULL),
                '[]'
              ) AS splits
       FROM expenses e
       LEFT JOIN expense_splits es ON es.expense_id = e.id
       WHERE e.trip_id = $1
       GROUP BY e.id`,
      [tripId]
    );

    const netMap: Record<string, number> = {};

    for (const row of expensesResult.rows) {
      const expAmount: number = row.amount;
      const expHome = await toHome(expAmount, row.currency, row.amount_home);

      // Credit: payer paid expHome in home currency
      netMap[row.paid_by] = (netMap[row.paid_by] ?? 0) + expHome;

      // Debit: each split person owes their proportional share of expHome.
      // We recompute proportionally from the resolved expHome rather than trusting
      // stored split.amount_home so that rounding drift and past null values are healed.
      const splits: Array<{ traveller_id: string; amount: number }> = row.splits;
      if (splits.length > 0) {
        const splitTotal = splits.reduce((s, sp) => s + sp.amount, 0);
        let debitedSoFar = 0;
        for (let i = 0; i < splits.length; i++) {
          const sp = splits[i];
          let debit: number;
          if (i === splits.length - 1) {
            // Last split absorbs any floating-point remainder
            debit = Math.round((expHome - debitedSoFar) * 100) / 100;
          } else {
            debit = splitTotal > 0
              ? Math.round(sp.amount / splitTotal * expHome * 100) / 100
              : 0;
            debitedSoFar += debit;
          }
          netMap[sp.traveller_id] = (netMap[sp.traveller_id] ?? 0) - debit;
        }
      }
    }

    // Adjust for transfers: payer gains credit, receiver loses credit
    const transfersResult = await client.query(
      `SELECT from_traveller, to_traveller, amount::float, currency, amount_home::float AS amount_home
       FROM transfers WHERE trip_id = $1`,
      [tripId]
    );
    for (const row of transfersResult.rows) {
      const amt = await toHome(row.amount, row.currency, row.amount_home);
      netMap[row.from_traveller] = (netMap[row.from_traveller] ?? 0) + amt;
      netMap[row.to_traveller]   = (netMap[row.to_traveller]   ?? 0) - amt;
    }

    // Adjust for already-paid settlements (money that has already physically moved)
    const paidResult = await client.query(
      `SELECT from_traveller, to_traveller, amount::float FROM settlements
       WHERE trip_id = $1 AND status = 'paid'`,
      [tripId]
    );
    for (const row of paidResult.rows) {
      const amt: number = row.amount;
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

    // Fetch current row so we can recalculate amount_home if amount or currency changed
    const existing = await pool.query(
      `SELECT t.*, tr.home_currency
       FROM transfers t
       JOIN trips tr ON tr.id = t.trip_id
       WHERE t.id = $1`,
      [req.params.id]
    );
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const prev = existing.rows[0];
    const homeCurrency: string = prev.home_currency;

    const newAmount = amount !== undefined ? parseFloat(amount) : parseFloat(prev.amount);
    const newCurrency = currency ?? prev.currency;

    let amountHome: number | null = prev.amount_home ? parseFloat(prev.amount_home) : null;
    // Recalculate amount_home whenever amount or currency changes
    if (amount !== undefined || currency !== undefined) {
      try {
        if (newCurrency === homeCurrency) {
          amountHome = newAmount;
        } else {
          const { rate } = await getRate(newCurrency, homeCurrency);
          amountHome = Math.round(newAmount * rate * 100) / 100;
        }
      } catch {
        amountHome = null;
      }
    }

    const result = await pool.query(
      `UPDATE transfers
       SET amount = $1,
           currency = $2,
           amount_home = $3,
           note = $4,
           transfer_date = COALESCE($5, transfer_date),
           from_traveller = COALESCE($6, from_traveller),
           to_traveller = COALESCE($7, to_traveller)
       WHERE id = $8
       RETURNING *`,
      [newAmount, newCurrency, amountHome, note ?? null,
       transfer_date ?? null, from_traveller ?? null, to_traveller ?? null,
       req.params.id]
    );
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
