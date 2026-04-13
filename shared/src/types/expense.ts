export type ExpenseCategory =
  | 'accommodation'
  | 'food'
  | 'transport'
  | 'activities'
  | 'shopping'
  | 'other';

export type SplitMode = 'equal' | 'weighted' | 'custom' | 'itemised';

export interface ExpenseLineItem {
  description: string;
  amount: number;
  traveller_ids: string[];
}

export const EXPENSE_CATEGORY_ICONS: Record<ExpenseCategory, string> = {
  accommodation: '🏨',
  food: '🍽️',
  transport: '🚗',
  activities: '🎯',
  shopping: '🛍️',
  other: '📌',
};

export interface ExpenseSplit {
  id: string;
  expense_id: string;
  traveller_id: string;
  amount: number;
  amount_home: number | null;
}

export interface Expense {
  id: string;
  trip_id: string;
  paid_by: string;
  amount: number;
  currency: string;
  amount_home: number | null;
  description: string;
  category: ExpenseCategory;
  split_mode: SplitMode;
  expense_date: string;
  notes: string | null;
  line_items: ExpenseLineItem[] | null;
  receipt_filename: string | null;
  splits: ExpenseSplit[];
  created_at: string;
  updated_at: string;
}

export interface CreateExpenseInput {
  paid_by: string;
  amount: number;
  currency: string;
  description: string;
  category: ExpenseCategory;
  split_mode: SplitMode;
  expense_date: string;
  traveller_ids: string[];
  custom_splits?: Record<string, number>;
  notes?: string;
  line_items?: ExpenseLineItem[];
}

export type UpdateExpenseInput = Partial<CreateExpenseInput>;

export interface ExpenseBudget {
  id: string;
  trip_id: string;
  category: ExpenseCategory;
  amount: number;
  currency: string;
}

export interface UpsertBudgetsInput {
  budgets: { category: ExpenseCategory; amount: number; currency: string }[];
}

export interface ExpenseSummary {
  category: ExpenseCategory;
  total_home: number;
  budget_amount: number | null;
  budget_currency: string | null;
  count: number;
}
