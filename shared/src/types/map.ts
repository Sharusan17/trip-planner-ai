import { ActivityType } from './itinerary';

export interface MapPin {
  id: string;
  name: string;
  category: string;
  latitude: number;
  longitude: number;
  notes: string | null;
  activity_type?: ActivityType;
  day_number?: number;
  time?: string;
}

export interface Location {
  id: string;
  trip_id: string;
  name: string;
  category: string | null;
  latitude: number;
  longitude: number;
  notes: string | null;
}

export interface CreateLocationInput {
  name: string;
  category?: string;
  latitude: number;
  longitude: number;
  notes?: string;
}
