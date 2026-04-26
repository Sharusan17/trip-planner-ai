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

  // 006: expense enums + expenses + expense_splits
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'expense_category') THEN
      CREATE TYPE expense_category AS ENUM (
        'accommodation', 'food', 'transport', 'activities', 'shopping', 'other'
      );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'split_mode') THEN
      CREATE TYPE split_mode AS ENUM ('equal', 'weighted', 'custom');
    END IF;
  END $$;`,

  `CREATE TABLE IF NOT EXISTS expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    paid_by UUID NOT NULL REFERENCES travellers(id) ON DELETE RESTRICT,
    amount DECIMAL(12,2) NOT NULL,
    currency CHAR(3) NOT NULL,
    amount_home DECIMAL(12,2),
    description TEXT NOT NULL,
    category expense_category NOT NULL DEFAULT 'other',
    split_mode split_mode NOT NULL DEFAULT 'equal',
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,

  `CREATE INDEX IF NOT EXISTS idx_expenses_trip ON expenses(trip_id);`,
  `CREATE INDEX IF NOT EXISTS idx_expenses_paid_by ON expenses(paid_by);`,

  `CREATE TABLE IF NOT EXISTS expense_splits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    traveller_id UUID NOT NULL REFERENCES travellers(id) ON DELETE CASCADE,
    amount DECIMAL(12,2) NOT NULL,
    amount_home DECIMAL(12,2),
    UNIQUE(expense_id, traveller_id)
  );`,

  `CREATE INDEX IF NOT EXISTS idx_splits_expense ON expense_splits(expense_id);`,
  `CREATE INDEX IF NOT EXISTS idx_splits_traveller ON expense_splits(traveller_id);`,

  // 007: expense budgets
  `CREATE TABLE IF NOT EXISTS expense_budgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    category expense_category NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    currency CHAR(3) NOT NULL,
    UNIQUE(trip_id, category)
  );`,

  `CREATE INDEX IF NOT EXISTS idx_budgets_trip ON expense_budgets(trip_id);`,

  // 008: settlements
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'settlement_status') THEN
      CREATE TYPE settlement_status AS ENUM ('pending', 'paid');
    END IF;
  END $$;`,

  `CREATE TABLE IF NOT EXISTS settlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    from_traveller UUID NOT NULL REFERENCES travellers(id) ON DELETE CASCADE,
    to_traveller UUID NOT NULL REFERENCES travellers(id) ON DELETE CASCADE,
    amount DECIMAL(12,2) NOT NULL,
    currency CHAR(3) NOT NULL,
    status settlement_status NOT NULL DEFAULT 'pending',
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,

  `CREATE INDEX IF NOT EXISTS idx_settlements_trip ON settlements(trip_id);`,

  // 009: transport enums + bookings + travellers + vehicles + seats
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transport_type') THEN
      CREATE TYPE transport_type AS ENUM ('flight', 'train', 'bus', 'car', 'ferry', 'other');
    END IF;
  END $$;`,

  `CREATE TABLE IF NOT EXISTS transport_bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    transport_type transport_type NOT NULL,
    from_location VARCHAR(200) NOT NULL,
    to_location VARCHAR(200) NOT NULL,
    departure_time TIMESTAMPTZ NOT NULL,
    arrival_time TIMESTAMPTZ,
    reference_number VARCHAR(100),
    price DECIMAL(12,2),
    currency CHAR(3),
    price_home DECIMAL(12,2),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,

  `CREATE INDEX IF NOT EXISTS idx_transport_trip ON transport_bookings(trip_id);`,

  `CREATE TABLE IF NOT EXISTS transport_travellers (
    transport_id UUID NOT NULL REFERENCES transport_bookings(id) ON DELETE CASCADE,
    traveller_id UUID NOT NULL REFERENCES travellers(id) ON DELETE CASCADE,
    PRIMARY KEY (transport_id, traveller_id)
  );`,

  `CREATE TABLE IF NOT EXISTS vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    seat_count INTEGER NOT NULL DEFAULT 5,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,

  `CREATE INDEX IF NOT EXISTS idx_vehicles_trip ON vehicles(trip_id);`,

  `CREATE TABLE IF NOT EXISTS vehicle_seat_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    traveller_id UUID NOT NULL REFERENCES travellers(id) ON DELETE CASCADE,
    seat_label VARCHAR(20),
    UNIQUE(vehicle_id, traveller_id)
  );`,

  `CREATE INDEX IF NOT EXISTS idx_seats_vehicle ON vehicle_seat_assignments(vehicle_id);`,

  // 010: accommodation
  `CREATE TABLE IF NOT EXISTS accommodation_bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    address TEXT,
    check_in_date DATE NOT NULL,
    check_out_date DATE NOT NULL,
    reference_number VARCHAR(100),
    price DECIMAL(12,2),
    currency CHAR(3),
    price_home DECIMAL(12,2),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,

  `CREATE INDEX IF NOT EXISTS idx_accommodation_trip ON accommodation_bookings(trip_id);`,

  `CREATE TABLE IF NOT EXISTS accommodation_travellers (
    accommodation_id UUID NOT NULL REFERENCES accommodation_bookings(id) ON DELETE CASCADE,
    traveller_id UUID NOT NULL REFERENCES travellers(id) ON DELETE CASCADE,
    PRIMARY KEY (accommodation_id, traveller_id)
  );`,

  // 011: deposits
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'deposit_status') THEN
      CREATE TYPE deposit_status AS ENUM ('pending', 'paid', 'overdue');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'deposit_linked_type') THEN
      CREATE TYPE deposit_linked_type AS ENUM ('accommodation', 'transport', 'activity', 'other');
    END IF;
  END $$;`,

  `CREATE TABLE IF NOT EXISTS deposits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    description VARCHAR(200) NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    currency CHAR(3) NOT NULL,
    amount_home DECIMAL(12,2),
    due_date DATE,
    status deposit_status NOT NULL DEFAULT 'pending',
    paid_at TIMESTAMPTZ,
    linked_type deposit_linked_type,
    linked_id UUID,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,

  `CREATE INDEX IF NOT EXISTS idx_deposits_trip ON deposits(trip_id);`,
  `CREATE INDEX IF NOT EXISTS idx_deposits_status ON deposits(trip_id, status);`,

  // 012: announcements
  `CREATE TABLE IF NOT EXISTS announcements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES travellers(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    content TEXT NOT NULL,
    pinned BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,

  `CREATE INDEX IF NOT EXISTS idx_announcements_trip ON announcements(trip_id, created_at DESC);`,

  // 013: polls
  `CREATE TABLE IF NOT EXISTS polls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES travellers(id) ON DELETE CASCADE,
    question VARCHAR(300) NOT NULL,
    closes_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,

  `CREATE TABLE IF NOT EXISTS poll_options (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    poll_id UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
    text VARCHAR(200) NOT NULL,
    sort_order INT NOT NULL DEFAULT 0
  );`,

  `CREATE TABLE IF NOT EXISTS poll_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    poll_id UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
    option_id UUID NOT NULL REFERENCES poll_options(id) ON DELETE CASCADE,
    traveller_id UUID NOT NULL REFERENCES travellers(id) ON DELETE CASCADE,
    UNIQUE (poll_id, traveller_id)
  );`,

  `CREATE INDEX IF NOT EXISTS idx_polls_trip ON polls(trip_id, created_at DESC);`,
  `CREATE INDEX IF NOT EXISTS idx_poll_votes_poll ON poll_votes(poll_id);`,

  // 015: expense line items + receipt, trip photos
  `ALTER TABLE expenses ADD COLUMN IF NOT EXISTS line_items JSONB DEFAULT '[]';`,
  `ALTER TABLE expenses ADD COLUMN IF NOT EXISTS receipt_filename VARCHAR(255);`,

  `CREATE TABLE IF NOT EXISTS trip_photos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    uploader_id UUID NOT NULL REFERENCES travellers(id) ON DELETE CASCADE,
    day_id UUID REFERENCES itinerary_days(id) ON DELETE SET NULL,
    filename VARCHAR(255) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    caption VARCHAR(300),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,

  `CREATE INDEX IF NOT EXISTS idx_trip_photos_trip ON trip_photos(trip_id, created_at DESC);`,

  // 016: store image/receipt data as BYTEA in DB (replaces disk storage)
  `ALTER TABLE trip_photos ADD COLUMN IF NOT EXISTS data BYTEA;`,
  `ALTER TABLE trip_photos ADD COLUMN IF NOT EXISTS mime_type VARCHAR(100);`,
  `ALTER TABLE expenses ADD COLUMN IF NOT EXISTS receipt_data BYTEA;`,
  `ALTER TABLE expenses ADD COLUMN IF NOT EXISTS receipt_mime VARCHAR(100);`,

  // 017: flight lookup cache + transport booking flight detail columns
  `CREATE TABLE IF NOT EXISTS flight_lookup_cache (
    flight_iata TEXT NOT NULL,
    flight_date DATE NOT NULL,
    data JSONB,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (flight_iata, flight_date)
  );`,

  `CREATE INDEX IF NOT EXISTS idx_flight_cache_fetched ON flight_lookup_cache(fetched_at);`,

  `ALTER TABLE transport_bookings ADD COLUMN IF NOT EXISTS airline TEXT;`,
  `ALTER TABLE transport_bookings ADD COLUMN IF NOT EXISTS departure_terminal TEXT;`,
  `ALTER TABLE transport_bookings ADD COLUMN IF NOT EXISTS arrival_terminal TEXT;`,
  `ALTER TABLE transport_bookings ADD COLUMN IF NOT EXISTS aircraft_type TEXT;`,
  // linked_booking_id: outbound ↔ return journey pairing
  `ALTER TABLE transport_bookings ADD COLUMN IF NOT EXISTS linked_booking_id UUID REFERENCES transport_bookings(id) ON DELETE SET NULL;`,

  // 018: accommodation check-in / check-out times + room assignments
  `ALTER TABLE accommodation_bookings ADD COLUMN IF NOT EXISTS check_in_time TIME;`,
  `ALTER TABLE accommodation_bookings ADD COLUMN IF NOT EXISTS check_out_time TIME;`,

  `CREATE TABLE IF NOT EXISTS accommodation_rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    accommodation_id UUID NOT NULL REFERENCES accommodation_bookings(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    price DECIMAL(12,2),
    currency CHAR(3),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,

  `CREATE TABLE IF NOT EXISTS accommodation_room_travellers (
    room_id UUID NOT NULL REFERENCES accommodation_rooms(id) ON DELETE CASCADE,
    traveller_id UUID NOT NULL REFERENCES travellers(id) ON DELETE CASCADE,
    PRIMARY KEY (room_id, traveller_id)
  );`,

  // 019: notes on activities
  `ALTER TABLE activities ADD COLUMN IF NOT EXISTS notes TEXT;`,

  // 020: traveller profile — notes + avatar photo
  `ALTER TABLE travellers ADD COLUMN IF NOT EXISTS notes TEXT;`,
  `ALTER TABLE travellers ADD COLUMN IF NOT EXISTS avatar_photo BYTEA;`,
  `ALTER TABLE travellers ADD COLUMN IF NOT EXISTS avatar_photo_mime VARCHAR(100);`,
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
