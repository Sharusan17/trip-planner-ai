import dotenv from 'dotenv';
dotenv.config();

import app from './app';
import { runMigrations } from './db/migrate';
import { createLogger } from './utils/logger';

const log = createLogger('startup');
const PORT = process.env.PORT || 3001;

async function start() {
  log.info('Running database migrations');
  const migrateStart = Date.now();
  await runMigrations();
  log.info(`Migrations complete in ${Date.now() - migrateStart}ms`);

  app.listen(PORT, () => {
    log.info(`Server listening on port ${PORT}`);
  });
}

start().catch((err) => {
  log.error('Failed to start server', { message: (err as Error).message, stack: (err as Error).stack });
  process.exit(1);
});
