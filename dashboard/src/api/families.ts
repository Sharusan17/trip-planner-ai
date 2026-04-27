import { api } from './client';
import type { Family, CreateFamilyInput } from '@trip-planner-ai/shared';

export const familiesApi = {
  list: (tripId: string): Promise<Family[]> =>
    api.get(`/trips/${tripId}/families`),

  create: (tripId: string, data: CreateFamilyInput): Promise<Family> =>
    api.post(`/trips/${tripId}/families`, data),

  update: (id: string, data: Partial<CreateFamilyInput>): Promise<Family> =>
    api.put(`/families/${id}`, data),

  delete: (id: string): Promise<void> =>
    api.delete(`/families/${id}`),
};
