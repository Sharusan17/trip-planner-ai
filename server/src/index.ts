import dotenv from 'dotenv';
dotenv.config();

import app from './app';
import { runMigrations } from './db/migrate';

const PORT = process.env.PORT || 3001;

async function start() {
  await runMigrations();
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
