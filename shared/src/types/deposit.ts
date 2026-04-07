export type DepositStatus = 'pending' | 'paid' | 'overdue';
export type DepositLinkedType = 'accommodation' | 'transport' | 'activity' | 'other';

export interface Deposit {
  id: string;
  trip_id: string;
  description: string;
  amount: number;
  currency: string;
  amount_home: number | null;
  due_date: string | null;
  status: DepositStatus;
  paid_at: string | null;
  linked_type: DepositLinkedType | null;
  linked_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateDepositInput {
  description: string;
  amount: number;
  currency: string;
  due_date?: string;
  linked_type?: DepositLinkedType;
  linked_id?: string;
  notes?: string;
}

export interface UpdateDepositInput extends Partial<CreateDepositInput> {
  status?: DepositStatus;
}

export interface DepositSummary {
  total_pending_home: number;
  total_paid_home: number;
  total_overdue_home: number;
  count_pending: number;
  count_overdue: number;
}
