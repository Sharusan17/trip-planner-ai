import { api } from './client';
import type {
  Deposit, DepositSummary, DepositStatus,
  CreateDepositInput, UpdateDepositInput,
} from '@trip-planner-ai/shared';

export const depositsApi = {
  list: (tripId: string, status?: DepositStatus) => {
    const qs = status ? `?status=${status}` : '';
    return api.get<Deposit[]>(`/trips/${tripId}/deposits${qs}`);
  },

  summary: (tripId: string) =>
    api.get<DepositSummary>(`/trips/${tripId}/deposits/summary`),

  create: (tripId: string, data: CreateDepositInput) =>
    api.post<Deposit>(`/trips/${tripId}/deposits`, data),

  update: (id: string, data: UpdateDepositInput) =>
    api.put<Deposit>(`/deposits/${id}`, data),

  updateStatus: (id: string, status: DepositStatus) =>
    api.patch<Deposit>(`/deposits/${id}/status`, { status }),

  delete: (id: string) =>
    api.delete<void>(`/deposits/${id}`),
};
