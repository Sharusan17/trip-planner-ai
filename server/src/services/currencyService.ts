import pool from '../db/pool';

const EXCHANGE_RATE_API = 'https://open.er-api.com/v6/latest';

export async function getRate(base: string, target: string): Promise<{ rate: number; fetched_at: string }> {
  // Check cache (1 hour TTL)
  const cached = await pool.query(
    `SELECT rate, fetched_at FROM currency_cache
     WHERE base_currency = $1 AND target_currency = $2
     AND fetched_at > NOW() - INTERVAL '1 hour'`,
    [base, target]
  );

  if (cached.rows.length > 0) {
    return {
      rate: parseFloat(cached.rows[0].rate),
      fetched_at: cached.rows[0].fetched_at,
    };
  }

  // Fetch fresh rate
  const res = await fetch(`${EXCHANGE_RATE_API}/${base}`);
  if (!res.ok) {
    // Fallback to stale cache
    const stale = await pool.query(
      'SELECT rate, fetched_at FROM currency_cache WHERE base_currency = $1 AND target_currency = $2',
      [base, target]
    );
    if (stale.rows.length > 0) {
      return {
        rate: parseFloat(stale.rows[0].rate),
        fetched_at: stale.rows[0].fetched_at,
      };
    }
    throw new Error('Failed to fetch exchange rate');
  }

  const data = await res.json();
  const rate = data.rates?.[target];
  if (!rate) {
    throw new Error(`Rate not found for ${target}`);
  }

  // Upsert cache
  await pool.query(
    `INSERT INTO currency_cache (base_currency, target_currency, rate, fetched_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (base_currency, target_currency) DO UPDATE SET rate = $3, fetched_at = NOW()`,
    [base, target, rate]
  );

  return { rate, fetched_at: new Date().toISOString() };
}
