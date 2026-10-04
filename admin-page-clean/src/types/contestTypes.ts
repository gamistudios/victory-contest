export interface Rank {
  user_id: string;
  score: number;
  rank: number;
  user_name: string;
  imgurl?: string; // Optional, in case some users don't have an image URL
}
