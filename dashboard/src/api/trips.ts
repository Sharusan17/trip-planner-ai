import type { Trip, CreateTripInput, UpdateTripInput } from '@trip-planner-ai/shared';
import { api } from './client';

export const tripsApi = {
  list: () => api.get<Trip[]>('/trips'),
  getByCode: (code: string) => api.get<Trip>(`/trips?code=${code}`),
  getById: (id: string) => api.get<Trip>(`/trips/${id}`),
  create: (data: CreateTripInput) => api.post<Trip>('/trips', data),
  update: (id: string, data: UpdateTripInput) => api.put<Trip>(`/trips/${id}`, data),
  delete: (id: string) => api.delete(`/trips/${id}`),
};
