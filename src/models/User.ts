export type Mood = "romantic" | "playful" | "chill" | "curious" | "adventurous";

export type Goal =
  | "relationship"
  | "dating"
  | "friendship"
  | "chat"
  | "unsure";

export type AgeGroup = "18-24" | "25-34" | "35-44" | "45-54" | "55+";

export type UserProfilePhoto = {
  mediaId: string;
  url: string;
  position?: number;
  visibility?: "public" | "locked";
};

export type LockedGallerySummary = {
  enabled: boolean;
  count: number;
};

export interface UserProfile {
  id: string;
  displayName: string;
  amoriaId: string;
  about?: string;
  avatarUrl?: string;
  interests: string[];
  photos: UserProfilePhoto[];
  lockedGallery?: LockedGallerySummary;
  birthDate?: string | null;
  age?: number | null;
  ageGroup?: AgeGroup | null;
  preferredAgeMin?: number;
  preferredAgeMax?: number | null;
  mood?: Mood;
  goal?: Goal;
  createdAt: number;
  updatedAt: number;
  mysteryMode?: boolean;
}
