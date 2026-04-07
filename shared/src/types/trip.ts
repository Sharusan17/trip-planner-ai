export interface Trip {
  id: string;
  name: string;
  group_code: string;
  destination: string;
  latitude: number;
  longitude: number;
  start_date: string;
  end_date: string;
  home_currency: string;
  dest_currency: string;
  created_at: string;
}

export interface CreateTripInput {
  name: string;
  destination: string;
  latitude: number;
  longitude: number;
  start_date: string;
  end_date: string;
  home_currency?: string;
  dest_currency?: string;
}

export interface UpdateTripInput extends Partial<CreateTripInput> {}
