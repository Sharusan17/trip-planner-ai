import type {
  ItineraryDay, Activity,
  CreateDayInput, UpdateDayInput,
  CreateActivityInput, UpdateActivityInput,
} from '@trip-planner-ai/shared';
import { api } from './client';

export const itineraryApi = {
  getDays: (tripId: string) => api.get<ItineraryDay[]>(`/trips/${tripId}/days`),
  createDay: (tripId: string, data: CreateDayInput) =>
    api.post<ItineraryDay>(`/trips/${tripId}/days`, data),
  updateDay: (dayId: string, data: UpdateDayInput) =>
    api.put<ItineraryDay>(`/days/${dayId}`, data),
  deleteDay: (dayId: string) => api.delete(`/days/${dayId}`),
  createActivity: (dayId: string, data: CreateActivityInput) =>
    api.post<Activity>(`/days/${dayId}/activities`, data),
  updateActivity: (id: string, data: UpdateActivityInput) =>
    api.put<Activity>(`/activities/${id}`, data),
  deleteActivity: (id: string) => api.delete(`/activities/${id}`),
  reorderActivities: (dayId: string, orderedIds: string[]) =>
    api.patch(`/days/${dayId}/activities/reorder`, { orderedIds }),
};
