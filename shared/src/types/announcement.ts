export interface Announcement {
  id: string;
  trip_id: string;
  author_id: string;
  author_name?: string;
  author_colour?: string;
  title: string;
  content: string;
  pinned: boolean;
  created_at: string;
}

export interface CreateAnnouncementInput {
  title: string;
  content: string;
  author_id: string;
  pinned?: boolean;
}
