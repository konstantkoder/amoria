export type Mood = 'happy' | 'chill' | 'active' | 'serious' | 'party';
export type Goal = 'dating' | 'friends' | 'chat' | 'long_term' | 'short_term';

export interface UserProfile {
  uid: string;
  displayName: string;
  birthdate: string;
  gender?: 'male' | 'female' | 'other';
  about?: string;
  interests: string[];
  photos: string[];
  mood?: Mood;
  goal?: Goal;
  createdAt: number;
  updatedAt: number;
  geo?: { lat: number; lng: number; geohash: string; };
}
