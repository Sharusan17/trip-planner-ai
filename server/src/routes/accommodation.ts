import { Router, Request, Response } from 'express';
import pool from '../db/pool';
import { getRate } from '../services/currencyService';
import { createLogger } from '../utils/logger';

const router = Router();
const log = createLogger('accommodation');

type BookingRow = Record<string, unknown>;

async function attachTravellers(bookings: BookingRow[]): Promise<BookingRow[]> {
  if (bookings.length === 0) return bookings;
  const ids = bookings.map((b) => b.id);
  const result = await pool.query(
    `SELECT accommodation_id, traveller_id FROM accommodation_travellers WHERE accommodation_id = ANY($1)`,
    [ids]
  );
  const map: Record<string, string[]> = {};
  for (const row of result.rows) {
    if (!map[row.accommodation_id]) map[row.accommodation_id] = [];
    map[row.accommodation_id].push(row.traveller_id);
  }
  return bookings.map((b) => ({ ...b, traveller_ids: map[b.id as string] || [] }));
}

async function attachRooms(bookings: BookingRow[]): Promise<BookingRow[]> {
  if (bookings.length === 0) return bookings;
  const ids = bookings.map((b) => b.id);

  const roomsRes = await pool.query(
    `SELECT * FROM accommodation_rooms WHERE accommodation_id = ANY($1) ORDER BY created_at`,
    [ids]
  );
  const rooms = roomsRes.rows;
  if (rooms.length === 0) return bookings.map((b) => ({ ...b, rooms: [] }));

  const roomIds = rooms.map((r) => r.id);
  const travRes = await pool.query(
    `SELECT room_id, traveller_id FROM accommodation_room_travellers WHERE room_id = ANY($1)`,
    [roomIds]
  );
  const travMap: Record<string, string[]> = {};
  for (const row of travRes.rows) {
    if (!travMap[row.room_id]) travMap[row.room_id] = [];
    travMap[row.room_id].push(row.traveller_id);
  }

  const roomsByBooking: Record<string, unknown[]> = {};
  for (const r of rooms) {
    if (!roomsByBooking[r.accommodation_id]) roomsByBooking[r.accommodation_id] = [];
    roomsByBooking[r.accommodation_id].push({
      id: r.id,
      accommodation_id: r.accommodation_id,
      name: r.name,
      price: r.price ? parseFloat(r.price) : null,
      currency: r.currency,
      traveller_ids: travMap[r.id] || [],
    });
  }
  return bookings.map((b) => ({ ...b, rooms: roomsByBooking[b.id as string] || [] }));
}

function formatBooking(b: BookingRow) {
  return {
    ...b,
    price: b.price ? parseFloat(b.price as string) : null,
    price_home: b.price_home ? parseFloat(b.price_home as string) : null,
  };
}

// GET /trips/:tripId/accommodation
router.get('/trips/:tripId/accommodation', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT * FROM accommodation_bookings WHERE trip_id = $1 ORDER BY check_in_date`,
      [req.params.tripId]
    );
    let bookings = await attachTravellers(result.rows);
    bookings = await attachRooms(bookings);
    res.json(bookings.map(formatBooking));
  } catch (err) {
    log.error('list failed', { tripId: req.params.tripId, err: (err as Error).message });
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /trips/:tripId/accommodation
router.post('/trips/:tripId/accommodation', async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const { tripId } = req.params;
    const {
      name, address, check_in_date, check_out_date,
      check_in_time, check_out_time,
      reference_number, price, currency, notes, traveller_ids,
      rooms = [],
    } = req.body;

    const tripResult = await client.query(`SELECT home_currency FROM trips WHERE id = $1`, [tripId]);
    const homeCurrency: string = tripResult.rows[0]?.home_currency ?? 'GBP';
    let priceHome: number | null = null;
    if (price && currency) {
      try {
        if (currency !== homeCurrency) {
          const { rate } = await getRate(currency, homeCurrency);
          priceHome = Math.round(parseFloat(price) * rate * 100) / 100;
        } else {
          priceHome = parseFloat(price);
        }
      } catch { priceHome = null; }
    }

    await client.query('BEGIN');

    const bookingResult = await client.query(
      `INSERT INTO accommodation_bookings
         (trip_id, name, address, check_in_date, check_out_date, check_in_time, check_out_time,
          reference_number, price, currency, price_home, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [tripId, name, address || null, check_in_date, check_out_date,
       check_in_time || null, check_out_time || null,
       reference_number || null, price || null, currency || null, priceHome, notes || null]
    );
    const booking = bookingResult.rows[0];

    if (traveller_ids?.length > 0) {
      for (const tid of traveller_ids) {
        await client.query(
          `INSERT INTO accommodation_travellers (accommodation_id, traveller_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
          [booking.id, tid]
        );
      }
    }

    // Insert rooms
    const createdRooms: unknown[] = [];
    for (const room of rooms) {
      const rRes = await client.query(
        `INSERT INTO accommodation_rooms (accommodation_id, name, price, currency)
         VALUES ($1,$2,$3,$4) RETURNING *`,
        [booking.id, room.name, room.price || null, room.currency || currency || null]
      );
      const r = rRes.rows[0];
      const roomTravIds: string[] = room.traveller_ids || [];
      for (const tid of roomTravIds) {
        await client.query(
          `INSERT INTO accommodation_room_travellers (room_id, traveller_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
          [r.id, tid]
        );
      }
      createdRooms.push({
        id: r.id,
        accommodation_id: r.accommodation_id,
        name: r.name,
        price: r.price ? parseFloat(r.price) : null,
        currency: r.currency,
        traveller_ids: roomTravIds,
      });
    }

    await client.query('COMMIT');

    res.status(201).json({
      ...formatBooking({ ...booking }),
      traveller_ids: traveller_ids || [],
      rooms: createdRooms,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    log.error('create failed', { err: (err as Error).message });
    res.status(500).json({ error: (err as Error).message });
  } finally {
    client.release();
  }
});

// GET /accommodation/:id
router.get('/accommodation/:id', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`SELECT * FROM accommodation_bookings WHERE id = $1`, [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    let bookings = await attachTravellers(result.rows);
    bookings = await attachRooms(bookings);
    res.json(formatBooking(bookings[0]));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// PUT /accommodation/:id
router.put('/accommodation/:id', async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const {
      name, address, check_in_date, check_out_date,
      check_in_time, check_out_time,
      reference_number, price, currency, notes, traveller_ids,
      rooms,
    } = req.body;

    const existing = await client.query(
      `SELECT * FROM accommodation_bookings WHERE id = $1`,
      [req.params.id]
    );
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
      `UPDATE accommodation_bookings SET
         name = COALESCE($1, name),
         address = COALESCE($2, address),
         check_in_date = COALESCE($3, check_in_date),
         check_out_date = COALESCE($4, check_out_date),
         check_in_time = COALESCE($5, check_in_time),
         check_out_time = COALESCE($6, check_out_time),
         reference_number = COALESCE($7, reference_number),
         price = $8, currency = $9, price_home = $10,
         notes = COALESCE($11, notes),
         updated_at = NOW()
       WHERE id = $12 RETURNING *`,
      [name ?? null, address ?? null, check_in_date ?? null, check_out_date ?? null,
       check_in_time ?? null, check_out_time ?? null,
       reference_number ?? null, newPrice, newCurrency, priceHome,
       notes ?? null, req.params.id]
    );
    const booking = updResult.rows[0];

    if (traveller_ids !== undefined) {
      await client.query(
        `DELETE FROM accommodation_travellers WHERE accommodation_id = $1`,
        [req.params.id]
      );
      for (const tid of traveller_ids) {
        await client.query(
          `INSERT INTO accommodation_travellers (accommodation_id, traveller_id) VALUES ($1,$2)`,
          [req.params.id, tid]
        );
      }
    }

    // Replace rooms if provided
    let finalRooms: unknown[] = [];
    if (rooms !== undefined) {
      await client.query(`DELETE FROM accommodation_rooms WHERE accommodation_id = $1`, [req.params.id]);
      for (const room of rooms) {
        const rRes = await client.query(
          `INSERT INTO accommodation_rooms (accommodation_id, name, price, currency)
           VALUES ($1,$2,$3,$4) RETURNING *`,
          [req.params.id, room.name, room.price || null, room.currency || newCurrency || null]
        );
        const r = rRes.rows[0];
        const roomTravIds: string[] = room.traveller_ids || [];
        for (const tid of roomTravIds) {
          await client.query(
            `INSERT INTO accommodation_room_travellers (room_id, traveller_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
            [r.id, tid]
          );
        }
        finalRooms.push({
          id: r.id,
          accommodation_id: r.accommodation_id,
          name: r.name,
          price: r.price ? parseFloat(r.price) : null,
          currency: r.currency,
          traveller_ids: roomTravIds,
        });
      }
    } else {
      // Fetch existing rooms
      const rRes = await pool.query(`SELECT * FROM accommodation_rooms WHERE accommodation_id = $1`, [req.params.id]);
      const rIds = rRes.rows.map((r) => r.id);
      const tMap: Record<string, string[]> = {};
      if (rIds.length > 0) {
        const tRes = await pool.query(
          `SELECT room_id, traveller_id FROM accommodation_room_travellers WHERE room_id = ANY($1)`,
          [rIds]
        );
        for (const row of tRes.rows) {
          if (!tMap[row.room_id]) tMap[row.room_id] = [];
          tMap[row.room_id].push(row.traveller_id);
        }
      }
      finalRooms = rRes.rows.map((r) => ({
        id: r.id,
        accommodation_id: r.accommodation_id,
        name: r.name,
        price: r.price ? parseFloat(r.price) : null,
        currency: r.currency,
        traveller_ids: tMap[r.id] || [],
      }));
    }

    await client.query('COMMIT');

    const tResult = await client.query(
      `SELECT traveller_id FROM accommodation_travellers WHERE accommodation_id = $1`,
      [req.params.id]
    );
    res.json({
      ...formatBooking({ ...booking }),
      traveller_ids: tResult.rows.map((r) => r.traveller_id),
      rooms: finalRooms,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    log.error('update failed', { id: req.params.id, err: (err as Error).message });
    res.status(500).json({ error: (err as Error).message });
  } finally {
    client.release();
  }
});

// DELETE /accommodation/:id
router.delete('/accommodation/:id', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `DELETE FROM accommodation_bookings WHERE id = $1 RETURNING id`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
