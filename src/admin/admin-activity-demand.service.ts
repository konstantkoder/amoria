import {
  NEARBY_ACTIVITY_DEFINITIONS,
  NEARBY_ACTIVITY_KEYS,
} from "../config/constants";
import type { NearbyActivityKey } from "../config/constants";
import * as activityDemandRepo from "../nearby/nearby-activity-demand.repo";
import type {
  NearbyActivityDemandPreferenceRow,
  NearbyActivityDemandRoomRow,
} from "../nearby/nearby-activity-demand.repo";
import * as auditService from "./admin-audit.service";
import type {
  AdminNearbyActivityDemandGeoBucketDto,
  AdminNearbyActivityDemandResponse,
  AdminNearbyActivityDemandRowDto,
} from "./admin-activity-demand.types";
import type { AdminContext, AdminRequestContext } from "./admin.types";

const QUESTIONNAIRE_SOURCE = "nearby_questionnaire" as const;
const RECENT_ACTIVITY_DEMAND_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const GEO_BUCKET_PRIVACY_THRESHOLD = 3;
const SMALL_BUCKET_HIDDEN = "small_bucket_hidden";
const nearbyActivityKeySet = new Set<string>(NEARBY_ACTIVITY_KEYS);

type AdminActivityDemandDeps = {
  now: () => Date;
  repo: Pick<typeof activityDemandRepo, "listNearbyActivityDemandSourceRows">;
  audit: Pick<typeof auditService, "writeAuditLog">;
};

const defaultDeps: AdminActivityDemandDeps = {
  now: () => new Date(),
  repo: activityDemandRepo,
  audit: auditService,
};

let deps: AdminActivityDemandDeps = defaultDeps;

export function __setAdminActivityDemandServiceDepsForTests(
  overrides: Partial<AdminActivityDemandDeps>,
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

export async function getNearbyActivityDemandForAdmin(
  admin: AdminContext,
  requestContext: AdminRequestContext,
): Promise<AdminNearbyActivityDemandResponse> {
  const checkedAt = deps.now();
  const sourceRows = await deps.repo.listNearbyActivityDemandSourceRows(checkedAt);
  const items = buildNearbyActivityDemandRows(sourceRows, checkedAt);

  await deps.audit.writeAuditLog({
    adminUserId: admin.adminUser.id,
    action: "admin.nearbyActivityDemand.read",
    targetType: "nearby_activity_demand",
    metadata: {
      resultCount: items.length,
      totalInterestedUsersCount: items.reduce(
        (total, item) => total + item.interestedUsersCount,
        0,
      ),
      totalActiveNearbyUsersCount: items.reduce(
        (total, item) => total + item.activeNearbyUsersCount,
        0,
      ),
      totalExistingActiveRoomCount: items.reduce(
        (total, item) => total + item.existingActiveRoomCount,
        0,
      ),
    },
    ...requestContext,
  });

  return {
    items,
    nextCursor: null,
  };
}

export function buildNearbyActivityDemandRows(
  sourceRows: {
    preferences: NearbyActivityDemandPreferenceRow[];
    rooms: NearbyActivityDemandRoomRow[];
  },
  checkedAt: Date,
): AdminNearbyActivityDemandRowDto[] {
  const recentSince = new Date(checkedAt.getTime() - RECENT_ACTIVITY_DEMAND_WINDOW_MS);
  const summaries = new Map<NearbyActivityKey, ActivityDemandSummary>();

  for (const activity of NEARBY_ACTIVITY_DEFINITIONS) {
    summaries.set(activity.key, {
      activityKey: activity.key,
      activityTitle: activity.title,
      interestedUserIds: new Set(),
      activeNearbyUserIds: new Set(),
      recentlyUpdatedUserIds: new Set(),
      userIdsByGeoBucket: new Map(),
      existingActiveRoomCount: 0,
      lastUpdatedAt: null,
    });
  }

  for (const preference of sourceRows.preferences) {
    if (!isCountableActivityPreference(preference)) {
      continue;
    }

    const summary = summaries.get(preference.activityKey);
    if (!summary) {
      continue;
    }

    summary.interestedUserIds.add(preference.userId);

    if (preference.hasActiveNearbyVisibility) {
      summary.activeNearbyUserIds.add(preference.userId);
    }

    if (preference.updatedAt >= recentSince) {
      summary.recentlyUpdatedUserIds.add(preference.userId);
    }

    const geoBucket = normalizeGeoBucket(preference.geoBucket);
    if (geoBucket) {
      const bucketUsers = summary.userIdsByGeoBucket.get(geoBucket) ?? new Set<string>();
      bucketUsers.add(preference.userId);
      summary.userIdsByGeoBucket.set(geoBucket, bucketUsers);
    }

    if (
      summary.lastUpdatedAt === null ||
      preference.updatedAt.getTime() > summary.lastUpdatedAt.getTime()
    ) {
      summary.lastUpdatedAt = preference.updatedAt;
    }
  }

  for (const room of sourceRows.rooms) {
    if (room.status !== "active" || !nearbyActivityKeySet.has(room.typeKey)) {
      continue;
    }

    const summary = summaries.get(room.typeKey as NearbyActivityKey);
    if (summary) {
      summary.existingActiveRoomCount += 1;
    }
  }

  return NEARBY_ACTIVITY_DEFINITIONS.map((activity) => {
    const summary = summaries.get(activity.key);
    if (!summary) {
      return emptyDemandRow(activity.key, activity.title);
    }

    return {
      activityKey: summary.activityKey,
      activityTitle: summary.activityTitle,
      interestedUsersCount: summary.interestedUserIds.size,
      activeNearbyUsersCount: summary.activeNearbyUserIds.size,
      recentlyUpdatedUsersCount: summary.recentlyUpdatedUserIds.size,
      geoBuckets: toPrivacySafeGeoBuckets(summary.userIdsByGeoBucket),
      existingActiveRoomCount: summary.existingActiveRoomCount,
      lastUpdatedAt: summary.lastUpdatedAt?.toISOString() ?? null,
    };
  });
}

type ActivityDemandSummary = {
  activityKey: NearbyActivityKey;
  activityTitle: string;
  interestedUserIds: Set<string>;
  activeNearbyUserIds: Set<string>;
  recentlyUpdatedUserIds: Set<string>;
  userIdsByGeoBucket: Map<string, Set<string>>;
  existingActiveRoomCount: number;
  lastUpdatedAt: Date | null;
};

function isCountableActivityPreference(
  preference: NearbyActivityDemandPreferenceRow,
): boolean {
  return (
    preference.status === "active" &&
    preference.source === QUESTIONNAIRE_SOURCE &&
    nearbyActivityKeySet.has(preference.activityKey)
  );
}

function toPrivacySafeGeoBuckets(
  userIdsByGeoBucket: Map<string, Set<string>>,
): AdminNearbyActivityDemandGeoBucketDto[] {
  const visible: AdminNearbyActivityDemandGeoBucketDto[] = [];
  let hiddenSmallBucketCount = 0;

  for (const [geoBucket, userIds] of userIdsByGeoBucket) {
    const interestedUsersCount = userIds.size;
    if (interestedUsersCount >= GEO_BUCKET_PRIVACY_THRESHOLD) {
      visible.push({
        geoBucket,
        interestedUsersCount,
      });
    } else {
      hiddenSmallBucketCount += interestedUsersCount;
    }
  }

  visible.sort(
    (left, right) =>
      right.interestedUsersCount - left.interestedUsersCount ||
      left.geoBucket.localeCompare(right.geoBucket),
  );

  if (hiddenSmallBucketCount > 0) {
    visible.push({
      geoBucket: SMALL_BUCKET_HIDDEN,
      interestedUsersCount: hiddenSmallBucketCount,
    });
  }

  return visible;
}

function emptyDemandRow(
  activityKey: NearbyActivityKey,
  activityTitle: string,
): AdminNearbyActivityDemandRowDto {
  return {
    activityKey,
    activityTitle,
    interestedUsersCount: 0,
    activeNearbyUsersCount: 0,
    recentlyUpdatedUsersCount: 0,
    geoBuckets: [],
    existingActiveRoomCount: 0,
    lastUpdatedAt: null,
  };
}

function normalizeGeoBucket(value: string | null | undefined): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed ? trimmed : null;
}
