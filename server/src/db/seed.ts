import pool from './pool';
import { runMigrations } from './migrate';

async function seed() {
  await runMigrations();

  const client = await pool.connect();
  try {
    // Check if seed data exists
    const existing = await client.query("SELECT id FROM trips WHERE group_code = 'FARO-DEMO'");
    if (existing.rows.length > 0) {
      console.log('Seed data already exists');
      return;
    }

    await client.query('BEGIN');

    // Create sample trip
    const tripResult = await client.query(
      `INSERT INTO trips (name, group_code, destination, latitude, longitude, start_date, end_date)
       VALUES ('Portugal Family Holiday', 'FARO-DEMO', 'Faro, Algarve', 37.0194, -7.9304, '2026-07-15', '2026-07-22')
       RETURNING id`
    );
    const tripId = tripResult.rows[0].id;

    // Add travellers
    const travellers = [
      { name: 'Alex', type: 'adult', role: 'organiser', colour: '#1B3A5C' },
      { name: 'Sam', type: 'adult', role: 'member', colour: '#C65D3E' },
      { name: 'Jordan', type: 'adult', role: 'member', colour: '#B8963E' },
      { name: 'Taylor', type: 'adult', role: 'member', colour: '#2A5580' },
      { name: 'Morgan', type: 'adult', role: 'member', colour: '#D4806A' },
      { name: 'Casey', type: 'adult', role: 'member', colour: '#9A7B2F' },
      { name: 'Riley', type: 'child', role: 'member', colour: '#5C4D3C' },
      { name: 'Jamie', type: 'child', role: 'member', colour: '#6B8E7B' },
      { name: 'Quinn', type: 'infant', role: 'member', colour: '#8B6FAE' },
      { name: 'Avery', type: 'infant', role: 'member', colour: '#D4A574' },
    ];

    for (const t of travellers) {
      const weight = t.type === 'infant' ? 0 : t.type === 'child' ? 0.5 : 1.0;
      await client.query(
        `INSERT INTO travellers (trip_id, name, type, role, avatar_colour, cost_split_weight)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [tripId, t.name, t.type, t.role, t.colour, weight]
      );
    }

    // Add itinerary days and activities
    const days = [
      {
        date: '2026-07-15', day_number: 1, title: 'Arrival & Faro Old Town',
        activities: [
          { time: '10:00', type: 'flight', description: 'Flight to Faro', location_tag: 'Faro Airport', lat: 37.0144, lng: -7.9659 },
          { time: '13:00', type: 'transport', description: 'Pick up rental cars', location_tag: 'Faro Airport', lat: 37.0144, lng: -7.9659 },
          { time: '14:30', type: 'hotel', description: 'Check in to villa', location_tag: 'Holiday Villa', lat: 37.0280, lng: -7.9400 },
          { time: '16:00', type: 'sightseeing', description: 'Explore Faro Old Town & Cathedral', location_tag: 'Faro Old Town', lat: 37.0146, lng: -7.9352, kid_friendly: true },
          { time: '19:30', type: 'food', description: 'Welcome dinner at Restaurante Faz Gostos', location_tag: 'Faro Old Town', lat: 37.0140, lng: -7.9340 },
        ],
      },
      {
        date: '2026-07-16', day_number: 2, title: 'Beach Day — Praia de Faro',
        activities: [
          { time: '09:30', type: 'beach', description: 'Morning at Praia de Faro', location_tag: 'Praia de Faro', lat: 36.9816, lng: -7.8897, kid_friendly: true },
          { time: '12:30', type: 'food', description: 'Lunch at beach restaurant', location_tag: 'Praia de Faro', lat: 36.9820, lng: -7.8890 },
          { time: '15:00', type: 'entertainment', description: 'Ria Formosa boat tour', location_tag: 'Faro Marina', lat: 37.0130, lng: -7.9310, kid_friendly: true },
          { time: '19:00', type: 'food', description: 'Seafood dinner at O Castelo', location_tag: 'Faro', lat: 37.0150, lng: -7.9360 },
        ],
      },
      {
        date: '2026-07-17', day_number: 3, title: 'Day Trip to Lagos',
        activities: [
          { time: '09:00', type: 'transport', description: 'Drive to Lagos (1hr)', location_tag: 'Lagos', lat: 37.1028, lng: -8.6731 },
          { time: '10:30', type: 'sightseeing', description: 'Ponta da Piedade cliffs', location_tag: 'Ponta da Piedade', lat: 37.0830, lng: -8.6700, kid_friendly: true },
          { time: '12:00', type: 'beach', description: 'Praia do Camilo', location_tag: 'Praia do Camilo', lat: 37.0842, lng: -8.6683, kid_friendly: true },
          { time: '14:00', type: 'food', description: 'Lunch in Lagos Old Town', location_tag: 'Lagos', lat: 37.1015, lng: -8.6735 },
          { time: '16:00', type: 'shopping', description: 'Browse Lagos market & shops', location_tag: 'Lagos Old Town', lat: 37.1020, lng: -8.6740 },
        ],
      },
    ];

    for (const day of days) {
      const dayResult = await client.query(
        `INSERT INTO itinerary_days (trip_id, date, day_number, title) VALUES ($1, $2, $3, $4) RETURNING id`,
        [tripId, day.date, day.day_number, day.title]
      );
      const dayId = dayResult.rows[0].id;

      for (let i = 0; i < day.activities.length; i++) {
        const a = day.activities[i];
        await client.query(
          `INSERT INTO activities (day_id, time, type, description, location_tag, latitude, longitude, kid_friendly, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [dayId, a.time, a.type, a.description, a.location_tag, a.lat, a.lng, a.kid_friendly ?? true, i]
        );
      }
    }

    await client.query('COMMIT');
    console.log('Seed data inserted successfully');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  seed().then(() => process.exit(0)).catch(() => process.exit(1));
}
