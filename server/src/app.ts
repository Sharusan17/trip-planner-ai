import express from 'express';
import cors from 'cors';
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
import announcementsRouter from './routes/announcements';
import pollsRouter from './routes/polls';
import photosRouter from './routes/photos';
import receiptsRouter from './routes/receipts';

const app = express();

app.use(cors({
  origin: process.env.DASHBOARD_URL ? [process.env.DASHBOARD_URL] : '*',
  credentials: true,
}));
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
app.use('/api/v1', announcementsRouter);
app.use('/api/v1', pollsRouter);
app.use('/api/v1', photosRouter);
app.use('/api/v1', receiptsRouter);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use(errorHandler);

export default app;
