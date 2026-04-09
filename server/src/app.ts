import express from 'express';
import cors from 'cors';
import path from 'path';
import { errorHandler } from './middleware/errorHandler';
import tripsRouter from './routes/trips';
import travellersRouter from './routes/travellers';
import itineraryRouter from './routes/itinerary';
import locationsRouter from './routes/locations';
import weatherRouter from './routes/weather';
import currencyRouter from './routes/currency';
import expensesRouter from './routes/expenses';
import settlementsRouter from './routes/settlements';
import transportRouter from './routes/transport';
import accommodationRouter from './routes/accommodation';
import depositsRouter from './routes/deposits';

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/v1/trips', tripsRouter);
app.use('/api/v1', travellersRouter);
app.use('/api/v1', itineraryRouter);
app.use('/api/v1', locationsRouter);
app.use('/api/v1/weather', weatherRouter);
app.use('/api/v1/currency', currencyRouter);
app.use('/api/v1', expensesRouter);
app.use('/api/v1', settlementsRouter);
app.use('/api/v1', transportRouter);
app.use('/api/v1', accommodationRouter);
app.use('/api/v1', depositsRouter);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Serve React client in production
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, '../../dashboard/dist');
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use(errorHandler);

export default app;
