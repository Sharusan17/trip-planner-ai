import { api } from './client';
import type { Settlement, Transfer, CreateTransferInput } from '@trip-planner-ai/shared';

export const settlementsApi = {
  list: (tripId: string) =>
    api.get<Settlement[]>(`/trips/${tripId}/settlements`),

  calculate: (tripId: string) =>
    api.post<Settlement[]>(`/trips/${tripId}/settlements/calculate`, {}),

  markPaid: (id: string) =>
    api.patch<Settlement>(`/settlements/${id}/pay`, {}),

  markUnpaid: (id: string) =>
    api.patch<Settlement>(`/settlements/${id}/unpay`, {}),

  delete: (id: string) =>
    api.delete<void>(`/settlements/${id}`),

  // Transfers
  listTransfers: (tripId: string) =>
    api.get<(Transfer & { from_name: string; from_colour: string; to_name: string; to_colour: string })[]>(
      `/trips/${tripId}/transfers`
    ),

  createTransfer: (tripId: string, data: CreateTransferInput) =>
    api.post<Transfer>(`/trips/${tripId}/transfers`, data),

  updateTransfer: (id: string, data: Partial<CreateTransferInput>) =>
    api.patch<Transfer>(`/transfers/${id}`, data),

  deleteTransfer: (id: string) =>
    api.delete<void>(`/transfers/${id}`),
};
