import { DEMO_USERS } from "./demoUsers";
import { UserProfile } from "../models/User";

// Полностью офлайн-режим: просто возвращаем DEMO_USERS,
// игнорируя координаты и радиус.
export async function fetchNearbyUsers(
  _lat: number,
  _lng: number,
  _radiusKm: number
): Promise<UserProfile[]> {
  // Имитация небольшой задержки сети
  await new Promise((resolve) => setTimeout(resolve, 200));
  return DEMO_USERS;
}
