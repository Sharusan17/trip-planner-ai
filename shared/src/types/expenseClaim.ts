import type { ExpenseCategory, ExpenseLineItem } from './expense';

export type ExpenseClaimStatus = 'open' | 'approved' | 'cancelled';
export type ExpenseClaimAction = 'accepted' | 'partial' | 'declined';

export interface ExpenseClaim {
  id: string;
  trip_id: string;
  created_by: string;
  description: string;
  total_amount: number;
  currency: string;
  category: ExpenseCategory;
  expense_date: string;
  notes: string | null;
  line_items: ExpenseLineItem[] | null;
  receipt_filename: string | null;
  status: ExpenseClaimStatus;
  approved_expense_id: string | null;
  created_at: string;
  updated_at: string;
  // Server-joined fields
  created_by_name?: string;
  created_by_colour?: string;
  responses?: ExpenseClaimResponse[];
  response_count?: number;
  total_travellers?: number;
  /** Set when another traveller has already named this viewer as a co-splitter */
  co_split_nomination?: { nominated_by: string; each_amount: number } | null;
}

export interface ExpenseClaimResponse {
  id: string;
  claim_id: string;
  traveller_id: string;
  action: ExpenseClaimAction;
  claimed_amount: number | null;
  split_with_ids: string[];
  /** Indices into claim.line_items the traveller claimed */
  line_item_indices: number[];
  note: string | null;
  responded_at: string;
  traveller_name?: string;
  traveller_colour?: string;
}

export interface CreateClaimInput {
  description: string;
  total_amount: number;
  currency: string;
  category: ExpenseCategory;
  expense_date: string;
  notes?: string;
  line_items?: ExpenseLineItem[];
  created_by: string;
}

export interface RespondToClaimInput {
  traveller_id: string;
  action: ExpenseClaimAction;
  claimed_amount?: number;
  split_with_ids?: string[];
  line_item_indices?: number[];
  note?: string;
}
