import pool from './pool';

const migrations = [
  // 001: trips
  `CREATE TABLE IF NOT EXISTS trips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    group_code VARCHAR(20) UNIQUE NOT NULL,
    destination VARCHAR(200) NOT NULL,
    latitude DECIMAL(9,6) NOT NULL,
    longitude DECIMAL(9,6) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    home_currency CHAR(3) NOT NULL DEFAULT 'GBP',
    dest_currency CHAR(3) NOT NULL DEFAULT 'EUR',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,

  // 002: traveller enums + table
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'traveller_type') THEN
      CREATE TYPE traveller_type AS ENUM ('adult', 'child', 'infant');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'traveller_role') THEN
      CREATE TYPE traveller_role AS ENUM ('organiser', 'member');
    END IF;
  END $$;`,

  `CREATE TABLE IF NOT EXISTS travellers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    type traveller_type NOT NULL DEFAULT 'adult',
    role traveller_role NOT NULL DEFAULT 'member',
    avatar_colour VARCHAR(7) NOT NULL DEFAULT '#1B3A5C',
    cost_split_weight DECIMAL(4,2) NOT NULL DEFAULT 1.00,
    medical_notes TEXT,
    medical_pin VARCHAR(60),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,

  `CREATE INDEX IF NOT EXISTS idx_travellers_trip ON travellers(trip_id);`,

  // 003: itinerary
  `CREATE TABLE IF NOT EXISTS itinerary_days (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    day_number INTEGER NOT NULL,
    title VARCHAR(200),
    notes TEXT,
    UNIQUE(trip_id, day_number)
  );`,

  `CREATE INDEX IF NOT EXISTS idx_days_trip ON itinerary_days(trip_id);`,

  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'activity_type') THEN
      CREATE TYPE activity_type AS ENUM (
        'flight','transport','hotel','food','sightseeing',
        'beach','shopping','entertainment','custom'
      );
    END IF;
  END $$;`,

  `CREATE TABLE IF NOT EXISTS activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    day_id UUID NOT NULL REFERENCES itinerary_days(id) ON DELETE CASCADE,
    time TIME,
    type activity_type NOT NULL DEFAULT 'custom',
    description TEXT NOT NULL,
    location_tag VARCHAR(200),
    latitude DECIMAL(9,6),
    longitude DECIMAL(9,6),
    kid_friendly BOOLEAN NOT NULL DEFAULT true,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,

  `CREATE INDEX IF NOT EXISTS idx_activities_day ON activities(day_id);`,

  // 004: locations
  `CREATE TABLE IF NOT EXISTS locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    category VARCHAR(50),
    latitude DECIMAL(9,6) NOT NULL,
    longitude DECIMAL(9,6) NOT NULL,
    notes TEXT
  );`,

  `CREATE INDEX IF NOT EXISTS idx_locations_trip ON locations(trip_id);`,

  // 005: currency cache
  `CREATE TABLE IF NOT EXISTS currency_cache (
    base_currency CHAR(3) NOT NULL,
    target_currency CHAR(3) NOT NULL,
    rate DECIMAL(12,6) NOT NULL,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (base_currency, target_currency)
  );`,
];

export async function runMigrations() {
  const client = await pool.connect();
  try {
    for (const sql of migrations) {
      await client.query(sql);
    }
    console.log('Migrations completed successfully');
  } catch (err) {
    console.error('Migration failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  runMigrations().then(() => process.exit(0)).catch(() => process.exit(1));
}
