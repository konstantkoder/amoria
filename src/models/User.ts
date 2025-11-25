import type { } from "react";

// Типы настроения и целей знакомства
export type Mood = "happy" | "chill" | "active" | "serious" | "party";

export type Goal =
  | "dating"
  | "friends"
  | "chat"
  | "long_term"
  | "short_term"
  | "casual"
  | "sex";

// Базовая модель пользователя Amoria
export interface UserProfile {
  uid: string;
  displayName: string;
  birthdate?: string;
  gender?: "male" | "female" | "other";
  about?: string;
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

  // Новые поля для Amoria 1.0 MAX
  trustLevel?: number;       // 0–100, уровень доверия
  revealStage?: number;      // 0–3, этап раскрытия профиля/фото
  allowAdultMode?: boolean;  // включён ли 18+ / casual режим
  mysteryMode?: boolean;     // включён ли режим "фото позже"
  voiceIntroUrl?: string;    // URL голосового интро
  lastActive?: number;       // timestamp последней активности
  greenFlags?: string[];     // что ок
  redFlags?: string[];       // что не ок
}
