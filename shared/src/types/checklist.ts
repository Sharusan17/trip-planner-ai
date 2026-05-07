export interface ChecklistItem {
  id: string;
  trip_id: string;
  label: string;
  is_shared: boolean;
  created_by: string | null;
  sort_order: number;
  checked: boolean;
  checked_at: string | null;
  created_at: string;
}
