import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "../db/client";
import {
  type NewUserActivityPreferenceRow,
  type UserActivityPreferenceRow,
  userActivityPreferences,
} from "../db/schema";
import type { NearbyActivityKey } from "../config/constants";
import type { NearbyActivityPreferenceInput } from "./nearby-activity-preferences.types";

const QUESTIONNAIRE_SOURCE = "nearby_questionnaire" as const;

export async function hasActiveUserActivityPreferenceForActivity(
  userId: string,
  activityKey: NearbyActivityKey,
): Promise<boolean> {
  const [row] = await db
    .select({ userId: userActivityPreferences.userId })
    .from(userActivityPreferences)
    .where(
      and(
        eq(userActivityPreferences.userId, userId),
        eq(userActivityPreferences.activityKey, activityKey),
        eq(userActivityPreferences.source, QUESTIONNAIRE_SOURCE),
        eq(userActivityPreferences.status, "active"),
      ),
    )
    .limit(1);

  return Boolean(row);
}

export async function listActiveUserActivityPreferences(
  userId: string,
): Promise<UserActivityPreferenceRow[]> {
  return db
    .select()
    .from(userActivityPreferences)
    .where(
      and(
        eq(userActivityPreferences.userId, userId),
        eq(userActivityPreferences.source, QUESTIONNAIRE_SOURCE),
        eq(userActivityPreferences.status, "active"),
      ),
    )
    .orderBy(
      asc(userActivityPreferences.activityKey),
      asc(userActivityPreferences.geoBucket),
    );
}

export async function replaceUserActivityPreferences(
  userId: string,
  preferences: NearbyActivityPreferenceInput[],
  updatedAt: Date,
): Promise<UserActivityPreferenceRow[]> {
  const requestedKeys = new Set(preferences.map(toPreferenceKey));

  return db.transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(userActivityPreferences)
      .where(
        and(
          eq(userActivityPreferences.userId, userId),
          eq(userActivityPreferences.source, QUESTIONNAIRE_SOURCE),
        ),
      );

    const existingByKey = new Map(existing.map((row) => [toPreferenceKey(row), row]));

    for (const row of existing) {
      if (row.status === "active" && !requestedKeys.has(toPreferenceKey(row))) {
        await tx
          .update(userActivityPreferences)
          .set({ status: "disabled", updatedAt })
          .where(preferenceWhere(row.userId, row.activityKey, row.geoBucket));
      }
    }

    for (const preference of preferences) {
      const geoBucket = normalizeGeoBucket(preference.geoBucket);
      const existingRow = existingByKey.get(toPreferenceKey({ ...preference, geoBucket }));
      if (existingRow) {
        await tx
          .update(userActivityPreferences)
          .set({
            status: "active",
            source: QUESTIONNAIRE_SOURCE,
            updatedAt,
          })
          .where(preferenceWhere(userId, preference.activityKey, geoBucket));
        continue;
      }

      const insertRow: NewUserActivityPreferenceRow = {
        userId,
        activityKey: preference.activityKey,
        status: "active",
        geoBucket,
        source: QUESTIONNAIRE_SOURCE,
        createdAt: updatedAt,
        updatedAt,
      };
      await tx.insert(userActivityPreferences).values(insertRow);
    }

    return tx
      .select()
      .from(userActivityPreferences)
      .where(
        and(
          eq(userActivityPreferences.userId, userId),
          eq(userActivityPreferences.source, QUESTIONNAIRE_SOURCE),
          eq(userActivityPreferences.status, "active"),
        ),
      )
      .orderBy(
        asc(userActivityPreferences.activityKey),
        asc(userActivityPreferences.geoBucket),
      );
  });
}

function preferenceWhere(
  userId: string,
  activityKey: NearbyActivityKey,
  geoBucket: string | null,
) {
  return and(
    eq(userActivityPreferences.userId, userId),
    eq(userActivityPreferences.activityKey, activityKey),
    eq(userActivityPreferences.source, QUESTIONNAIRE_SOURCE),
    geoBucket === null
      ? isNull(userActivityPreferences.geoBucket)
      : eq(userActivityPreferences.geoBucket, geoBucket),
  );
}

function toPreferenceKey(
  value: { activityKey: string; geoBucket?: string | null },
): string {
  return `${value.activityKey}:${normalizeGeoBucket(value.geoBucket) ?? ""}`;
}

function normalizeGeoBucket(value: string | null | undefined): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed ? trimmed : null;
}
