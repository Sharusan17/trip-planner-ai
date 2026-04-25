export type ActivityType =
  | 'flight'
  | 'transport'
  | 'hotel'
  | 'food'
  | 'sightseeing'
  | 'beach'
  | 'shopping'
  | 'entertainment'
  | 'custom';

export const ACTIVITY_ICONS: Record<ActivityType, string> = {
  flight: '✈️',
  transport: '🚗',
  hotel: '🏨',
  food: '🍽️',
  sightseeing: '🏛️',
  beach: '🏖️',
  shopping: '🛍️',
  entertainment: '🎯',
  custom: '📌',
};

export interface ItineraryDay {
  id: string;
  trip_id: string;
  date: string;
  day_number: number;
  title: string | null;
  notes: string | null;
  activities: Activity[];
}

export interface Activity {
  id: string;
  day_id: string;
  time: string | null;
  type: ActivityType;
  description: string;
  notes: string | null;
  location_tag: string | null;
  latitude: number | null;
  longitude: number | null;
  kid_friendly: boolean;
  sort_order: number;
  created_at: string;
}

export interface CreateDayInput {
  date: string;
  day_number: number;
  title?: string;
  notes?: string;
}

export interface CreateActivityInput {
  time?: string;
  type: ActivityType;
  description: string;
  notes?: string;
  location_tag?: string;
  latitude?: number;
  longitude?: number;
  kid_friendly?: boolean;
}

export interface UpdateDayInput extends Partial<CreateDayInput> {}
export interface UpdateActivityInput extends Partial<CreateActivityInput> {}
