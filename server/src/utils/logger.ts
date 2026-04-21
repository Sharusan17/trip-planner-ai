/**
 * Tiny structured logger for the server.
 *
 * Output format:
 *   2026-04-21T11:30:12.345Z INFO  [flight] BA300 (2026-05-15): OK {"matched":1}
 *
 * - Single line per event so Railway's log viewer stays readable.
 * - Tag tells you which subsystem emitted it (http, flight, currency, db, …).
 * - Metadata is JSON-stringified on the same line so everything is greppable.
 *
 * Set LOG_LEVEL=debug on Railway to turn on verbose logging.
 * Default level is "info".
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function resolveMinLevel(): number {
  const env = (process.env.LOG_LEVEL ?? '').toLowerCase();
  return env in LEVEL_RANK ? LEVEL_RANK[env as LogLevel] : LEVEL_RANK.info;
}

const MIN_RANK = resolveMinLevel();

/** Hide sensitive values before they reach the logs. */
const SENSITIVE_KEY_RE = /key|token|password|secret|authorization/i;

function redact(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(redact);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SENSITIVE_KEY_RE.test(k) ? '[REDACTED]' : redact(v);
  }
  return out;
}

function safeStringify(value: unknown): string {
  try {
    if (typeof value === 'string') return value;
    return JSON.stringify(redact(value));
  } catch {
    return '[unserialisable]';
  }
}

function write(level: LogLevel, tag: string, msg: string, meta?: unknown): void {
  if (LEVEL_RANK[level] < MIN_RANK) return;
  const ts = new Date().toISOString();
  const base = `${ts} ${level.toUpperCase().padEnd(5)} [${tag}] ${msg}`;
  const line = meta === undefined ? base : `${base} ${safeStringify(meta)}`;
  // Match level → stream so Railway/stderr filters work as expected.
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export interface Logger {
  debug: (msg: string, meta?: unknown) => void;
  info: (msg: string, meta?: unknown) => void;
  warn: (msg: string, meta?: unknown) => void;
  error: (msg: string, meta?: unknown) => void;
  child: (suffix: string) => Logger;
}

export function createLogger(tag: string): Logger {
  return {
    debug: (msg, meta) => write('debug', tag, msg, meta),
    info: (msg, meta) => write('info', tag, msg, meta),
    warn: (msg, meta) => write('warn', tag, msg, meta),
    error: (msg, meta) => write('error', tag, msg, meta),
    child: (suffix: string) => createLogger(`${tag}:${suffix}`),
  };
}

export const log = createLogger('app');
