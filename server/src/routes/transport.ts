import { Router, Request, Response } from 'express';
import pool from '../db/pool';
import { getRate } from '../services/currencyService';
import { createLogger } from '../utils/logger';
import type { PoolClient } from 'pg';

const log = createLogger('transport');

const router = Router();

/**
 * Normalise a location string to an IATA code or lowercase city fragment for matching.
 * Extracts "(LHR)" from "London Heathrow (LHR)", otherwise lowercases and strips punctuation.
 */
function normaliseLocation(loc: string): string {
  const m = loc.match(/\(([A-Z]{3})\)/);
  if (m) return m[1].toUpperCase();
  return loc.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12);
}

/**
 * After inserting/updating a booking, try to find a complementary journey to auto-link.
 * A "return" match is: same trip, same transport_type, from=this.to, to=this.from,
 * departure AFTER this booking's departure, not yet linked.
 */
async function tryAutoLink(client: PoolClient,
  bookingId: string, tripId: string, transportType: string,
  fromLoc: string, toLoc: string, depTime: string,
): Promise<string | null> {
  const fromNorm = normaliseLocation(fromLoc);
  const toNorm = normaliseLocation(toLoc);
  const result = await client.query(
    `SELECT id FROM transport_bookings
     WHERE trip_id = $1
       AND transport_type = $2
       AND id <> $3
       AND linked_booking_id IS NULL
       AND departure_time > $4
     ORDER BY departure_time ASC
     LIMIT 20`,
    [tripId, transportType, bookingId, depTime]
  );
  for (const row of result.rows) {
    const candidate = await client.query(`SELECT from_location, to_location FROM transport_bookings WHERE id = $1`, [row.id]);
    if (candidate.rows.length === 0) continue;
    const cFrom = normaliseLocation(candidate.rows[0].from_location);
    const cTo = normaliseLocation(candidate.rows[0].to_location);
    // Return trip: candidate goes back the other way
    if (cFrom === toNorm && cTo === fromNorm) {
      // Link both ways
      await client.query(`UPDATE transport_bookings SET linked_booking_id = $1 WHERE id = $2`, [row.id, bookingId]);
      await client.query(`UPDATE transport_bookings SET linked_booking_id = $1 WHERE id = $2`, [bookingId, row.id]);
      log.info('auto-linked journeys', { outbound: bookingId, return: row.id });
      return row.id;
    }
  }
  return null;
}

async function attachTravellers(bookings: Record<string, unknown>[]): Promise<Record<string, unknown>[]> {
  if (bookings.length === 0) return bookings;
  const ids = bookings.map((b) => b.id);
  const result = await pool.query(
    `SELECT transport_id, traveller_id FROM transport_travellers WHERE transport_id = ANY($1)`,
    [ids]
  );
  const map: Record<string, string[]> = {};
  for (const row of result.rows) {
    if (!map[row.transport_id]) map[row.transport_id] = [];
    map[row.transport_id].push(row.traveller_id);
  }
  return bookings.map((b) => ({ ...b, traveller_ids: map[b.id as string] || [] }));
}

// GET /trips/:tripId/transport
router.get('/trips/:tripId/transport', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT * FROM transport_bookings WHERE trip_id = $1 ORDER BY departure_time`,
      [req.params.tripId]
    );
    const bookings = await attachTravellers(result.rows);
    res.json(bookings.map((b) => ({
      ...b,
      price: b.price ? parseFloat(b.price as string) : null,
      price_home: b.price_home ? parseFloat(b.price_home as string) : null,
    })));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /trips/:tripId/transport
router.post('/trips/:tripId/transport', async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const { tripId } = req.params;
    const {
      transport_type, from_location, to_location, departure_time, arrival_time,
      reference_number, price, currency, notes, traveller_ids,
      airline, departure_terminal, arrival_terminal, aircraft_type,
      linked_journey, // optional return leg
    } = req.body;

    const tripResult = await client.query(`SELECT home_currency FROM trips WHERE id = $1`, [tripId]);
    const homeCurrency: string = tripResult.rows[0]?.home_currency ?? 'GBP';

    async function calcPriceHome(p: string | number | undefined, cur: string | undefined): Promise<number | null> {
      if (!p || !cur) return null;
      const pNum = typeof p === 'number' ? p : parseFloat(p);
      if (isNaN(pNum)) return null;
      try {
        if (cur !== homeCurrency) {
          const { rate } = await getRate(cur, homeCurrency);
          return Math.round(pNum * rate * 100) / 100;
        }
        return pNum;
      } catch { return null; }
    }

    const priceHome = await calcPriceHome(price, currency);

    await client.query('BEGIN');

    const bookingResult = await client.query(
      `INSERT INTO transport_bookings
         (trip_id, transport_type, from_location, to_location, departure_time, arrival_time,
          reference_number, price, currency, price_home, notes,
          airline, departure_terminal, arrival_terminal, aircraft_type)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [tripId, transport_type, from_location, to_location, departure_time,
       arrival_time || null, reference_number || null,
       price || null, currency || null, priceHome, notes || null,
       airline || null, departure_terminal || null, arrival_terminal || null, aircraft_type || null]
    );
    const booking = bookingResult.rows[0];

    if (traveller_ids?.length > 0) {
      for (const tid of traveller_ids) {
        await client.query(
          `INSERT INTO transport_travellers (transport_id, traveller_id) VALUES ($1,$2)
           ON CONFLICT DO NOTHING`,
          [booking.id, tid]
        );
      }
    }

    // If a return leg is provided, create it and link both
    let returnBooking: Record<string, unknown> | null = null;
    if (linked_journey?.from_location && linked_journey?.to_location && linked_journey?.departure_time) {
      const lj = linked_journey;
      const returnPriceHome = await calcPriceHome(lj.price, lj.currency ?? currency);
      const retResult = await client.query(
        `INSERT INTO transport_bookings
           (trip_id, transport_type, from_location, to_location, departure_time, arrival_time,
            reference_number, price, currency, price_home, notes,
            airline, linked_booking_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
        [tripId, transport_type, lj.from_location, lj.to_location, lj.departure_time,
         lj.arrival_time || null, lj.reference_number || null,
         lj.price || null, lj.currency ?? currency ?? null, returnPriceHome, notes || null,
         airline || null, booking.id]
      );
      returnBooking = retResult.rows[0];
      const retId = returnBooking!.id as string;

      if (traveller_ids?.length > 0) {
        for (const tid of traveller_ids) {
          await client.query(
            `INSERT INTO transport_travellers (transport_id, traveller_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
            [retId, tid]
          );
        }
      }

      // Link main booking back to return
      await client.query(`UPDATE transport_bookings SET linked_booking_id = $1 WHERE id = $2`, [retId, booking.id]);
      log.info('created linked journey pair', { outbound: booking.id, return: retId });
    }

    await client.query('COMMIT');

    const finalRes = await pool.query(`SELECT * FROM transport_bookings WHERE id = $1`, [booking.id]);
    const final = finalRes.rows[0];

    res.status(201).json({
      ...final,
      price: final.price ? parseFloat(final.price) : null,
      price_home: final.price_home ? parseFloat(final.price_home) : null,
      linked_booking_id: returnBooking ? returnBooking.id : null,
      traveller_ids: traveller_ids || [],
    });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: (err as Error).message });
  } finally {
    client.release();
  }
});

// GET /transport/:id
router.get('/transport/:id', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`SELECT * FROM transport_bookings WHERE id = $1`, [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const bookings = await attachTravellers(result.rows);
    const b = bookings[0];
    res.json({
      ...b,
      price: b.price ? parseFloat(b.price as string) : null,
      price_home: b.price_home ? parseFloat(b.price_home as string) : null,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// PUT /transport/:id
router.put('/transport/:id', async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const {
      transport_type, from_location, to_location, departure_time, arrival_time,
      reference_number, price, currency, notes, traveller_ids,
      airline, departure_terminal, arrival_terminal, aircraft_type,
      linked_booking_id,
    } = req.body;

    const existing = await client.query(`SELECT * FROM transport_bookings WHERE id = $1`, [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const prev = existing.rows[0];

    const newPrice = price !== undefined ? parseFloat(price) : (prev.price ? parseFloat(prev.price) : null);
    const newCurrency = currency ?? prev.currency;
    const tripResult = await client.query(`SELECT home_currency FROM trips WHERE id = $1`, [prev.trip_id]);
    const homeCurrency: string = tripResult.rows[0]?.home_currency ?? 'GBP';
    let priceHome: number | null = prev.price_home ? parseFloat(prev.price_home) : null;
    if (price !== undefined || currency !== undefined) {
      try {
        if (newPrice && newCurrency && newCurrency !== homeCurrency) {
          const { rate } = await getRate(newCurrency, homeCurrency);
          priceHome = Math.round(newPrice * rate * 100) / 100;
        } else if (newPrice) {
          priceHome = newPrice;
        }
      } catch { priceHome = null; }
    }

    await client.query('BEGIN');

    const updResult = await client.query(
      `UPDATE transport_bookings SET
         transport_type = COALESCE($1, transport_type),
         from_location = COALESCE($2, from_location),
         to_location = COALESCE($3, to_location),
         departure_time = COALESCE($4, departure_time),
         arrival_time = COALESCE($5, arrival_time),
         reference_number = COALESCE($6, reference_number),
         price = $7, currency = $8, price_home = $9,
         notes = COALESCE($10, notes),
         airline = COALESCE($11, airline),
         departure_terminal = COALESCE($12, departure_terminal),
         arrival_terminal = COALESCE($13, arrival_terminal),
         aircraft_type = COALESCE($14, aircraft_type),
         linked_booking_id = COALESCE($15, linked_booking_id),
         updated_at = NOW()
       WHERE id = $16 RETURNING *`,
      [transport_type ?? null, from_location ?? null, to_location ?? null,
       departure_time ?? null, arrival_time ?? null, reference_number ?? null,
       newPrice, newCurrency, priceHome, notes ?? null,
       airline ?? null, departure_terminal ?? null, arrival_terminal ?? null, aircraft_type ?? null,
       linked_booking_id ?? null, req.params.id]
    );
    const booking = updResult.rows[0];

    if (traveller_ids !== undefined) {
      await client.query(`DELETE FROM transport_travellers WHERE transport_id = $1`, [req.params.id]);
      for (const tid of traveller_ids) {
        await client.query(
          `INSERT INTO transport_travellers (transport_id, traveller_id) VALUES ($1,$2)`,
          [req.params.id, tid]
        );
      }
    }

    await client.query('COMMIT');

    const tResult = await client.query(
      `SELECT traveller_id FROM transport_travellers WHERE transport_id = $1`,
      [req.params.id]
    );
    res.json({
      ...booking,
      price: booking.price ? parseFloat(booking.price) : null,
      price_home: booking.price_home ? parseFloat(booking.price_home) : null,
      traveller_ids: tResult.rows.map((r) => r.traveller_id),
    });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: (err as Error).message });
  } finally {
    client.release();
  }
});

// DELETE /transport/:id
router.delete('/transport/:id', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `DELETE FROM transport_bookings WHERE id = $1 RETURNING id`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /trips/:tripId/vehicles
router.get('/trips/:tripId/vehicles', async (req: Request, res: Response) => {
  try {
    const vehiclesResult = await pool.query(
      `SELECT * FROM vehicles WHERE trip_id = $1 ORDER BY created_at`,
      [req.params.tripId]
    );
    if (vehiclesResult.rows.length === 0) return res.json([]);

    const vehicleIds = vehiclesResult.rows.map((v) => v.id);
    const seatsResult = await pool.query(
      `SELECT * FROM vehicle_seat_assignments WHERE vehicle_id = ANY($1)`,
      [vehicleIds]
    );
    const seatsByVehicle: Record<string, typeof seatsResult.rows> = {};
    for (const seat of seatsResult.rows) {
      if (!seatsByVehicle[seat.vehicle_id]) seatsByVehicle[seat.vehicle_id] = [];
      seatsByVehicle[seat.vehicle_id].push(seat);
    }
    res.json(vehiclesResult.rows.map((v) => ({ ...v, seats: seatsByVehicle[v.id] || [] })));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /trips/:tripId/vehicles
router.post('/trips/:tripId/vehicles', async (req: Request, res: Response) => {
  try {
    const { name, seat_count, notes } = req.body;
    const result = await pool.query(
      `INSERT INTO vehicles (trip_id, name, seat_count, notes)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.params.tripId, name, seat_count || 5, notes || null]
    );
    res.status(201).json({ ...result.rows[0], seats: [] });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// PUT /vehicles/:id
router.put('/vehicles/:id', async (req: Request, res: Response) => {
  try {
    const { name, seat_count, notes } = req.body;
    const result = await pool.query(
      `UPDATE vehicles SET
         name = COALESCE($1, name),
         seat_count = COALESCE($2, seat_count),
         notes = COALESCE($3, notes)
       WHERE id = $4 RETURNING *`,
      [name ?? null, seat_count ?? null, notes ?? null, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const seatsResult = await pool.query(
      `SELECT * FROM vehicle_seat_assignments WHERE vehicle_id = $1`,
      [req.params.id]
    );
    res.json({ ...result.rows[0], seats: seatsResult.rows });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// DELETE /vehicles/:id
router.delete('/vehicles/:id', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `DELETE FROM vehicles WHERE id = $1 RETURNING id`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// PUT /vehicles/:id/seats
router.put('/vehicles/:id/seats', async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const { seats } = req.body as { seats: { traveller_id: string; seat_label?: string }[] };
    await client.query('BEGIN');
    await client.query(`DELETE FROM vehicle_seat_assignments WHERE vehicle_id = $1`, [req.params.id]);
    const results = [];
    for (const seat of seats) {
      const r = await client.query(
        `INSERT INTO vehicle_seat_assignments (vehicle_id, traveller_id, seat_label)
         VALUES ($1,$2,$3) RETURNING *`,
        [req.params.id, seat.traveller_id, seat.seat_label || null]
      );
      results.push(r.rows[0]);
    }
    await client.query('COMMIT');
    res.json(results);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: (err as Error).message });
  } finally {
    client.release();
  }
});

export default router;
