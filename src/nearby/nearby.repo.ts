import { and, count, desc, eq, gt, isNull, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { PROFILE_GENDERS } from "../config/constants";
import { db } from "../db/client";
import {
  type BlockedUserRow,
  type NearbyProfileVisibilityRow,
  type NearbyStatusRow,
  type NewNearbyProfileVisibilityRow,
  type NewNearbyStatusRow,
  type ProfileGender,
  type UserRow,
  blockedUsers,
  nearbyProfileVisibility,
  nearbyStatuses,
  users,
} from "../db/schema";
import {
  calculateAge,
  isAgeInsidePreferredRange,
} from "../users/age";

export type NearbyFeedRow = {
  id: string;
  authorUserId: string;
  text: string;
  distanceMeters: number;
  createdAt: Date;
  expiresAt: Date;
  author: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
  };
};

export type NearbyProfileFeedRow = {
  visibility: NearbyProfileVisibilityRow;
  user: UserRow;
  distanceKm: number;
};

export const nearbyAdminFeedExclusionReasons = [
  "self",
  "blocked",
  "visibility_off",
  "visibility_expired",
  "distance_too_far",
  "age_mismatch",
  "gender_mismatch",
  "missing_birth_date",
  "missing_gender",
  "missing_preferred_genders",
] as const;

export type NearbyAdminFeedExclusionReason =
  (typeof nearbyAdminFeedExclusionReasons)[number];

export const nearbyAdminProfileMissingReasons = [
  "missing_birth_date",
  "missing_gender",
  "missing_preferred_genders",
  "missing_avatar",
  "missing_display_name",
] as const;

export type NearbyAdminProfileMissingReason =
  (typeof nearbyAdminProfileMissingReasons)[number];

export type NearbyAdminVisibilityStatusBucket = "active" | "off" | "expired" | "none";

export type NearbyAdminProfileReadinessItem = {
  amoriaId: string;
  displayName: string | null;
  emailMasked: string | null;
  missingReasons: NearbyAdminProfileMissingReason[];
  visibilityStatus: NearbyAdminVisibilityStatusBucket;
  createdAt: Date;
  updatedAt: Date;
};

export type NearbyAdminDiagnostics = {
  checkedAt: Date;
  activeVisibilityCount: number;
  offVisibilityCount: number;
  expiredVisibilityCount: number;
  recentlyUpdatedCount: number;
  profileReadinessMissing: {
    missingBirthDate: number;
    missingGender: number;
    missingPreferredGenders: number;
    missingAvatar: number;
    missingDisplayName: number;
  };
  profileReadinessItems: NearbyAdminProfileReadinessItem[];
  feedExclusionReasons: Record<NearbyAdminFeedExclusionReason, number>;
};

export type NearbySummaryCounts = {
  totalUsersCount: number;
  onlineNowCount: number;
  activeNearbyCount: number;
};

const ONLINE_NOW_WINDOW_MS = 5 * 60 * 1000;

export async function createNearbyStatus(input: NewNearbyStatusRow): Promise<NearbyStatusRow> {
  const [created] = await db.insert(nearbyStatuses).values(input).returning();
  return created;
}

export async function findNearbyProfileVisibility(
  userId: string,
): Promise<NearbyProfileVisibilityRow | undefined> {
  return db.query.nearbyProfileVisibility.findFirst({
    where: eq(nearbyProfileVisibility.userId, userId),
  });
}

export async function upsertNearbyProfileVisibility(
  input: NewNearbyProfileVisibilityRow,
): Promise<NearbyProfileVisibilityRow> {
  const [row] = await db
    .insert(nearbyProfileVisibility)
    .values(input)
    .onConflictDoUpdate({
      target: nearbyProfileVisibility.userId,
      set: {
        status: input.status,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        radiusKm: input.radiusKm ?? null,
        nearbyStatus: input.nearbyStatus ?? null,
        statusKind: input.statusKind ?? null,
        updatedAt: input.updatedAt ?? new Date(),
        expiresAt: input.expiresAt ?? null,
      },
    })
    .returning();

  return row;
}

export async function getNearbySummaryCounts(
  checkedAt = new Date(),
): Promise<NearbySummaryCounts> {
  const onlineSince = new Date(checkedAt.getTime() - ONLINE_NOW_WINDOW_MS);

  const [totalRows, onlineRows, activeRows] = await Promise.all([
    db.select({ value: count() }).from(users),
    db
      .select({ value: count() })
      .from(users)
      .where(gt(users.lastSeenAt, onlineSince)),
    db
      .select({ value: count() })
      .from(nearbyProfileVisibility)
      .where(
        and(
          eq(nearbyProfileVisibility.status, "active"),
          gt(nearbyProfileVisibility.expiresAt, checkedAt),
        ),
      ),
  ]);

  return {
    totalUsersCount: Number(totalRows[0]?.value ?? 0),
    onlineNowCount: Number(onlineRows[0]?.value ?? 0),
    activeNearbyCount: Number(activeRows[0]?.value ?? 0),
  };
}

export async function listNearbyProfileFeedRows(
  viewerUserId: string,
  viewerLatitude: number,
  viewerLongitude: number,
  viewerRadiusKm: number,
  limit: number,
): Promise<NearbyProfileFeedRow[]> {
  const now = new Date();
  const distanceKm = haversineDistanceKm(viewerLatitude, viewerLongitude);
  const viewerBlock = alias(blockedUsers, "nearby_profile_viewer_block");
  const candidateBlock = alias(blockedUsers, "nearby_profile_candidate_block");

  return db
    .select({
      visibility: nearbyProfileVisibility,
      user: users,
      distanceKm,
    })
    .from(nearbyProfileVisibility)
    .innerJoin(users, eq(users.id, nearbyProfileVisibility.userId))
    .leftJoin(
      viewerBlock,
      and(
        eq(viewerBlock.userId, viewerUserId),
        eq(viewerBlock.blockedUserId, nearbyProfileVisibility.userId),
      ),
    )
    .leftJoin(
      candidateBlock,
      and(
        eq(candidateBlock.userId, nearbyProfileVisibility.userId),
        eq(candidateBlock.blockedUserId, viewerUserId),
      ),
    )
    .where(
      and(
        ne(nearbyProfileVisibility.userId, viewerUserId),
        eq(nearbyProfileVisibility.status, "active"),
        gt(nearbyProfileVisibility.expiresAt, now),
        isNull(viewerBlock.blockedUserId),
        isNull(candidateBlock.blockedUserId),
        sql`${distanceKm} <= ${viewerRadiusKm}`,
        sql`${distanceKm} <= ${nearbyProfileVisibility.radiusKm}`,
      ),
    )
    .orderBy(sql`${distanceKm}`, desc(nearbyProfileVisibility.updatedAt))
    .limit(limit);
}

export async function getNearbyAdminDiagnostics(
  checkedAt = new Date(),
): Promise<NearbyAdminDiagnostics> {
  const [userRows, visibilityRows, blockRows] = await Promise.all([
    db.select({
      id: users.id,
      amoriaId: users.amoriaId,
      displayName: users.displayName,
      email: users.email,
      avatarUrl: users.avatarUrl,
      gender: users.gender,
      preferredGenders: users.preferredGenders,
      birthDate: users.birthDate,
      preferredAgeMin: users.preferredAgeMin,
      preferredAgeMax: users.preferredAgeMax,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    }).from(users),
    db.select({
      userId: nearbyProfileVisibility.userId,
      status: nearbyProfileVisibility.status,
      latitude: nearbyProfileVisibility.latitude,
      longitude: nearbyProfileVisibility.longitude,
      radiusKm: nearbyProfileVisibility.radiusKm,
      updatedAt: nearbyProfileVisibility.updatedAt,
      expiresAt: nearbyProfileVisibility.expiresAt,
    }).from(nearbyProfileVisibility),
    db.select({
      userId: blockedUsers.userId,
      blockedUserId: blockedUsers.blockedUserId,
      createdAt: blockedUsers.createdAt,
    }).from(blockedUsers),
  ]);

  return buildNearbyAdminDiagnostics({
    checkedAt,
    users: userRows,
    visibilities: visibilityRows,
    blocks: blockRows,
  });
}

export async function listNearbyFeedRows(
  viewerUserId: string,
  lat: number,
  lng: number,
  radiusMeters: number,
  limit: number,
): Promise<NearbyFeedRow[]> {
  const now = new Date();
  const distance = haversineDistanceMeters(lat, lng);

  return db
    .select({
      id: nearbyStatuses.id,
      authorUserId: nearbyStatuses.authorUserId,
      text: nearbyStatuses.text,
      distanceMeters: distance,
      createdAt: nearbyStatuses.createdAt,
      expiresAt: nearbyStatuses.expiresAt,
      author: {
        id: users.id,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
      },
    })
    .from(nearbyStatuses)
    .innerJoin(users, eq(users.id, nearbyStatuses.authorUserId))
    .leftJoin(
      blockedUsers,
      and(
        eq(blockedUsers.userId, viewerUserId),
        eq(blockedUsers.blockedUserId, nearbyStatuses.authorUserId),
      ),
    )
    .where(
      and(
        gt(nearbyStatuses.expiresAt, now),
        isNull(blockedUsers.blockedUserId),
        sql`${distance} <= ${radiusMeters}`,
        sql`${distance} <= ${nearbyStatuses.radiusMeters}`,
      ),
    )
    .orderBy(sql`${distance}`, desc(nearbyStatuses.createdAt), desc(nearbyStatuses.id))
    .limit(limit);
}

export async function deleteOwnedNearbyStatus(
  statusId: string,
  authorUserId: string,
): Promise<boolean> {
  const [deleted] = await db
    .delete(nearbyStatuses)
    .where(and(eq(nearbyStatuses.id, statusId), eq(nearbyStatuses.authorUserId, authorUserId)))
    .returning({ id: nearbyStatuses.id });

  return Boolean(deleted);
}

type NearbyAdminUserSnapshot = Pick<
  UserRow,
  | "id"
  | "amoriaId"
  | "displayName"
  | "email"
  | "avatarUrl"
  | "gender"
  | "preferredGenders"
  | "birthDate"
  | "preferredAgeMin"
  | "preferredAgeMax"
  | "createdAt"
  | "updatedAt"
>;

type NearbyAdminVisibilitySnapshot = Pick<
  NearbyProfileVisibilityRow,
  | "userId"
  | "status"
  | "latitude"
  | "longitude"
  | "radiusKm"
  | "updatedAt"
  | "expiresAt"
>;

type NearbyAdminDiagnosticsInput = {
  checkedAt: Date;
  users: NearbyAdminUserSnapshot[];
  visibilities: NearbyAdminVisibilitySnapshot[];
  blocks: Pick<BlockedUserRow, "userId" | "blockedUserId">[];
};

function buildNearbyAdminDiagnostics(
  input: NearbyAdminDiagnosticsInput,
): NearbyAdminDiagnostics {
  const recentSince = new Date(input.checkedAt.getTime() - 24 * 60 * 60 * 1000);
  const profileReadinessMissing: NearbyAdminDiagnostics["profileReadinessMissing"] = {
    missingBirthDate: 0,
    missingGender: 0,
    missingPreferredGenders: 0,
    missingAvatar: 0,
    missingDisplayName: 0,
  };
  const profileReadinessItems: NearbyAdminProfileReadinessItem[] = [];
  const feedExclusionReasons = emptyFeedExclusionCounts();
  const visibilityByUserId = new Map(input.visibilities.map((row) => [row.userId, row]));
  const userById = new Map(input.users.map((row) => [row.id, row]));
  const blockPairs = new Set(
    input.blocks.map((row) => `${row.userId}:${row.blockedUserId}`),
  );

  let activeVisibilityCount = 0;
  let offVisibilityCount = 0;
  let expiredVisibilityCount = 0;
  let recentlyUpdatedCount = 0;

  for (const visibility of input.visibilities) {
    const status = effectiveNearbyAdminVisibilityStatus(visibility, input.checkedAt);
    if (status === "active") {
      activeVisibilityCount += 1;
    } else if (status === "expired") {
      expiredVisibilityCount += 1;
    } else {
      offVisibilityCount += 1;
    }
    if (visibility.updatedAt >= recentSince) {
      recentlyUpdatedCount += 1;
    }
  }

  for (const user of input.users) {
    const missingReasons = getNearbyAdminProfileMissingReasons(user);
    if (missingReasons.includes("missing_birth_date")) {
      profileReadinessMissing.missingBirthDate += 1;
    }
    if (missingReasons.includes("missing_gender")) {
      profileReadinessMissing.missingGender += 1;
    }
    if (missingReasons.includes("missing_preferred_genders")) {
      profileReadinessMissing.missingPreferredGenders += 1;
    }
    if (missingReasons.includes("missing_avatar")) {
      profileReadinessMissing.missingAvatar += 1;
    }
    if (missingReasons.includes("missing_display_name")) {
      profileReadinessMissing.missingDisplayName += 1;
    }
    if (missingReasons.length) {
      const visibility = visibilityByUserId.get(user.id);
      profileReadinessItems.push({
        amoriaId: user.amoriaId,
        displayName: safeAdminDisplayName(user.displayName),
        emailMasked: maskEmail(user.email),
        missingReasons,
        visibilityStatus: visibility
          ? effectiveNearbyAdminVisibilityStatus(visibility, input.checkedAt)
          : "none",
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      });
    }
  }

  const activeViewers = input.visibilities.filter((visibility) =>
    isActiveNearbyAdminVisibility(visibility, input.checkedAt),
  );

  for (const viewerVisibility of activeViewers) {
    const viewer = userById.get(viewerVisibility.userId);
    if (!viewer) {
      continue;
    }

    for (const candidate of input.users) {
      const reason = getNearbyFeedExclusionReason({
        checkedAt: input.checkedAt,
        viewer,
        viewerVisibility,
        candidate,
        candidateVisibility: visibilityByUserId.get(candidate.id),
        blockPairs,
      });
      if (reason) {
        feedExclusionReasons[reason] += 1;
      }
    }
  }

  return {
    checkedAt: input.checkedAt,
    activeVisibilityCount,
    offVisibilityCount,
    expiredVisibilityCount,
    recentlyUpdatedCount,
    profileReadinessMissing,
    profileReadinessItems: profileReadinessItems
      .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())
      .slice(0, 200),
    feedExclusionReasons,
  };
}

function getNearbyAdminProfileMissingReasons(
  user: NearbyAdminUserSnapshot,
): NearbyAdminProfileMissingReason[] {
  const reasons: NearbyAdminProfileMissingReason[] = [];
  if (!user.birthDate) {
    reasons.push("missing_birth_date");
  }
  if (!toProfileGender(user.gender)) {
    reasons.push("missing_gender");
  }
  if (!Array.isArray(user.preferredGenders)) {
    reasons.push("missing_preferred_genders");
  }
  if (!hasText(user.avatarUrl)) {
    reasons.push("missing_avatar");
  }
  if (!hasText(user.displayName)) {
    reasons.push("missing_display_name");
  }
  return reasons;
}

function safeAdminDisplayName(value: string | null): string | null {
  const normalized = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!normalized) return null;
  if (/@|https?:\/\/|www\./i.test(normalized)) return null;
  return normalized.slice(0, 40);
}

function maskEmail(value: string | null): string | null {
  const normalized = String(value ?? "").trim();
  const match = /^([^@\s]+)@([^@\s]+)$/.exec(normalized);
  if (!match) return null;

  const [local, domain] = [match[1], match[2]];
  const first = local.slice(0, 1);
  return `${first || "*"}***@${domain}`;
}

type NearbyFeedExclusionInput = {
  checkedAt: Date;
  viewer: NearbyAdminUserSnapshot;
  viewerVisibility: NearbyAdminVisibilitySnapshot;
  candidate: NearbyAdminUserSnapshot;
  candidateVisibility: NearbyAdminVisibilitySnapshot | undefined;
  blockPairs: Set<string>;
};

function getNearbyFeedExclusionReason(
  input: NearbyFeedExclusionInput,
): NearbyAdminFeedExclusionReason | null {
  if (input.viewer.id === input.candidate.id) {
    return "self";
  }

  if (
    input.blockPairs.has(`${input.viewer.id}:${input.candidate.id}`) ||
    input.blockPairs.has(`${input.candidate.id}:${input.viewer.id}`)
  ) {
    return "blocked";
  }

  if (!input.candidateVisibility) {
    return "visibility_off";
  }

  const candidateStatus = effectiveNearbyAdminVisibilityStatus(
    input.candidateVisibility,
    input.checkedAt,
  );
  if (candidateStatus === "off") {
    return "visibility_off";
  }
  if (candidateStatus === "expired") {
    return "visibility_expired";
  }

  if (!isValidPreferredGenders(input.viewer.preferredGenders) ||
      !isValidPreferredGenders(input.candidate.preferredGenders)) {
    return "missing_preferred_genders";
  }

  if (isTooFarForNearbyFeed(input.viewerVisibility, input.candidateVisibility)) {
    return "distance_too_far";
  }

  if (!input.viewer.birthDate || !input.candidate.birthDate) {
    return "missing_birth_date";
  }

  if (!isMutuallyAgeCompatible(input.viewer, input.candidate, input.checkedAt)) {
    return "age_mismatch";
  }

  if (!isMutuallyGenderCompatible(input.viewer, input.candidate)) {
    if (!toProfileGender(input.viewer.gender) || !toProfileGender(input.candidate.gender)) {
      return "missing_gender";
    }
    return "gender_mismatch";
  }

  return null;
}

function effectiveNearbyAdminVisibilityStatus(
  visibility: NearbyAdminVisibilitySnapshot,
  checkedAt: Date,
): "active" | "off" | "expired" {
  if (visibility.status === "active") {
    return visibility.expiresAt && visibility.expiresAt > checkedAt ? "active" : "expired";
  }

  if (visibility.status === "expired") {
    return "expired";
  }

  return "off";
}

function isActiveNearbyAdminVisibility(
  visibility: NearbyAdminVisibilitySnapshot,
  checkedAt: Date,
): visibility is NearbyAdminVisibilitySnapshot & {
  latitude: number;
  longitude: number;
  radiusKm: number;
  expiresAt: Date;
} {
  return (
    effectiveNearbyAdminVisibilityStatus(visibility, checkedAt) === "active" &&
    typeof visibility.latitude === "number" &&
    typeof visibility.longitude === "number" &&
    typeof visibility.radiusKm === "number" &&
    Boolean(visibility.expiresAt)
  );
}

function isTooFarForNearbyFeed(
  viewerVisibility: NearbyAdminVisibilitySnapshot,
  candidateVisibility: NearbyAdminVisibilitySnapshot,
): boolean {
  if (
    typeof viewerVisibility.latitude !== "number" ||
    typeof viewerVisibility.longitude !== "number" ||
    typeof viewerVisibility.radiusKm !== "number" ||
    typeof candidateVisibility.latitude !== "number" ||
    typeof candidateVisibility.longitude !== "number" ||
    typeof candidateVisibility.radiusKm !== "number"
  ) {
    return true;
  }

  const distanceKm = approximateDistanceKm(
    viewerVisibility.latitude,
    viewerVisibility.longitude,
    candidateVisibility.latitude,
    candidateVisibility.longitude,
  );
  return distanceKm > viewerVisibility.radiusKm || distanceKm > candidateVisibility.radiusKm;
}

function isMutuallyAgeCompatible(
  viewer: NearbyAdminUserSnapshot,
  candidate: NearbyAdminUserSnapshot,
  checkedAt: Date,
): boolean {
  const viewerAge = calculateAge(viewer.birthDate, checkedAt);
  const candidateAge = calculateAge(candidate.birthDate, checkedAt);
  return (
    isAgeInsidePreferredRange(candidateAge, {
      min: viewer.preferredAgeMin,
      max: viewer.preferredAgeMax,
    }) &&
    isAgeInsidePreferredRange(viewerAge, {
      min: candidate.preferredAgeMin,
      max: candidate.preferredAgeMax,
    })
  );
}

function isMutuallyGenderCompatible(
  viewer: NearbyAdminUserSnapshot,
  candidate: NearbyAdminUserSnapshot,
): boolean {
  return (
    genderAllowed(toProfileGender(candidate.gender), viewer.preferredGenders) &&
    genderAllowed(toProfileGender(viewer.gender), candidate.preferredGenders)
  );
}

function genderAllowed(
  gender: ProfileGender | null,
  preferredGenders: ProfileGender[],
): boolean {
  return preferredGenders.length === 0 || (gender !== null && preferredGenders.includes(gender));
}

function toProfileGender(value: string | null): ProfileGender | null {
  return PROFILE_GENDERS.includes(value as ProfileGender) ? value as ProfileGender : null;
}

function isValidPreferredGenders(value: unknown): value is ProfileGender[] {
  return Array.isArray(value);
}

function hasText(value: string | null): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function emptyFeedExclusionCounts(): Record<NearbyAdminFeedExclusionReason, number> {
  return Object.fromEntries(
    nearbyAdminFeedExclusionReasons.map((reason) => [reason, 0]),
  ) as Record<NearbyAdminFeedExclusionReason, number>;
}

function approximateDistanceKm(
  latA: number,
  lngA: number,
  latB: number,
  lngB: number,
): number {
  const earthRadiusKm = 6371;
  const dLat = toRadians(latB - latA);
  const dLng = toRadians(lngB - lngA);
  const startLat = toRadians(latA);
  const endLat = toRadians(latB);
  const haversine =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(startLat) * Math.cos(endLat) * Math.sin(dLng / 2) ** 2;
  return earthRadiusKm * 2 * Math.asin(Math.min(1, Math.sqrt(haversine)));
}

export function __isWithinNearbyRadiusForTests(
  latA: number,
  lngA: number,
  latB: number,
  lngB: number,
  radiusKm: number,
): boolean {
  return approximateDistanceKm(latA, lngA, latB, lngB) <= radiusKm;
}

function toRadians(value: number): number {
  return value * (Math.PI / 180);
}

function haversineDistanceMeters(lat: number, lng: number) {
  return sql<number>`(
    6371000 * 2 * asin(least(1, sqrt(
      pow(sin(radians(${nearbyStatuses.lat} - ${lat}) / 2), 2) +
      cos(radians(${lat})) * cos(radians(${nearbyStatuses.lat})) *
      pow(sin(radians(${nearbyStatuses.lng} - ${lng}) / 2), 2)
    )))
  )`;
}

function haversineDistanceKm(lat: number, lng: number) {
  return sql<number>`(
    6371 * 2 * asin(least(1, sqrt(
      pow(sin(radians(${nearbyProfileVisibility.latitude} - ${lat}) / 2), 2) +
      cos(radians(${lat})) * cos(radians(${nearbyProfileVisibility.latitude})) *
      pow(sin(radians(${nearbyProfileVisibility.longitude} - ${lng}) / 2), 2)
    )))
  )`;
}
