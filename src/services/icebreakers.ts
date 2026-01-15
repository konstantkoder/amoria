import { Goal, Mood, UserProfile } from "@/models/User";

export type Icebreaker = {
  key: string;
  params?: Record<string, string>;
};

const FALLBACK_KEYS: string[] = [
  "icebreaker.fallback.1",
  "icebreaker.fallback.2",
  "icebreaker.fallback.3",
];

const GOAL_BASED_KEYS: Partial<Record<Goal, string[]>> = {
  dating: [
    "icebreaker.goal.dating.1",
    "icebreaker.goal.dating.2",
  ],
  friends: [
    "icebreaker.goal.friends.1",
    "icebreaker.goal.friends.2",
  ],
  chat: [
    "icebreaker.goal.chat.1",
    "icebreaker.goal.chat.2",
  ],
  long_term: [
    "icebreaker.goal.long_term.1",
    "icebreaker.goal.long_term.2",
  ],
  short_term: [
    "icebreaker.goal.short_term.1",
    "icebreaker.goal.short_term.2",
  ],
};

const MOOD_BASED_KEYS: Partial<Record<Mood, string[]>> = {
  happy: [
    "icebreaker.mood.happy.1",
    "icebreaker.mood.happy.2",
  ],
  chill: [
    "icebreaker.mood.chill.1",
    "icebreaker.mood.chill.2",
  ],
  active: [
    "icebreaker.mood.active.1",
    "icebreaker.mood.active.2",
  ],
  serious: [
    "icebreaker.mood.serious.1",
    "icebreaker.mood.serious.2",
  ],
  party: [
    "icebreaker.mood.party.1",
    "icebreaker.mood.party.2",
  ],
};

export function getIcebreakerForUser(
  user: Pick<UserProfile, "goal" | "mood" | "interests" | "displayName">
): Icebreaker | null {
  const pool: Icebreaker[] = [];

  if (user.goal && GOAL_BASED_KEYS[user.goal]) {
    const keys = GOAL_BASED_KEYS[user.goal] ?? [];
    pool.push(...keys.map((key) => ({ key })));
  }

  if (user.mood && MOOD_BASED_KEYS[user.mood]) {
    const keys = MOOD_BASED_KEYS[user.mood] ?? [];
    pool.push(...keys.map((key) => ({ key })));
  }

  if (user.interests && user.interests.length > 0) {
    const topInterest = user.interests[0];
    if (topInterest) {
      pool.push(
        {
          key: "icebreaker.interest.1",
          params: { interest: topInterest },
        },
        {
          key: "icebreaker.interest.2",
          params: { interest: topInterest },
        },
      );
    }
  }

  if (pool.length === 0) {
    const fallbackKey =
      FALLBACK_KEYS[Math.floor(Math.random() * FALLBACK_KEYS.length)];
    return { key: fallbackKey };
  }

  return pool[Math.floor(Math.random() * pool.length)];
}
