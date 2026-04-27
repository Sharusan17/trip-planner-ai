import { Router } from 'express';
import pool from '../db/pool';
import { getRate } from '../services/currencyService';
import { uploadReceipt } from '../middleware/upload';
import type { ExpenseCategory } from '@trip-planner-ai/shared';

const router = Router();

const parseClaimRow = (row: any) => ({
  ...row,
  total_amount: parseFloat(row.total_amount),
});

const parseResponseRow = (row: any) => ({
  ...row,
  claimed_amount: row.claimed_amount ? parseFloat(row.claimed_amount) : null,
  split_with_ids: row.split_with_ids ?? [],
});

// ── GET /trips/:tripId/claims — all claims with response progress
router.get('/trips/:tripId/claims', async (req, res) => {
  try {
    const { tripId } = req.params;
    const result = await pool.query(
      `SELECT ec.*, t.name AS created_by_name, t.avatar_colour AS created_by_colour,
         COUNT(ecr.id)::INT AS response_count,
         (SELECT COUNT(*) FROM travellers WHERE trip_id = $1)::INT AS total_travellers
       FROM expense_claims ec
       JOIN travellers t ON t.id = ec.created_by
       LEFT JOIN expense_claim_responses ecr ON ecr.claim_id = ec.id
       WHERE ec.trip_id = $1
       GROUP BY ec.id, t.name, t.avatar_colour
       ORDER BY ec.created_at DESC`,
      [tripId]
    );
    res.json(result.rows.map(parseClaimRow));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── GET /trips/:tripId/claims/pending/:travellerId — open claims traveller hasn't responded to
router.get('/trips/:tripId/claims/pending/:travellerId', async (req, res) => {
  try {
    const { tripId, travellerId } = req.params;
    const result = await pool.query(
      `SELECT ec.*, t.name AS created_by_name, t.avatar_colour AS created_by_colour
       FROM expense_claims ec
       JOIN travellers t ON t.id = ec.created_by
       WHERE ec.trip_id = $1
         AND ec.status = 'open'
         AND ec.created_by != $2
         AND NOT EXISTS (
           SELECT 1 FROM expense_claim_responses ecr
           WHERE ecr.claim_id = ec.id AND ecr.traveller_id = $2
         )
       ORDER BY ec.created_at ASC`,
      [tripId, travellerId]
    );
    res.json(result.rows.map(parseClaimRow));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── GET /claims/:id — single claim with all responses
router.get('/claims/:id', async (req, res) => {
  try {
    const claimResult = await pool.query(
      `SELECT ec.*, t.name AS created_by_name, t.avatar_colour AS created_by_colour,
         (SELECT COUNT(*) FROM travellers WHERE trip_id = ec.trip_id)::INT AS total_travellers
       FROM expense_claims ec
       JOIN travellers t ON t.id = ec.created_by
       WHERE ec.id = $1`,
      [req.params.id]
    );
    if (claimResult.rows.length === 0) return res.status(404).json({ error: 'Not found' });

    const responsesResult = await pool.query(
      `SELECT ecr.*, t.name AS traveller_name, t.avatar_colour AS traveller_colour
       FROM expense_claim_responses ecr
       JOIN travellers t ON t.id = ecr.traveller_id
       WHERE ecr.claim_id = $1
       ORDER BY ecr.responded_at`,
      [req.params.id]
    );

    const claim = parseClaimRow(claimResult.rows[0]);
    claim.responses = responsesResult.rows.map(parseResponseRow);
    claim.response_count = claim.responses.length;
    res.json(claim);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── POST /trips/:tripId/claims — create a claim (multipart)
router.post(
  '/trips/:tripId/claims',
  uploadReceipt.single('receipt'),
  async (req, res) => {
    try {
      const { tripId } = req.params;
      const {
        created_by, description, total_amount, currency, category,
        expense_date, notes, line_items,
      } = req.body;

      const parsedLineItems = line_items
        ? typeof line_items === 'string' ? JSON.parse(line_items) : line_items
        : null;

      const result = await pool.query(
        `INSERT INTO expense_claims
           (trip_id, created_by, description, total_amount, currency, category,
            expense_date, notes, line_items, receipt_data, receipt_mime, receipt_filename)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING *`,
        [
          tripId,
          created_by,
          description,
          parseFloat(total_amount),
          currency,
          (category as ExpenseCategory) || 'other',
          expense_date || new Date().toISOString().split('T')[0],
          notes || null,
          parsedLineItems ? JSON.stringify(parsedLineItems) : null,
          req.file?.buffer ?? null,
          req.file?.mimetype ?? null,
          req.file?.originalname ?? null,
        ]
      );

      const creatorResult = await pool.query(
        `SELECT name, avatar_colour FROM travellers WHERE id = $1`,
        [created_by]
      );

      const claim = parseClaimRow(result.rows[0]);
      claim.created_by_name = creatorResult.rows[0]?.name;
      claim.created_by_colour = creatorResult.rows[0]?.avatar_colour;
      claim.responses = [];
      claim.response_count = 0;

      res.status(201).json(claim);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  }
);

// ── GET /claims/:id/receipt — serve receipt binary
router.get('/claims/:id/receipt', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT receipt_data, receipt_mime FROM expense_claims WHERE id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0 || !result.rows[0].receipt_data) {
      return res.status(404).json({ error: 'No receipt' });
    }
    res.set('Content-Type', result.rows[0].receipt_mime || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=31536000');
    res.send(result.rows[0].receipt_data);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── POST /claims/:id/respond — traveller submits / updates response
router.post('/claims/:id/respond', async (req, res) => {
  try {
    const { traveller_id, action, claimed_amount, split_with_ids, note } = req.body;

    if (!traveller_id || !action) {
      return res.status(400).json({ error: 'traveller_id and action are required' });
    }

    const claimCheck = await pool.query(
      `SELECT status FROM expense_claims WHERE id = $1`,
      [req.params.id]
    );
    if (claimCheck.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    if (claimCheck.rows[0].status !== 'open') {
      return res.status(409).json({ error: 'Claim is no longer open' });
    }

    const result = await pool.query(
      `INSERT INTO expense_claim_responses
         (claim_id, traveller_id, action, claimed_amount, split_with_ids, note)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (claim_id, traveller_id) DO UPDATE SET
         action = EXCLUDED.action,
         claimed_amount = EXCLUDED.claimed_amount,
         split_with_ids = EXCLUDED.split_with_ids,
         note = EXCLUDED.note,
         responded_at = NOW()
       RETURNING *`,
      [
        req.params.id,
        traveller_id,
        action,
        claimed_amount != null ? parseFloat(claimed_amount) : null,
        JSON.stringify(split_with_ids ?? []),
        note || null,
      ]
    );

    res.json(parseResponseRow(result.rows[0]));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── POST /claims/:id/approve — organiser approves → creates expense + splits
router.post('/claims/:id/approve', async (req, res) => {
  const client = await pool.connect();
  try {
    // Fetch open claim
    const claimResult = await client.query(
      `SELECT * FROM expense_claims WHERE id = $1 AND status = 'open'`,
      [req.params.id]
    );
    if (claimResult.rows.length === 0) {
      return res.status(404).json({ error: 'Open claim not found' });
    }
    const claim = claimResult.rows[0];

    // Fetch all responses
    const responsesResult = await client.query(
      `SELECT * FROM expense_claim_responses WHERE claim_id = $1`,
      [req.params.id]
    );
    const responses = responsesResult.rows;

    const totalAmount = parseFloat(claim.total_amount);
    const round2 = (n: number) => Math.round(n * 100) / 100;

    // Build splits map
    const splits: Record<string, number> = {};

    for (const r of responses) {
      if (r.action === 'accepted') {
        // Full claim — treated as "I own this fully"
        splits[r.traveller_id] = (splits[r.traveller_id] ?? 0) + totalAmount;
      } else if (r.action === 'partial' && r.claimed_amount != null) {
        const claimedAmt = parseFloat(r.claimed_amount);
        const coSplitters: string[] = r.split_with_ids ?? [];
        if (coSplitters.length > 0) {
          const perPerson = claimedAmt / (coSplitters.length + 1);
          splits[r.traveller_id] = (splits[r.traveller_id] ?? 0) + perPerson;
          for (const sid of coSplitters) {
            splits[sid] = (splits[sid] ?? 0) + perPerson;
          }
        } else {
          splits[r.traveller_id] = (splits[r.traveller_id] ?? 0) + claimedAmt;
        }
      }
      // declined → nothing
    }

    if (Object.keys(splits).length === 0) {
      return res.status(422).json({ error: 'No accepted responses to build splits from. Ask travellers to respond first.' });
    }

    // Normalise splits to total_amount
    const rawTotal = Object.values(splits).reduce((s, v) => s + v, 0);
    if (rawTotal > 0 && Math.abs(rawTotal - totalAmount) >= 0.005) {
      const factor = totalAmount / rawTotal;
      for (const tid in splits) splits[tid] = round2(splits[tid] * factor);
      // Rounding fix on first traveller
      const tids = Object.keys(splits);
      const actual = Object.values(splits).reduce((s, v) => s + v, 0);
      splits[tids[0]] = round2(splits[tids[0]] + totalAmount - actual);
    }

    // Get trip home currency for conversion
    const tripResult = await client.query(
      `SELECT home_currency FROM trips WHERE id = $1`,
      [claim.trip_id]
    );
    const homeCurrency = tripResult.rows[0]?.home_currency ?? 'GBP';

    let amountHome: number | null = null;
    try {
      if (claim.currency !== homeCurrency) {
        const { rate } = await getRate(claim.currency, homeCurrency);
        amountHome = round2(totalAmount * rate);
      } else {
        amountHome = totalAmount;
      }
    } catch {
      amountHome = null;
    }

    await client.query('BEGIN');

    // Create the expense
    const expenseResult = await client.query(
      `INSERT INTO expenses
         (trip_id, paid_by, amount, currency, amount_home, description, category,
          split_mode, expense_date, notes, line_items, receipt_data, receipt_mime, receipt_filename)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'custom',$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [
        claim.trip_id,
        claim.created_by,
        totalAmount,
        claim.currency,
        amountHome,
        claim.description,
        claim.category,
        claim.expense_date,
        claim.notes,
        claim.line_items,
        claim.receipt_data,
        claim.receipt_mime,
        claim.receipt_filename,
      ]
    );
    const expense = expenseResult.rows[0];

    // Create splits
    for (const [travellerId, amount] of Object.entries(splits)) {
      const splitHome = amountHome != null && totalAmount > 0
        ? round2(amount * (amountHome / totalAmount))
        : null;
      await client.query(
        `INSERT INTO expense_splits (expense_id, traveller_id, amount, amount_home)
         VALUES ($1,$2,$3,$4)`,
        [expense.id, travellerId, amount, splitHome]
      );
    }

    // Mark claim approved
    await client.query(
      `UPDATE expense_claims SET status = 'approved', approved_expense_id = $1, updated_at = NOW()
       WHERE id = $2`,
      [expense.id, req.params.id]
    );

    await client.query('COMMIT');

    res.json({
      expense: { ...expense, amount: parseFloat(expense.amount) },
      claim_id: req.params.id,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: (err as Error).message });
  } finally {
    client.release();
  }
});

// ── PATCH /claims/:id/cancel — organiser cancels
router.patch('/claims/:id/cancel', async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE expense_claims SET status = 'cancelled', updated_at = NOW()
       WHERE id = $1 AND status = 'open'
       RETURNING id`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Open claim not found' });
    }
    res.json({ cancelled: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
