import { api } from './client';
import type { TripPhoto } from '@trip-planner-ai/shared';

export const photosApi = {
  list: (tripId: string): Promise<TripPhoto[]> =>
    api.get(`/trips/${tripId}/photos`),

  upload: (tripId: string, file: File, uploaderId: string, caption?: string, dayId?: string): Promise<TripPhoto> => {
    const fd = new FormData();
    fd.append('photo', file);
    fd.append('uploader_id', uploaderId);
    if (caption) fd.append('caption', caption);
    if (dayId) fd.append('day_id', dayId);
    return api.postFile(`/trips/${tripId}/photos`, fd);
  },

  delete: (id: string): Promise<void> =>
    api.delete(`/photos/${id}`),
};
