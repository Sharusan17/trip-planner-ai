export type TransportType = 'flight' | 'train' | 'bus' | 'car' | 'ferry' | 'other';

export const TRANSPORT_ICONS: Record<TransportType, string> = {
  flight: '✈️',
  train: '🚂',
  bus: '🚌',
  car: '🚗',
  ferry: '⛴️',
  other: '🚀',
};

export interface TransportBooking {
  id: string;
  trip_id: string;
  transport_type: TransportType;
  from_location: string;
  to_location: string;
  departure_time: string;
  arrival_time: string | null;
  reference_number: string | null;
  price: number | null;
  currency: string | null;
  price_home: number | null;
  notes: string | null;
  airline: string | null;
  departure_terminal: string | null;
  arrival_terminal: string | null;
  aircraft_type: string | null;
  linked_booking_id: string | null;
  traveller_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface CreateTransportInput {
  transport_type: TransportType;
  from_location: string;
  to_location: string;
  departure_time: string;
  arrival_time?: string;
  reference_number?: string;
  price?: number;
  currency?: string;
  notes?: string;
  airline?: string;
  departure_terminal?: string;
  arrival_terminal?: string;
  aircraft_type?: string;
  linked_booking_id?: string;
  /** If provided, a return leg is created and both are auto-linked */
  linked_journey?: {
    from_location: string;
    to_location: string;
    departure_time: string;
    arrival_time?: string;
    reference_number?: string;
    price?: number;
    currency?: string;
  };
  traveller_ids: string[];
}

export type UpdateTransportInput = Partial<CreateTransportInput>;

export interface VehicleSeat {
  id: string;
  vehicle_id: string;
  traveller_id: string;
  seat_label: string | null;
}

export interface Vehicle {
  id: string;
  trip_id: string;
  name: string;
  seat_count: number;
  notes: string | null;
  seats: VehicleSeat[];
  created_at: string;
}

export interface CreateVehicleInput {
  name: string;
  seat_count: number;
  notes?: string;
}

export type UpdateVehicleInput = Partial<CreateVehicleInput>;

export interface AssignSeatsInput {
  seats: { traveller_id: string; seat_label?: string }[];
}
