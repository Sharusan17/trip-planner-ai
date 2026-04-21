import { Request, Response, NextFunction } from 'express';
import { createLogger } from '../utils/logger';

const log = createLogger('error');

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
  const reqId = (req as Request & { reqId?: string }).reqId;
  log.error(`${req.method} ${req.originalUrl} — ${err.message}`, {
    reqId,
    stack: err.stack,
  });
  if (!res.headersSent) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
