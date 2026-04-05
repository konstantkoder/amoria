import { UserProfile } from "../models/User";

export type DemoUser = Partial<UserProfile> & {
  age?: number;
  distanceKm?: number;
  bio?: string;
  name?: string;
};

export const DEMO_USERS: DemoUser[] = [
  {
    uid: "demo_anna",
    displayName: "Anna, 28",
    about: "Marketer, love coffee and long walks.",
    interests: ["coffee", "walks", "movies", "yoga"],
    photos: [],
    mood: "happy",
    goal: "dating",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    geo: { lat: 45.812, lng: 15.975, geohash: "u2yh…" },
    hasVoiceIntro: true,
    voiceIntroDurationSec: 7,
  },
  {
    uid: "demo_maria",
    displayName: "Maria, 31",
    about: "Introvert, books, series, and cozy flea markets.",
    interests: ["books", "series", "cats", "art"],
    photos: [],
    mood: "chill",
    goal: "friends",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    geo: { lat: 45.817, lng: 15.985, geohash: "u2yh…" },
    hasVoiceIntro: true,
    voiceIntroDurationSec: 9,
  },
  {
    uid: "demo_olga",
    displayName: "Olga, 26",
    about: "I love hitchhiking trips and photographing cities.",
    interests: ["photo", "trips", "cafes"],
    photos: [],
    mood: "active",
    goal: "chat",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    geo: { lat: 45.81, lng: 15.99, geohash: "u2yh…" },
  },
  {
    uid: "demo_irina",
    displayName: "Irina, 29",
    about: "Looking for people to play board games and watch films.",
    interests: ["board games", "sci-fi", "marvel"],
    photos: [],
    mood: "serious",
    goal: "long_term",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    geo: { lat: 45.819, lng: 15.97, geohash: "u2yh…" },
  },
  {
    uid: "demo_vika",
    displayName: "Vika, 25",
    about: "Parties, concerts, and spontaneous trips to the sea.",
    interests: ["concerts", "pop", "beach"],
    photos: [],
    mood: "party",
    goal: "short_term",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    geo: { lat: 45.813, lng: 15.98, geohash: "u2yh…" },
  },
  {
    uid: "demo_liza",
    displayName: "Liza, 27",
    about: "Love cooking pasta and watching stand-up.",
    interests: ["food", "standup", "travel"],
    photos: [],
    mood: "happy",
    goal: "casual",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    geo: { lat: 45.816, lng: 15.982, geohash: "u2yh…" },
    hasVoiceIntro: true,
    voiceIntroDurationSec: 12,
  },
];
