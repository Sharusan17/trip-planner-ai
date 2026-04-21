import pool from '../db/pool';
import { createLogger } from '../utils/logger';

const log = createLogger('currency');
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
    const rate = parseFloat(cached.rows[0].rate);
    log.info(`${base}→${target}: cache HIT`, { rate, fetched_at: cached.rows[0].fetched_at });
    return { rate, fetched_at: cached.rows[0].fetched_at };
  }

  log.debug(`${base}→${target}: cache MISS, fetching`);
  const start = Date.now();
  const res = await fetch(`${EXCHANGE_RATE_API}/${base}`);
  const dur = Date.now() - start;

  if (!res.ok) {
    log.warn(`${base}→${target}: upstream HTTP ${res.status} in ${dur}ms, trying stale cache`);
    const stale = await pool.query(
      'SELECT rate, fetched_at FROM currency_cache WHERE base_currency = $1 AND target_currency = $2',
      [base, target]
    );
    if (stale.rows.length > 0) {
      log.info(`${base}→${target}: serving stale cache`, { fetched_at: stale.rows[0].fetched_at });
      return { rate: parseFloat(stale.rows[0].rate), fetched_at: stale.rows[0].fetched_at };
    }
    log.error(`${base}→${target}: no rate available (upstream failed, no cache)`);
    throw new Error('Failed to fetch exchange rate');
  }

  const data = await res.json();
  const rate = data.rates?.[target];
  if (!rate) {
    log.warn(`${base}→${target}: rate missing in response in ${dur}ms`, { resultKeys: Object.keys(data.rates ?? {}).length });
    throw new Error(`Rate not found for ${target}`);
  }

  await pool.query(
    `INSERT INTO currency_cache (base_currency, target_currency, rate, fetched_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (base_currency, target_currency) DO UPDATE SET rate = $3, fetched_at = NOW()`,
    [base, target, rate]
  );

  log.info(`${base}→${target}: fresh rate in ${dur}ms`, { rate });
  return { rate, fetched_at: new Date().toISOString() };
}
