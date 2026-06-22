import { and, eq, sql } from "drizzle-orm";
import {
  type NearbyActivityKey,
  type UserActivityPreferenceSource,
  type UserActivityPreferenceStatus,
} from "../config/constants";
import { db } from "../db/client";
import {
  nearbyProfileVisibility,
  nearbyRooms,
  userActivityPreferences,
} from "../db/schema";

const QUESTIONNAIRE_SOURCE = "nearby_questionnaire" as const;

export type NearbyActivityDemandPreferenceRow = {
  userId: string;
  activityKey: NearbyActivityKey;
  status: UserActivityPreferenceStatus;
  geoBucket: string | null;
  source: UserActivityPreferenceSource;
  updatedAt: Date;
  hasActiveNearbyVisibility: boolean;
};

export type NearbyActivityDemandRoomRow = {
  typeKey: string;
  status: string;
};

export type NearbyActivityDemandSourceRows = {
  preferences: NearbyActivityDemandPreferenceRow[];
  rooms: NearbyActivityDemandRoomRow[];
};

export async function listNearbyActivityDemandSourceRows(
  checkedAt: Date,
): Promise<NearbyActivityDemandSourceRows> {
  const [preferences, rooms] = await Promise.all([
    db
      .select({
        userId: userActivityPreferences.userId,
        activityKey: userActivityPreferences.activityKey,
        status: userActivityPreferences.status,
        geoBucket: userActivityPreferences.geoBucket,
        source: userActivityPreferences.source,
        updatedAt: userActivityPreferences.updatedAt,
        hasActiveNearbyVisibility: sql<boolean>`coalesce(
          ${nearbyProfileVisibility.status} = 'active'
            and ${nearbyProfileVisibility.expiresAt} > ${checkedAt},
          false
        )`,
      })
      .from(userActivityPreferences)
      .leftJoin(
        nearbyProfileVisibility,
        eq(nearbyProfileVisibility.userId, userActivityPreferences.userId),
      )
      .where(
        and(
          eq(userActivityPreferences.source, QUESTIONNAIRE_SOURCE),
          eq(userActivityPreferences.status, "active"),
        ),
      ),
    db
      .select({
        typeKey: nearbyRooms.typeKey,
        status: nearbyRooms.status,
      })
      .from(nearbyRooms)
      .where(eq(nearbyRooms.status, "active")),
  ]);

  return {
    preferences,
    rooms,
  };
}
