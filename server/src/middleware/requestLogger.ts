import { Request, Response, NextFunction } from 'express';
import { createLogger } from '../utils/logger';

const log = createLogger('http');

/**
 * Per-request structured log line.
 *
 * One "in" line when the request arrives, one "out" line when the response
 * flushes — with status, duration, and a short request id so you can correlate
 * them in Railway's log viewer.
 *
 * Query strings are redacted for sensitive keys (api_key, token, …) by the
 * logger itself. Request bodies are NOT logged — too noisy and may contain
 * PII. The content-length header is logged instead as a size signal.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  const reqId = Math.random().toString(36).slice(2, 8);
  (req as Request & { reqId?: string }).reqId = reqId;

  const contentLength = req.headers['content-length']
    ? parseInt(req.headers['content-length'] as string, 10)
    : undefined;

  log.info(`→ ${req.method} ${req.originalUrl}`, {
    reqId,
    query: Object.keys(req.query).length ? req.query : undefined,
    bytes: contentLength,
    ip: req.ip,
  });

  res.on('finish', () => {
    const dur = Date.now() - start;
    const status = res.statusCode;
    const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';
    log[level](`← ${req.method} ${req.originalUrl} ${status} ${dur}ms`, { reqId });
  });

  res.on('close', () => {
    if (!res.writableEnded) {
      const dur = Date.now() - start;
      log.warn(`✗ ${req.method} ${req.originalUrl} aborted ${dur}ms`, { reqId });
    }
  });

  next();
}
