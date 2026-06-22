import { AppError } from "../common/errors";
import {
  NEARBY_ACTIVITY_KEYS,
  type NearbyActivityKey,
} from "../config/constants";
import * as activityPreferencesRepo from "./nearby-activity-preferences.repo";

export type NearbyActivityPreferenceChecker = Pick<
  typeof activityPreferencesRepo,
  "hasActiveUserActivityPreferenceForActivity"
>;

export const NEARBY_ACTIVITY_PREFERENCE_REQUIRED_CODE =
  "nearby_activity_preference_required" as const;

export const NEARBY_ACTIVITY_PREFERENCE_REQUIRED_MESSAGE =
  "Fill Nearby Activities preferences before joining this activity.";

export async function requireNearbyActivityPreferenceForRoom(
  repo: NearbyActivityPreferenceChecker,
  userId: string,
  activityKey: string,
): Promise<void> {
  if (!isNearbyActivityKey(activityKey)) {
    throw nearbyActivityPreferenceRequired();
  }

  const hasPreference = await repo.hasActiveUserActivityPreferenceForActivity(
    userId,
    activityKey,
  );

  if (!hasPreference) {
    throw nearbyActivityPreferenceRequired();
  }
}

function isNearbyActivityKey(value: string): value is NearbyActivityKey {
  return (NEARBY_ACTIVITY_KEYS as readonly string[]).includes(value);
}

function nearbyActivityPreferenceRequired(): AppError {
  return new AppError(
    NEARBY_ACTIVITY_PREFERENCE_REQUIRED_CODE,
    NEARBY_ACTIVITY_PREFERENCE_REQUIRED_MESSAGE,
    403,
  );
}
