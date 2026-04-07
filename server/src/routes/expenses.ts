import { Router, Request, Response } from 'express';
import pool from '../db/pool';
import { getRate } from '../services/currencyService';
import type { SplitMode, ExpenseCategory } from '@trip-planner-ai/shared';

const router = Router();

interface SplitRow {
  traveller_id: string;
  amount: number;
}

function computeSplits(
  amount: number,
  splitMode: SplitMode,
  travellerIds: string[],
  weights: Record<string, number>,
  customSplits?: Record<string, number>
): SplitRow[] {
  const round2 = (n: number) => Math.round(n * 100) / 100;

  if (splitMode === 'equal') {
    const perPerson = round2(amount / travellerIds.length);
    const splits = travellerIds.map((id) => ({ traveller_id: id, amount: perPerson }));
    const diff = round2(amount - splits.reduce((s, r) => s + r.amount, 0));
    if (diff !== 0) splits[0].amount = round2(splits[0].amount + diff);
    return splits;
  }

  if (splitMode === 'weighted') {
    const totalWeight = travellerIds.reduce((s, id) => s + (weights[id] ?? 1), 0);
    if (totalWeight === 0) {
      return computeSplits(amount, 'equal', travellerIds, {});
    }
    const splits = travellerIds.map((id) => ({
      traveller_id: id,
      amount: round2(amount * (weights[id] ?? 1) / totalWeight),
    }));
    const diff = round2(amount - splits.reduce((s, r) => s + r.amount, 0));
    if (diff !== 0) splits[0].amount = round2(splits[0].amount + diff);
    return splits;
  }

  if (splitMode === 'custom' && customSplits) {
    return travellerIds.map((id) => ({
      traveller_id: id,
      amount: round2(customSplits[id] ?? 0),
    }));
  }

  return computeSplits(amount, 'equal', travellerIds, {});
}

// GET /trips/:tripId/expenses
router.get('/trips/:tripId/expenses', async (req: Request, res: Response) => {
  try {
    const { tripId } = req.params;
    const expensesResult = await pool.query(
      `SELECT * FROM expenses WHERE trip_id = $1 ORDER BY expense_date DESC, created_at DESC`,
      [tripId]
    );

    if (expensesResult.rows.length === 0) {
      return res.json([]);
    }

    const expenseIds = expensesResult.rows.map((e) => e.id);
    const splitsResult = await pool.query(
      `SELECT * FROM expense_splits WHERE expense_id = ANY($1)`,
      [expenseIds]
    );

    const splitsByExpense: Record<string, typeof splitsResult.rows> = {};
    for (const split of splitsResult.rows) {
      if (!splitsByExpense[split.expense_id]) splitsByExpense[split.expense_id] = [];
      splitsByExpense[split.expense_id].push(split);
    }

    const expenses = expensesResult.rows.map((e) => ({
      ...e,
      amount: parseFloat(e.amount),
      amount_home: e.amount_home ? parseFloat(e.amount_home) : null,
      splits: (splitsByExpense[e.id] || []).map((s) => ({
        ...s,
        amount: parseFloat(s.amount),
        amount_home: s.amount_home ? parseFloat(s.amount_home) : null,
      })),
    }));

    res.json(expenses);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /trips/:tripId/expenses/summary
router.get('/trips/:tripId/expenses/summary', async (req: Request, res: Response) => {
  try {
    const { tripId } = req.params;

    const result = await pool.query(
      `SELECT
         e.category,
         COALESCE(SUM(e.amount_home), 0) AS total_home,
         COUNT(e.id) AS count,
         b.amount AS budget_amount,
         b.currency AS budget_currency
       FROM expenses e
       LEFT JOIN expense_budgets b ON b.trip_id = e.trip_id AND b.category = e.category
       WHERE e.trip_id = $1
       GROUP BY e.category, b.amount, b.currency
       ORDER BY total_home DESC`,
      [tripId]
    );

    res.json(
      result.rows.map((r) => ({
        category: r.category,
        total_home: parseFloat(r.total_home),
        count: parseInt(r.count),
        budget_amount: r.budget_amount ? parseFloat(r.budget_amount) : null,
        budget_currency: r.budget_currency,
      }))
    );
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /expenses/:id
router.get('/expenses/:id', async (req: Request, res: Response) => {
  try {
    const expenseResult = await pool.query(`SELECT * FROM expenses WHERE id = $1`, [req.params.id]);
    if (expenseResult.rows.length === 0) return res.status(404).json({ error: 'Not found' });

    const splitsResult = await pool.query(
      `SELECT * FROM expense_splits WHERE expense_id = $1`,
      [req.params.id]
    );

    const e = expenseResult.rows[0];
    res.json({
      ...e,
      amount: parseFloat(e.amount),
      amount_home: e.amount_home ? parseFloat(e.amount_home) : null,
      splits: splitsResult.rows.map((s) => ({
        ...s,
        amount: parseFloat(s.amount),
        amount_home: s.amount_home ? parseFloat(s.amount_home) : null,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /trips/:tripId/expenses
router.post('/trips/:tripId/expenses', async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const { tripId } = req.params;
    const {
      paid_by, amount, currency, description, category, split_mode,
      expense_date, traveller_ids, custom_splits, notes,
    } = req.body;

    // Get traveller weights for weighted splits
    const travellersResult = await client.query(
      `SELECT id, cost_split_weight FROM travellers WHERE id = ANY($1)`,
      [traveller_ids]
    );
    const weights: Record<string, number> = {};
    for (const t of travellersResult.rows) {
      weights[t.id] = parseFloat(t.cost_split_weight);
    }

    const splits = computeSplits(parseFloat(amount), split_mode, traveller_ids, weights, custom_splits);

    // Resolve home currency
    const tripResult = await client.query(`SELECT home_currency FROM trips WHERE id = $1`, [tripId]);
    const homeCurrency: string = tripResult.rows[0]?.home_currency ?? 'GBP';
    let amountHome: number | null = null;
    try {
      if (currency !== homeCurrency) {
        const { rate } = await getRate(currency, homeCurrency);
        amountHome = Math.round(parseFloat(amount) * rate * 100) / 100;
      } else {
        amountHome = parseFloat(amount);
      }
    } catch {
      amountHome = null;
    }

    await client.query('BEGIN');

    const expResult = await client.query(
      `INSERT INTO expenses (trip_id, paid_by, amount, currency, amount_home, description, category, split_mode, expense_date, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [tripId, paid_by, amount, currency, amountHome, description,
       (category as ExpenseCategory) || 'other', split_mode || 'equal',
       expense_date || new Date().toISOString().split('T')[0], notes || null]
    );
    const expense = expResult.rows[0];

    const splitRows = [];
    for (const split of splits) {
      let splitHome: number | null = null;
      if (amountHome !== null) {
        splitHome = Math.round(split.amount * (amountHome / parseFloat(amount)) * 100) / 100;
      }
      const splitResult = await client.query(
        `INSERT INTO expense_splits (expense_id, traveller_id, amount, amount_home)
         VALUES ($1,$2,$3,$4) RETURNING *`,
        [expense.id, split.traveller_id, split.amount, splitHome]
      );
      splitRows.push(splitResult.rows[0]);
    }

    await client.query('COMMIT');

    res.status(201).json({
      ...expense,
      amount: parseFloat(expense.amount),
      amount_home: expense.amount_home ? parseFloat(expense.amount_home) : null,
      splits: splitRows.map((s) => ({
        ...s,
        amount: parseFloat(s.amount),
        amount_home: s.amount_home ? parseFloat(s.amount_home) : null,
      })),
    });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: (err as Error).message });
  } finally {
    client.release();
  }
});

// PUT /expenses/:id
router.put('/expenses/:id', async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const {
      paid_by, amount, currency, description, category, split_mode,
      expense_date, traveller_ids, custom_splits, notes,
    } = req.body;

    const existing = await client.query(`SELECT * FROM expenses WHERE id = $1`, [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const prev = existing.rows[0];

    const newAmount = amount !== undefined ? parseFloat(amount) : parseFloat(prev.amount);
    const newCurrency = currency ?? prev.currency;
    const newSplitMode: SplitMode = split_mode ?? prev.split_mode;
    const newTravellerIds: string[] = traveller_ids ?? [];

    const tripResult = await client.query(`SELECT home_currency FROM trips WHERE id = $1`, [prev.trip_id]);
    const homeCurrency: string = tripResult.rows[0]?.home_currency ?? 'GBP';
    let amountHome: number | null = prev.amount_home ? parseFloat(prev.amount_home) : null;
    if (amount !== undefined || currency !== undefined) {
      try {
        if (newCurrency !== homeCurrency) {
          const { rate } = await getRate(newCurrency, homeCurrency);
          amountHome = Math.round(newAmount * rate * 100) / 100;
        } else {
          amountHome = newAmount;
        }
      } catch {
        amountHome = null;
      }
    }

    await client.query('BEGIN');

    const updResult = await client.query(
      `UPDATE expenses SET
         paid_by = COALESCE($1, paid_by),
         amount = $2,
         currency = $3,
         amount_home = $4,
         description = COALESCE($5, description),
         category = COALESCE($6, category),
         split_mode = $7,
         expense_date = COALESCE($8, expense_date),
         notes = COALESCE($9, notes),
         updated_at = NOW()
       WHERE id = $10 RETURNING *`,
      [paid_by ?? null, newAmount, newCurrency, amountHome,
       description ?? null, category ?? null, newSplitMode,
       expense_date ?? null, notes ?? null, req.params.id]
    );
    const expense = updResult.rows[0];

    if (traveller_ids && traveller_ids.length > 0) {
      const travellersResult = await client.query(
        `SELECT id, cost_split_weight FROM travellers WHERE id = ANY($1)`,
        [newTravellerIds]
      );
      const weights: Record<string, number> = {};
      for (const t of travellersResult.rows) {
        weights[t.id] = parseFloat(t.cost_split_weight);
      }
      const splits = computeSplits(newAmount, newSplitMode, newTravellerIds, weights, custom_splits);

      await client.query(`DELETE FROM expense_splits WHERE expense_id = $1`, [req.params.id]);

      const splitRows = [];
      for (const split of splits) {
        let splitHome: number | null = null;
        if (amountHome !== null) {
          splitHome = Math.round(split.amount * (amountHome / newAmount) * 100) / 100;
        }
        const splitResult = await client.query(
          `INSERT INTO expense_splits (expense_id, traveller_id, amount, amount_home)
           VALUES ($1,$2,$3,$4) RETURNING *`,
          [req.params.id, split.traveller_id, split.amount, splitHome]
        );
        splitRows.push(splitResult.rows[0]);
      }

      await client.query('COMMIT');

      return res.json({
        ...expense,
        amount: parseFloat(expense.amount),
        amount_home: expense.amount_home ? parseFloat(expense.amount_home) : null,
        splits: splitRows.map((s) => ({
          ...s,
          amount: parseFloat(s.amount),
          amount_home: s.amount_home ? parseFloat(s.amount_home) : null,
        })),
      });
    }

    await client.query('COMMIT');

    const splitsResult = await client.query(
      `SELECT * FROM expense_splits WHERE expense_id = $1`,
      [req.params.id]
    );
    res.json({
      ...expense,
      amount: parseFloat(expense.amount),
      amount_home: expense.amount_home ? parseFloat(expense.amount_home) : null,
      splits: splitsResult.rows.map((s) => ({
        ...s,
        amount: parseFloat(s.amount),
        amount_home: s.amount_home ? parseFloat(s.amount_home) : null,
      })),
    });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: (err as Error).message });
  } finally {
    client.release();
  }
});

// DELETE /expenses/:id
router.delete('/expenses/:id', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`DELETE FROM expenses WHERE id = $1 RETURNING id`, [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /trips/:tripId/budgets
router.get('/trips/:tripId/budgets', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT * FROM expense_budgets WHERE trip_id = $1 ORDER BY category`,
      [req.params.tripId]
    );
    res.json(result.rows.map((r) => ({ ...r, amount: parseFloat(r.amount) })));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// PUT /trips/:tripId/budgets
router.put('/trips/:tripId/budgets', async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const { budgets } = req.body as { budgets: { category: ExpenseCategory; amount: number; currency: string }[] };
    await client.query('BEGIN');

    const results = [];
    for (const b of budgets) {
      const r = await client.query(
        `INSERT INTO expense_budgets (trip_id, category, amount, currency)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (trip_id, category) DO UPDATE SET amount = $3, currency = $4
         RETURNING *`,
        [req.params.tripId, b.category, b.amount, b.currency]
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

export default router;
