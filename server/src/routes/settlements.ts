import { Router, Request, Response } from 'express';
import pool from '../db/pool';
import { getRate } from '../services/currencyService';

const router = Router();

// ── Sign convention (used throughout this file) ──────────────────────────────
//   net > 0  →  traveller is OWED money (creditor)
//   net < 0  →  traveller OWES money  (debtor)
//
// All internal calculations use INTEGER MINOR UNITS (pence / cents).
// Values are only converted to/from major units at the DB boundary.
// ─────────────────────────────────────────────────────────────────────────────

/** Convert a decimal major-unit amount to integer minor units (pence). */
const toPence = (majorUnits: number): number => Math.round(majorUnits * 100);

/** Convert integer minor units back to a 2-decimal major-unit string for DB storage. */
const penceToDecimal = (pence: number): string => (pence / 100).toFixed(2);

interface Balance {
  traveller_id: string;
  net: number; // in pence (integer)
}

/**
 * Greedy debt-simplification algorithm.
 * Input balances are in integer pence.
 * Returns settlements with amounts in integer pence.
 * Uses strict === 0 termination — no floating-point tolerance needed.
 */
function simplifyDebts(balances: Balance[]): { from: string; to: string; pence: number }[] {
  // creditors: net > 0 (owed money), sorted descending
  const creditors = balances
    .filter((b) => b.net > 0)
    .sort((a, b) => b.net - a.net)
    .map((b) => ({ ...b }));

  // debtors: net < 0 (owe money), sorted ascending (most negative first)
  const debtors = balances
    .filter((b) => b.net < 0)
    .sort((a, b) => a.net - b.net)
    .map((b) => ({ ...b }));

  const results: { from: string; to: string; pence: number }[] = [];

  while (creditors.length > 0 && debtors.length > 0) {
    const creditor = creditors[0];
    const debtor   = debtors[0];

    // Integer min — no rounding needed, no accumulated error
    const pence = Math.min(creditor.net, Math.abs(debtor.net));

    if (pence >= 1) { // at least 1p / 1¢ is worth recording
      results.push({ from: debtor.traveller_id, to: creditor.traveller_id, pence });
    }

    creditor.net -= pence;
    debtor.net   += pence;

    // Exact zero check — integers never drift
    if (creditor.net === 0) creditors.shift();
    if (debtor.net   === 0) debtors.shift();
  }

  return results;
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
// ─────────────────────────────────────────────────────────────────────────────
// Algorithm (all arithmetic in integer pence):
//
// 1. EXPENSES
//    For every expense:  payer net += expense_pence
//                        each split person net -= their proportional pence share
//    Split shares recomputed proportionally from the resolved home amount so that
//    rounding errors in stored splits are healed on every recalculate.
//
// 2. LEDGER ADJUSTMENTS
//    Both transfers and paid settlements are treated identically as ledger entries:
//      from_party net += pence  (they paid out → their debt reduced)
//      to_party   net -= pence  (they received → their credit reduced)
//
//    Transfers use stored amount_home (live rate fallback if null).
//    Paid settlements use paid_home_pence — the value frozen at payment time,
//    so exchange rate changes after the fact never retroactively alter history.
//
// 3. SIMPLIFY
//    Greedy pairing of largest creditor with largest debtor.
//    Integer pence throughout → exact === 0 termination, no tolerance hack.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/trips/:tripId/settlements/calculate', async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const { tripId } = req.params;

    const tripResult = await client.query(`SELECT home_currency FROM trips WHERE id = $1`, [tripId]);
    if (tripResult.rows.length === 0) return res.status(404).json({ error: 'Trip not found' });
    const homeCurrency: string = tripResult.rows[0].home_currency;

    // Rate cache — one API call per currency pair per recalculate
    const rateCache: Record<string, number> = {};
    async function toHomePence(amount: number, currency: string, storedHome: number | null): Promise<number> {
      // Always prefer stored home value — it was captured at transaction time
      if (storedHome !== null) return toPence(storedHome);
      if (currency === homeCurrency) return toPence(amount);
      const key = `${currency}:${homeCurrency}`;
      if (rateCache[key] === undefined) {
        try {
          const { rate } = await getRate(currency, homeCurrency);
          rateCache[key] = rate;
        } catch {
          // Rate unavailable — use 1:1 so the debt isn't silently dropped.
          // These expenses are flagged so the organiser can spot them.
          rateCache[key] = 1;
        }
      }
      return toPence(amount * rateCache[key]);
    }

    // net values in integer pence
    // positive = owed money (creditor), negative = owes money (debtor)
    const netPence: Record<string, number> = {};

    // ── 1. EXPENSES ──────────────────────────────────────────────────────────
    const expensesResult = await client.query(
      `SELECT e.id, e.paid_by, e.amount::float AS amount, e.currency,
              e.amount_home::float AS amount_home,
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

    for (const row of expensesResult.rows) {
      const expPence = await toHomePence(row.amount, row.currency, row.amount_home);

      // Credit: payer is owed the full amount
      netPence[row.paid_by] = (netPence[row.paid_by] ?? 0) + expPence;

      // Debit: each split person owes their proportional share.
      // Proportional recomputation heals any past rounding drift in stored splits.
      const splits: Array<{ traveller_id: string; amount: number }> = row.splits;
      if (splits.length > 0) {
        const splitTotal = splits.reduce((s, sp) => s + sp.amount, 0);
        let debitedPence = 0;
        for (let i = 0; i < splits.length; i++) {
          const sp = splits[i];
          const debit = i === splits.length - 1
            ? expPence - debitedPence                               // last person absorbs remainder
            : splitTotal > 0
              ? Math.round(sp.amount / splitTotal * expPence)       // proportional integer pence
              : 0;
          netPence[sp.traveller_id] = (netPence[sp.traveller_id] ?? 0) - debit;
          debitedPence += debit;
        }
      }
    }

    // ── 2. LEDGER ADJUSTMENTS ─────────────────────────────────────────────────
    // Transfers and paid settlements are treated identically:
    //   from_party paid → from_party net increases (debt reduced)
    //   to_party received → to_party net decreases (credit reduced)

    // Transfers — use stored amount_home, fall back to live rate only if null
    const transfersResult = await client.query(
      `SELECT from_traveller, to_traveller,
              amount::float, currency, amount_home::float AS amount_home
       FROM transfers WHERE trip_id = $1`,
      [tripId]
    );
    for (const row of transfersResult.rows) {
      const adjPence = await toHomePence(row.amount, row.currency, row.amount_home);
      netPence[row.from_traveller] = (netPence[row.from_traveller] ?? 0) + adjPence;
      netPence[row.to_traveller]   = (netPence[row.to_traveller]   ?? 0) - adjPence;
    }

    // Paid settlements — use paid_home_pence frozen at payment time.
    // This ensures the adjustment always reflects the exact rate when money moved.
    // Falls back to ROUND(amount*100) if paid_home_pence is null (legacy rows).
    const paidResult = await client.query(
      `SELECT from_traveller, to_traveller,
              COALESCE(paid_home_pence, ROUND(amount * 100)::BIGINT) AS adj_pence
       FROM settlements
       WHERE trip_id = $1 AND status = 'paid'`,
      [tripId]
    );
    for (const row of paidResult.rows) {
      const adjPence: number = Number(row.adj_pence);
      netPence[row.from_traveller] = (netPence[row.from_traveller] ?? 0) + adjPence;
      netPence[row.to_traveller]   = (netPence[row.to_traveller]   ?? 0) - adjPence;
    }

    // ── 3. SIMPLIFY & STORE ───────────────────────────────────────────────────
    const balances: Balance[] = Object.entries(netPence).map(([traveller_id, net]) => ({
      traveller_id,
      net, // already integer pence
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
        [tripId, s.from, s.to, penceToDecimal(s.pence), homeCurrency]
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
// Freeze paid_home_pence at the moment of payment — this is the integer pence value
// used for future ledger adjustments, ensuring exchange rate changes don't retroactively
// alter how much was "already settled".
router.patch('/settlements/:id/pay', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `UPDATE settlements
       SET status = 'paid',
           paid_at = NOW(),
           paid_home_pence = ROUND(amount * 100)::BIGINT
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
