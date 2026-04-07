import { api } from './client';
import type { Settlement } from '@trip-planner-ai/shared';

export const settlementsApi = {
  list: (tripId: string) =>
    api.get<Settlement[]>(`/trips/${tripId}/settlements`),

  calculate: (tripId: string) =>
    api.post<Settlement[]>(`/trips/${tripId}/settlements/calculate`, {}),

  markPaid: (id: string) =>
    api.patch<Settlement>(`/settlements/${id}/pay`, {}),

  delete: (id: string) =>
    api.delete<void>(`/settlements/${id}`),
};
