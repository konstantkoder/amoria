import { NEARBY_ACTIVITY_DEFINITIONS } from "../config/constants";
import type { UserActivityPreferenceRow } from "../db/schema";
import * as preferencesRepo from "./nearby-activity-preferences.repo";
import type {
  NearbyActivityPreferenceDto,
  NearbyActivityPreferencesResponse,
  UpdateNearbyActivityPreferencesBody,
} from "./nearby-activity-preferences.types";

type NearbyActivityPreferencesServiceDeps = {
  repo: Pick<
    typeof preferencesRepo,
    "listActiveUserActivityPreferences" | "replaceUserActivityPreferences"
  >;
  now: () => Date;
};

const defaultDeps: NearbyActivityPreferencesServiceDeps = {
  repo: preferencesRepo,
  now: () => new Date(),
};

let deps: NearbyActivityPreferencesServiceDeps = defaultDeps;

export function __setNearbyActivityPreferencesServiceDepsForTests(
  overrides: Partial<NearbyActivityPreferencesServiceDeps>,
): () => void {
  const previous = deps;
  deps = {
    ...deps,
    ...overrides,
  };

  return () => {
    deps = previous;
  };
}

export async function getActivityPreferences(
  userId: string,
): Promise<NearbyActivityPreferencesResponse> {
  const rows = await deps.repo.listActiveUserActivityPreferences(userId);
  return toActivityPreferencesResponse(rows);
}

export async function updateActivityPreferences(
  userId: string,
  input: UpdateNearbyActivityPreferencesBody,
): Promise<NearbyActivityPreferencesResponse> {
  const rows = await deps.repo.replaceUserActivityPreferences(
    userId,
    input.preferences,
    deps.now(),
  );
  return toActivityPreferencesResponse(rows);
}

function toActivityPreferencesResponse(
  rows: UserActivityPreferenceRow[],
): NearbyActivityPreferencesResponse {
  return {
    availableActivities: NEARBY_ACTIVITY_DEFINITIONS.map((activity) => ({
      activityKey: activity.key,
      title: activity.title,
    })),
    preferences: rows.map(toPreferenceDto),
  };
}

function toPreferenceDto(row: UserActivityPreferenceRow): NearbyActivityPreferenceDto {
  return {
    activityKey: row.activityKey,
    status: row.status,
    geoBucket: row.geoBucket,
    source: row.source,
    updatedAt: row.updatedAt.toISOString(),
  };
}
