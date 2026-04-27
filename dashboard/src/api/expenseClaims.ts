import { api, API_BASE } from './client';
import type {
  ExpenseClaim, ExpenseClaimResponse, CreateClaimInput, RespondToClaimInput,
} from '@trip-planner-ai/shared';

export const expenseClaimsApi = {
  list: (tripId: string): Promise<ExpenseClaim[]> =>
    api.get(`/trips/${tripId}/claims`),

  listPending: (tripId: string, travellerId: string): Promise<ExpenseClaim[]> =>
    api.get(`/trips/${tripId}/claims/pending/${travellerId}`),

  getById: (id: string): Promise<ExpenseClaim> =>
    api.get(`/claims/${id}`),

  create: (tripId: string, data: CreateClaimInput, receiptFile?: File): Promise<ExpenseClaim> => {
    const fd = new FormData();
    fd.append('created_by', data.created_by);
    fd.append('description', data.description);
    fd.append('total_amount', String(data.total_amount));
    fd.append('currency', data.currency);
    fd.append('category', data.category);
    fd.append('expense_date', data.expense_date);
    if (data.notes)      fd.append('notes', data.notes);
    if (data.line_items) fd.append('line_items', JSON.stringify(data.line_items));
    if (receiptFile)     fd.append('receipt', receiptFile);
    return api.postFile<ExpenseClaim>(`/trips/${tripId}/claims`, fd);
  },

  respond: (claimId: string, data: RespondToClaimInput): Promise<ExpenseClaimResponse> =>
    api.post(`/claims/${claimId}/respond`, data),

  approve: (claimId: string): Promise<{ expense: any; claim_id: string }> =>
    api.post(`/claims/${claimId}/approve`, {}),

  cancel: (claimId: string): Promise<{ cancelled: boolean }> =>
    api.patch(`/claims/${claimId}/cancel`, {}),

  getReceiptUrl: (claimId: string) => `${API_BASE}/claims/${claimId}/receipt`,
};
