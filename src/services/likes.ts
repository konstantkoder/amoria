import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY_LIKES = "amoria.likes.v1";
const KEY_DISLIKES = "amoria.dislikes.v1";

type Id = string;

async function loadIds(key: string): Promise<Id[]> {
  try {
    const raw = await AsyncStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((x) => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

async function saveIds(key: string, ids: Id[]): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(ids));
  } catch {
    // ignore
  }
}

export async function getLikes(): Promise<Id[]> {
  return loadIds(KEY_LIKES);
}

export async function getDislikes(): Promise<Id[]> {
  return loadIds(KEY_DISLIKES);
}

export async function addLike(userId: Id): Promise<Id[]> {
  const [likes, dislikes] = await Promise.all([getLikes(), getDislikes()]);
  const nextLikes = likes.includes(userId) ? likes : [userId, ...likes];
  const nextDislikes = dislikes.filter((id) => id !== userId);
  await Promise.all([
    saveIds(KEY_LIKES, nextLikes),
    saveIds(KEY_DISLIKES, nextDislikes),
  ]);
  return nextLikes;
}

export async function addDislike(userId: Id): Promise<Id[]> {
  const [likes, dislikes] = await Promise.all([getLikes(), getDislikes()]);
  const nextDislikes = dislikes.includes(userId)
    ? dislikes
    : [userId, ...dislikes];
  const nextLikes = likes.filter((id) => id !== userId);
  await Promise.all([
    saveIds(KEY_LIKES, nextLikes),
    saveIds(KEY_DISLIKES, nextDislikes),
  ]);
  return nextDislikes;
}

export async function clearLikesDislikes(): Promise<void> {
  await Promise.all([
    AsyncStorage.removeItem(KEY_LIKES),
    AsyncStorage.removeItem(KEY_DISLIKES),
  ]);
}
