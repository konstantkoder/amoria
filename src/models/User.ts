export type Mood = "romantic" | "playful" | "chill" | "curious" | "adventurous";

export type Goal =
  | "relationship"
  | "dating"
  | "friendship"
  | "chat"
  | "unsure";

export type UserProfilePhoto = {
  mediaId: string;
  url: string;
};

export interface UserProfile {
  id: string;
  displayName: string;
  amoriaId: string;
  about?: string;
  avatarUrl?: string;
  interests: string[];
  photos: UserProfilePhoto[];
  mood?: Mood;
  goal?: Goal;
  createdAt: number;
  updatedAt: number;
  allowAdultMode?: boolean;
  flirtEnabled?: boolean;
  mysteryMode?: boolean;
}
