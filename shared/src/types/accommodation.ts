export interface AccommodationRoom {
  id: string;
  accommodation_id: string;
  name: string;
  price: number | null;
  currency: string | null;
  traveller_ids: string[];
}

export interface AccommodationBooking {
  id: string;
  trip_id: string;
  name: string;
  address: string | null;
  check_in_date: string;
  check_out_date: string;
  check_in_time: string | null;   // HH:MM
  check_out_time: string | null;  // HH:MM
  reference_number: string | null;
  price: number | null;
  currency: string | null;
  price_home: number | null;
  notes: string | null;
  traveller_ids: string[];
  rooms: AccommodationRoom[];
  created_at: string;
  updated_at: string;
}

export interface CreateRoomInput {
  name: string;
  price?: number;
  currency?: string;
  traveller_ids: string[];
}

export interface CreateAccommodationInput {
  name: string;
  address?: string;
  check_in_date: string;
  check_out_date: string;
  check_in_time?: string;
  check_out_time?: string;
  reference_number?: string;
  price?: number;
  currency?: string;
  notes?: string;
  traveller_ids: string[];
  rooms?: CreateRoomInput[];
}

export type UpdateAccommodationInput = Partial<CreateAccommodationInput>;
