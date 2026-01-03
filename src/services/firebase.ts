import AsyncStorage from "@react-native-async-storage/async-storage";
import { UserProfile } from "../models/User";

const UID_KEY = "@demo_uid";

function profileKey(uid: string) {
  return `@demo_profile_${uid}`;
}

// Простейшая "аутентификация": генерим и храним локальный uid
export async function ensureAuth(): Promise<string> {
  let uid = await AsyncStorage.getItem(UID_KEY);
  if (!uid) {
    uid = "demo_" + Math.random().toString(36).slice(2, 10);
    await AsyncStorage.setItem(UID_KEY, uid);
  }
  return uid;
}

// Загрузка профиля пользователя из AsyncStorage
export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const raw = await AsyncStorage.getItem(profileKey(uid));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UserProfile;
  } catch {
    return null;
  }
}

// Обновление полей профиля (merge по partial update)
export async function updateUserFields(
  uid: string,
  updates: Partial<UserProfile>
): Promise<void> {
  const current = (await getUserProfile(uid)) ?? ({ uid } as UserProfile);
  const next: UserProfile = {
    ...current,
    ...updates,
    uid: current.uid || uid,
  };
  await AsyncStorage.setItem(profileKey(uid), JSON.stringify(next));
}

// Обновление только фотографий
export async function updateUserPhotos(
  uid: string,
  photos: string[]
): Promise<void> {
  await updateUserFields(uid, { photos } as Partial<UserProfile>);
}

// Удаление аккаунта (в демо просто чистим локальный профиль)
export async function deleteUserCompletely(uid: string): Promise<void> {
  await AsyncStorage.removeItem(profileKey(uid));
  // uid оставляем, чтобы не плодить новые аккаунты каждый запуск
}

// Жалоба/бан — в демо без реального бэкенда
export async function reportUser(
  uid: string,
  targetId: string,
  reason: string
): Promise<void> {
  void uid;
  void targetId;
  void reason;
}

export async function blockUser(uid: string, targetId: string): Promise<void> {
  void uid;
  void targetId;
}

export async function setAdultConsent(enabled: boolean): Promise<void> {
  void enabled;
}

export async function setFlirtEnabledRemote(enabled: boolean): Promise<void> {
  void enabled;
}

export { app, auth, db, storage, isFirebaseConfigured } from "../config/firebaseConfig";
