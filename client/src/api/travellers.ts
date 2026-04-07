import type { Traveller, CreateTravellerInput, UpdateTravellerInput } from '@trip-planner-ai/shared';
import { api } from './client';

export const travellersApi = {
  list: (tripId: string) => api.get<Traveller[]>(`/trips/${tripId}/travellers`),
  create: (tripId: string, data: CreateTravellerInput) =>
    api.post<Traveller>(`/trips/${tripId}/travellers`, data),
  update: (id: string, data: UpdateTravellerInput) =>
    api.put<Traveller>(`/travellers/${id}`, data),
  delete: (id: string) => api.delete(`/travellers/${id}`),
  verifyPin: (id: string, pin: string) =>
    api.post<{ medical_notes: string }>(`/travellers/${id}/verify-pin`, { pin }),
};
