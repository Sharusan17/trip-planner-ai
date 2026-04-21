import { api } from './client';

export interface FlightInstance {
  flight_iata: string;
  flight_date: string;
  airline: string;
  departure_iata: string;
  departure_airport: string;
  departure_terminal: string | null;
  departure_time_local: string; // "HH:MM"
  arrival_iata: string;
  arrival_airport: string;
  arrival_terminal: string | null;
  arrival_time_local: string;
  aircraft_type: string | null;
}

export interface FlightLiveStatus {
  flight_status: string;
  departure_gate: string | null;
  departure_delay_minutes: number | null;
  arrival_gate: string | null;
}

export const flightsApi = {
  lookup: (iata: string, date?: string) => {
    const params = new URLSearchParams({ iata });
    if (date) params.set('date', date);
    return api.get<FlightInstance[]>(`/flights/lookup?${params.toString()}`);
  },
  status: (iata: string, date: string) =>
    api.get<FlightLiveStatus>(`/flights/status?iata=${encodeURIComponent(iata)}&date=${encodeURIComponent(date)}`),
};
