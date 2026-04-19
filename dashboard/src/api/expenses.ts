import { api } from './client';
import type {
  Expense, ExpenseBudget, ExpenseSummary,
  CreateExpenseInput, UpdateExpenseInput, UpsertBudgetsInput,
} from '@trip-planner-ai/shared';

export interface ReceiptScanLineItem {
  description: string;
  qty: number;
  amount: number;
  amountBeforeVat: number;
  vatShare: number;
}

export interface ReceiptScanResult {
  merchant: string;
  date: string;       // YYYY-MM-DD or DD/MM/YYYY depending on receipt
  total: number;
  currency: string;
  tax: number;
  hasVat: boolean;
  lineItems: ReceiptScanLineItem[];
}

export const expensesApi = {
  list: (tripId: string) =>
    api.get<Expense[]>(`/trips/${tripId}/expenses`),

  summary: (tripId: string) =>
    api.get<ExpenseSummary[]>(`/trips/${tripId}/expenses/summary`),

  getById: (id: string) =>
    api.get<Expense>(`/expenses/${id}`),

  create: (tripId: string, data: CreateExpenseInput) =>
    api.post<Expense>(`/trips/${tripId}/expenses`, data),

  update: (id: string, data: UpdateExpenseInput) =>
    api.put<Expense>(`/expenses/${id}`, data),

  delete: (id: string) =>
    api.delete<void>(`/expenses/${id}`),

  getBudgets: (tripId: string) =>
    api.get<ExpenseBudget[]>(`/trips/${tripId}/budgets`),

  upsertBudgets: (tripId: string, data: UpsertBudgetsInput) =>
    api.put<ExpenseBudget[]>(`/trips/${tripId}/budgets`, data),

  uploadReceipt: (id: string, file: File): Promise<{ receipt_filename: string }> => {
    const fd = new FormData();
    fd.append('receipt', file);
    return api.postFile(`/expenses/${id}/receipt`, fd);
  },

  deleteReceipt: (id: string): Promise<void> =>
    api.delete<void>(`/expenses/${id}/receipt`),

  scanReceipt: (file: File): Promise<ReceiptScanResult> => {
    const fd = new FormData();
    fd.append('receipt', file);
    return api.postFile<ReceiptScanResult>('/receipts/scan', fd);
  },
};
