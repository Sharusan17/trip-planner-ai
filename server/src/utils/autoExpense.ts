/**
 * Helpers for auto-creating and syncing flagged expenses that are linked
 * to transport/accommodation/activity bookings.
 *
 * Rules:
 *  - Created with split_mode = 'equal', split across the booking's assigned travellers.
 *  - Flagged so the organiser is reminded to review the split and confirm payment.
 *  - On booking update the linked expense is re-synced (amount, currency, splits, description).
 */

import type { PoolClient } from 'pg';
import { getRate } from '../services/currencyService';

const round2 = (n: number) => Math.round(n * 100) / 100;

async function resolveHome(
  amount: number,
  currency: string,
  homeCurrency: string,
): Promise<number | null> {
  if (currency === homeCurrency) return amount;
  try {
    const { rate } = await getRate(currency, homeCurrency);
    return round2(amount * rate);
  } catch {
    return null;
  }
}

/** Build equal splits with rounding correction so sum(splits) === total exactly. */
function buildSplits(
  travellerIds: string[],
  amount: number,
  amountHome: number | null,
): Array<{ traveller_id: string; amount: number; amount_home: number | null }> {
  const count = travellerIds.length;
  if (count === 0) return [];

  const perPerson = round2(amount / count);
  const splits = travellerIds.map((id) => ({ traveller_id: id, amount: perPerson, amount_home: null as number | null }));
  // Fix rounding remainder on first person
  const diff = round2(amount - splits.reduce((s, r) => s + r.amount, 0));
  if (diff !== 0) splits[0].amount = round2(splits[0].amount + diff);

  if (amountHome !== null) {
    let homeRunning = 0;
    for (let i = 0; i < splits.length; i++) {
      if (i === splits.length - 1) {
        splits[i].amount_home = round2(amountHome - homeRunning);
      } else {
        const sh = round2(splits[i].amount * (amountHome / amount));
        splits[i].amount_home = sh;
        homeRunning += sh;
      }
    }
  }

  return splits;
}

export interface AutoExpenseParams {
  tripId: string;
  paidBy: string;
  amount: number;
  currency: string;
  homeCurrency: string;
  description: string;
  category: string;
  expenseDate: string;   // YYYY-MM-DD
  travellerIds: string[];
}

/**
 * Creates a flagged expense linked to a booking.
 * Returns the new expense id, or null if travellerIds is empty.
 */
export async function createLinkedExpense(
  client: PoolClient,
  params: AutoExpenseParams,
): Promise<string | null> {
  const { tripId, paidBy, amount, currency, homeCurrency, description, category, expenseDate, travellerIds } = params;
  if (travellerIds.length === 0 || amount <= 0) return null;

  const amountHome = await resolveHome(amount, currency, homeCurrency);

  const expResult = await client.query(
    `INSERT INTO expenses
       (trip_id, paid_by, amount, currency, amount_home, description, category,
        split_mode, expense_date, flagged, flagged_reason)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'equal',$8,TRUE,
       'Auto-created from booking — review the split and confirm who paid')
     RETURNING id`,
    [tripId, paidBy, amount, currency, amountHome, description, category, expenseDate],
  );
  const expenseId: string = expResult.rows[0].id;

  for (const split of buildSplits(travellerIds, amount, amountHome)) {
    await client.query(
      `INSERT INTO expense_splits (expense_id, traveller_id, amount, amount_home)
       VALUES ($1,$2,$3,$4)`,
      [expenseId, split.traveller_id, split.amount, split.amount_home],
    );
  }

  return expenseId;
}

export interface SyncExpenseParams {
  expenseId: string;
  amount: number;
  currency: string;
  homeCurrency: string;
  description: string;
  travellerIds: string[];
}

/**
 * Re-syncs a previously auto-created expense when the booking is edited.
 * Updates amount, currency, splits, and re-flags for review.
 */
export async function syncLinkedExpense(
  client: PoolClient,
  params: SyncExpenseParams,
): Promise<void> {
  const { expenseId, amount, currency, homeCurrency, description, travellerIds } = params;

  const amountHome = await resolveHome(amount, currency, homeCurrency);

  await client.query(
    `UPDATE expenses
     SET amount       = $1,
         currency     = $2,
         amount_home  = $3,
         description  = $4,
         flagged      = TRUE,
         flagged_reason = 'Booking updated — re-check the split and confirm who paid',
         updated_at   = NOW()
     WHERE id = $5`,
    [amount, currency, amountHome, description, expenseId],
  );

  await client.query(`DELETE FROM expense_splits WHERE expense_id = $1`, [expenseId]);

  for (const split of buildSplits(travellerIds, amount, amountHome)) {
    await client.query(
      `INSERT INTO expense_splits (expense_id, traveller_id, amount, amount_home)
       VALUES ($1,$2,$3,$4)`,
      [expenseId, split.traveller_id, split.amount, split.amount_home],
    );
  }
}
