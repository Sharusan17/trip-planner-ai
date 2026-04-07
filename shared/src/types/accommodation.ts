export interface AccommodationBooking {
  id: string;
  trip_id: string;
  name: string;
  address: string | null;
  check_in_date: string;
  check_out_date: string;
  reference_number: string | null;
  price: number | null;
  currency: string | null;
  price_home: number | null;
  notes: string | null;
  traveller_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface CreateAccommodationInput {
  name: string;
  address?: string;
  check_in_date: string;
  check_out_date: string;
  reference_number?: string;
  price?: number;
  currency?: string;
  notes?: string;
  traveller_ids: string[];
}

export type UpdateAccommodationInput = Partial<CreateAccommodationInput>;
