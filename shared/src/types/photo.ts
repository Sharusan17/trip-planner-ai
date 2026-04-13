export interface TripPhoto {
  id: string;
  trip_id: string;
  uploader_id: string;
  uploader_name?: string;
  uploader_colour?: string;
  day_id: string | null;
  filename: string;
  original_name: string;
  caption: string | null;
  created_at: string;
}
