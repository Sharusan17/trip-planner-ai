import { api } from './client';
import type { Poll, CreatePollInput } from '@trip-planner-ai/shared';

export const pollsApi = {
  list: (tripId: string, travellerId?: string): Promise<Poll[]> => {
    const qs = travellerId ? `?traveller_id=${travellerId}` : '';
    return api.get(`/trips/${tripId}/polls${qs}`);
  },

  create: (tripId: string, data: CreatePollInput): Promise<Poll> =>
    api.post(`/trips/${tripId}/polls`, data),

  vote: (pollId: string, optionId: string, travellerId: string): Promise<{ ok: boolean }> =>
    api.post(`/polls/${pollId}/vote`, { option_id: optionId, traveller_id: travellerId }),

  delete: (id: string): Promise<void> =>
    api.delete(`/polls/${id}`),
};
