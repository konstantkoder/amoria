import AsyncStorage from "@react-native-async-storage/async-storage";
import { resetActivityFreshnessState } from "@/services/activityFreshness";
import { resetLocationPrivacyCache } from "@/services/locationPrivacy";

const ACCOUNT_SCOPED_KEYS = [
  "amoria_activity_freshness_v1",
  "amoria_location_consent_v1",
  "amoria_nearby_enabled",
  "amoria_map_show_people",
  "amoria_map_share_me",
  "amoria:together:radiusKm:v2",
  "amoria:together:ageFilter:v1",
];

export async function clearAccountLocalData(): Promise<void> {
  resetActivityFreshnessState();
  resetLocationPrivacyCache();
  await AsyncStorage.multiRemove(ACCOUNT_SCOPED_KEYS);
}
