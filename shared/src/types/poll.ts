export interface PollOption {
  id: string;
  poll_id: string;
  text: string;
  sort_order: number;
  vote_count: number;
}

export interface Poll {
  id: string;
  trip_id: string;
  created_by: string;
  created_by_name?: string;
  created_by_colour?: string;
  question: string;
  closes_at: string | null;
  created_at: string;
  options: PollOption[];
  my_vote_option_id: string | null;
  total_votes: number;
}

export interface CreatePollInput {
  question: string;
  options: string[];
  created_by: string;
  closes_at?: string | null;
}
