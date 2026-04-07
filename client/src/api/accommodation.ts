import { api } from './client';
import type {
  AccommodationBooking,
  CreateAccommodationInput, UpdateAccommodationInput,
} from '@trip-planner-ai/shared';

export const accommodationApi = {
  list: (tripId: string) =>
    api.get<AccommodationBooking[]>(`/trips/${tripId}/accommodation`),

  getById: (id: string) =>
    api.get<AccommodationBooking>(`/accommodation/${id}`),

  create: (tripId: string, data: CreateAccommodationInput) =>
    api.post<AccommodationBooking>(`/trips/${tripId}/accommodation`, data),

  update: (id: string, data: UpdateAccommodationInput) =>
    api.put<AccommodationBooking>(`/accommodation/${id}`, data),

  delete: (id: string) =>
    api.delete<void>(`/accommodation/${id}`),
};
