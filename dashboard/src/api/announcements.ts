import { api } from './client';
import type { Announcement, CreateAnnouncementInput } from '@trip-planner-ai/shared';

export const announcementsApi = {
  list: (tripId: string): Promise<Announcement[]> =>
    api.get(`/trips/${tripId}/announcements`),

  create: (tripId: string, data: CreateAnnouncementInput): Promise<Announcement> =>
    api.post(`/trips/${tripId}/announcements`, data),

  pin: (id: string, pinned: boolean): Promise<Announcement> =>
    api.patch(`/announcements/${id}/pin`, { pinned }),

  delete: (id: string): Promise<void> =>
    api.delete(`/announcements/${id}`),
};
