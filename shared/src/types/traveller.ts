export type TravellerType = 'adult' | 'child' | 'infant';
export type TravellerRole = 'organiser' | 'member';

export interface Traveller {
  id: string;
  trip_id: string;
  name: string;
  type: TravellerType;
  role: TravellerRole;
  avatar_colour: string;
  cost_split_weight: number;
  notes?: string | null;
  medical_notes?: string;
  has_medical_pin: boolean;
  has_photo: boolean;
  sort_order: number;
  created_at: string;
}

export interface CreateTravellerInput {
  name: string;
  type: TravellerType;
  role?: TravellerRole;
  avatar_colour?: string;
  cost_split_weight?: number;
  notes?: string;
  medical_notes?: string;
  medical_pin?: string;
}

export interface UpdateTravellerInput extends Partial<CreateTravellerInput> {}
