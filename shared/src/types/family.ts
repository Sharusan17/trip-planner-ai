export interface FamilyMember {
  id: string;
  name: string;
  avatar_colour: string;
  has_photo: boolean;
  cost_split_weight: number;
  type: string;
}

export interface Family {
  id: string;
  trip_id: string;
  name: string;
  lead_traveller_id: string;
  colour: string;
  created_at: string;
  members: FamilyMember[];
}

export interface CreateFamilyInput {
  name: string;
  lead_traveller_id: string;
  colour?: string;
  member_ids: string[];
}
