export type Mood = "happy" | "chill" | "active" | "serious" | "party";

export type Goal =
  | "dating"
  | "friends"
  | "chat"
  | "long_term"
  | "short_term"
  | "casual"
  | "sex";

export interface UserProfile {
  uid: string;
  displayName: string;
  birthdate?: string;
  gender?: "male" | "female" | "other";
  about?: string;
  avatarUrl?: string;
  interests: string[];
  photos: string[];
  mood?: Mood;
  goal?: Goal;
  createdAt: number;
  updatedAt: number;
  geo?: {
    lat: number;
    lng: number;
    geohash: string;
  };
  trustLevel?: number;
  revealStage?: number;
  allowAdultMode?: boolean;
  flirtEnabled?: boolean;
  mysteryMode?: boolean;
  voiceIntroUrl?: string;
  hasVoiceIntro?: boolean;
  voiceIntroDurationSec?: number;
  lastActive?: number;
  greenFlags?: string[];
  redFlags?: string[];
}
