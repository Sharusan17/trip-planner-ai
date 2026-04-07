export type SettlementStatus = 'pending' | 'paid';

export interface Settlement {
  id: string;
  trip_id: string;
  from_traveller: string;
  to_traveller: string;
  amount: number;
  currency: string;
  status: SettlementStatus;
  paid_at: string | null;
  created_at: string;
}

export interface TravellerBalance {
  traveller_id: string;
  net_balance: number;
  currency: string;
}
