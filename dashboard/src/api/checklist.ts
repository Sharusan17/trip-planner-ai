import { api } from './client';
import type { ChecklistItem } from '@trip-planner-ai/shared';

export const checklistApi = {
  getItems: (tripId: string, travellerId: string) =>
    api.get<ChecklistItem[]>(`/trips/${tripId}/checklist?traveller_id=${travellerId}`),

  addItem: (tripId: string, data: { label: string; is_shared: boolean; created_by: string }) =>
    api.post<ChecklistItem>(`/trips/${tripId}/checklist/items`, data),

  updateItem: (id: string, data: { label?: string; is_shared?: boolean }) =>
    api.patch<ChecklistItem>(`/checklist-items/${id}`, data),

  deleteItem: (id: string) =>
    api.delete<void>(`/checklist-items/${id}`),

  toggleCheck: (id: string, travellerId: string, checked: boolean) =>
    api.patch<void>(`/checklist-items/${id}/check`, { traveller_id: travellerId, checked }),
};
