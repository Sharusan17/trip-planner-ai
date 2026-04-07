import express from 'express';
import cors from 'cors';
import { errorHandler } from './middleware/errorHandler';
import tripsRouter from './routes/trips';
import travellersRouter from './routes/travellers';
import itineraryRouter from './routes/itinerary';
import locationsRouter from './routes/locations';
import weatherRouter from './routes/weather';
import currencyRouter from './routes/currency';

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/v1/trips', tripsRouter);
app.use('/api/v1', travellersRouter);
app.use('/api/v1', itineraryRouter);
app.use('/api/v1', locationsRouter);
app.use('/api/v1/weather', weatherRouter);
app.use('/api/v1/currency', currencyRouter);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use(errorHandler);

export default app;
