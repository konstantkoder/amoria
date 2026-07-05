import { AppError, unauthorized } from "../common/errors";
import { PROFILE_GENDERS } from "../config/constants";
import type { ProfileGender, UserRow } from "../db/schema";
import * as usersRepo from "../users/users.repo";
import * as usersService from "../users/users.service";
import {
  calculateAge,
  getAgeGroup,
  isAgeInsidePreferredRange,
} from "../users/age";
import * as nearbyRepo from "./nearby.repo";
import type {
  CreateNearbyStatusBody,
  CreateNearbyStatusResponse,
  NearbyFeedQuery,
  NearbyFeedResponse,
  NearbyMeResponse,
  NearbyProfileDistanceBucket,
  NearbyProfileFeedItemDto,
  NearbyProfileFeedQuery,
  NearbyProfileFeedResponse,
  NearbyProfileStatusKind,
  NearbySummaryResponse,
  NearbyProfileVisibilityDto,
  PatchNearbyProfileStatusBody,
  OkResponse,
  UpdateNearbyVisibilityBody,
} from "./nearby.types";

const NEARBY_STATUS_MIN_RADIUS_METERS = 200;
const NEARBY_STATUS_MAX_RADIUS_METERS = 10000;
const NEARBY_STATUS_MIN_EXPIRES_IN_SEC = 60;
const NEARBY_STATUS_MAX_EXPIRES_IN_SEC = 7200;
const NEARBY_PROFILE_DEFAULT_EXPIRES_IN_SEC = 4 * 60 * 60;
const NEARBY_PROFILE_PUBLIC_PHOTO_PREVIEW_LIMIT = 3;
const NEARBY_PROFILE_FEED_PREFILTER_MULTIPLIER = 4;
const NEARBY_PROFILE_FEED_PREFILTER_LIMIT = 100;

type NearbyServiceDeps = {
  repo: Pick<
    typeof nearbyRepo,
    | "createNearbyStatus"
    | "deleteOwnedNearbyStatus"
    | "findNearbyProfileVisibility"
    | "getNearbySummaryCounts"
    | "listNearbyFeedRows"
    | "listNearbyProfileFeedRows"
    | "upsertNearbyProfileVisibility"
  >;
  usersRepo: Pick<typeof usersRepo, "findUserById">;
  toPublicUserProfile: typeof usersService.toPublicUserProfile;
  now: () => Date;
};

const defaultDeps: NearbyServiceDeps = {
  repo: nearbyRepo,
  usersRepo,
  toPublicUserProfile: usersService.toPublicUserProfile,
  now: () => new Date(),
};

let deps: NearbyServiceDeps = defaultDeps;

export function __setNearbyServiceDepsForTests(
  overrides: Partial<NearbyServiceDeps>,
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

export async function createStatus(
  authorUserId: string,
  input: CreateNearbyStatusBody,
): Promise<CreateNearbyStatusResponse> {
  const radiusMeters = clamp(
    input.visibilityRadiusMeters,
    NEARBY_STATUS_MIN_RADIUS_METERS,
    NEARBY_STATUS_MAX_RADIUS_METERS,
  );
  const expiresInSec = clamp(
    input.expiresInSec,
    NEARBY_STATUS_MIN_EXPIRES_IN_SEC,
    NEARBY_STATUS_MAX_EXPIRES_IN_SEC,
  );
  const expiresAt = new Date(deps.now().getTime() + expiresInSec * 1000);

  const status = await deps.repo.createNearbyStatus({
    authorUserId,
    text: input.text,
    lat: input.lat,
    lng: input.lng,
    radiusMeters,
    expiresAt,
  });

  return {
    status: {
      id: status.id,
      text: status.text,
      createdAt: status.createdAt.toISOString(),
      expiresAt: status.expiresAt.toISOString(),
    },
  };
}

export async function getFeed(userId: string, query: NearbyFeedQuery): Promise<NearbyFeedResponse> {
  const radiusMeters = clamp(
    query.radiusMeters,
    NEARBY_STATUS_MIN_RADIUS_METERS,
    NEARBY_STATUS_MAX_RADIUS_METERS,
  );
  const rows = await deps.repo.listNearbyFeedRows(
    userId,
    query.lat,
    query.lng,
    radiusMeters,
    query.limit,
  );

  return {
    items: rows.map((row) => ({
      id: row.id,
      author: row.author,
      text: row.text,
      distanceMeters: Math.round(Number(row.distanceMeters)),
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
    })),
    nextCursor: null,
  };
}

export async function getNearbyMe(userId: string): Promise<NearbyMeResponse> {
  const row = await deps.repo.findNearbyProfileVisibility(userId);
  return {
    visibility: toVisibilityDto(row),
  };
}

export async function getNearbySummary(_userId: string): Promise<NearbySummaryResponse> {
  const checkedAt = deps.now();
  const counts = await deps.repo.getNearbySummaryCounts(checkedAt);

  return {
    totalUsersCount: counts.totalUsersCount,
    onlineNowCount: counts.onlineNowCount,
    activeNearbyCount: counts.activeNearbyCount,
    checkedAt: checkedAt.toISOString(),
  };
}

export async function updateNearbyVisibility(
  userId: string,
  input: UpdateNearbyVisibilityBody,
): Promise<NearbyMeResponse> {
  const now = deps.now();
  const row = await deps.repo.upsertNearbyProfileVisibility(
    input.enabled
      ? {
          userId,
          status: "active",
          latitude: requireNumber(input.latitude),
          longitude: requireNumber(input.longitude),
          radiusKm: requireNumber(input.radiusKm),
          nearbyStatus: normalizeNearbyStatus(input.nearbyStatus),
          statusKind: input.statusKind ?? null,
          updatedAt: now,
          expiresAt: expiresAtFromNow(now, input.expiresInSec),
        }
      : {
          userId,
          status: "off",
          latitude: null,
          longitude: null,
          radiusKm: null,
          nearbyStatus: null,
          statusKind: null,
          updatedAt: now,
          expiresAt: null,
        },
  );

  return {
    visibility: toVisibilityDto(row),
  };
}

export async function patchNearbyProfileStatus(
  userId: string,
  input: PatchNearbyProfileStatusBody,
): Promise<NearbyMeResponse> {
  const now = deps.now();
  const current = await deps.repo.findNearbyProfileVisibility(userId);
  const currentStatus = effectiveVisibilityStatus(current);
  const row = await deps.repo.upsertNearbyProfileVisibility({
    userId,
    status: currentStatus,
    latitude: current?.latitude ?? null,
    longitude: current?.longitude ?? null,
    radiusKm: current?.radiusKm ?? null,
    nearbyStatus: "nearbyStatus" in input
      ? normalizeNearbyStatus(input.nearbyStatus)
      : current?.nearbyStatus ?? null,
    statusKind: "statusKind" in input ? input.statusKind ?? null : current?.statusKind ?? null,
    updatedAt: now,
    expiresAt: input.expiresInSec && currentStatus === "active"
      ? expiresAtFromNow(now, input.expiresInSec)
      : current?.expiresAt ?? null,
  });

  return {
    visibility: toVisibilityDto(row),
  };
}

export async function getProfileFeed(
  userId: string,
  query: NearbyProfileFeedQuery,
): Promise<NearbyProfileFeedResponse> {
  const [viewer, visibility] = await Promise.all([
    deps.usersRepo.findUserById(userId),
    deps.repo.findNearbyProfileVisibility(userId),
  ]);
  if (!viewer) {
    throw unauthorized("User no longer exists");
  }
  if (!isActiveVisibilityForFeed(visibility)) {
    return { items: [], nextCursor: null };
  }

  const rows = await deps.repo.listNearbyProfileFeedRows(
    userId,
    visibility.latitude,
    visibility.longitude,
    visibility.radiusKm,
    Math.min(
      NEARBY_PROFILE_FEED_PREFILTER_LIMIT,
      query.limit * NEARBY_PROFILE_FEED_PREFILTER_MULTIPLIER,
    ),
  );

  const items: NearbyProfileFeedResponse["items"] = [];
  for (const row of rows) {
    if (!isMutuallyAgeCompatible(viewer, row.user)) {
      continue;
    }
    if (!isMutuallyGenderCompatible(viewer, row.user)) {
      continue;
    }

    const profile = await deps.toPublicUserProfile(row.user);
    items.push(toNearbyProfileFeedItem(row, profile));

    if (items.length >= query.limit) {
      break;
    }
  }

  return {
    items,
    nextCursor: null,
  };
}

export async function deleteStatus(userId: string, statusId: string): Promise<OkResponse> {
  const deleted = await deps.repo.deleteOwnedNearbyStatus(statusId, userId);
  if (!deleted) {
    throw new AppError("not_found", "Nearby status not found", 404);
  }

  return { ok: true };
}

export function __toNearbyProfileFeedItemForTests(
  row: nearbyRepo.NearbyProfileFeedRow,
  profile: usersService.PublicUserProfile,
): NearbyProfileFeedItemDto {
  return toNearbyProfileFeedItem(row, profile);
}

function toNearbyProfileFeedItem(
  row: nearbyRepo.NearbyProfileFeedRow,
  profile: usersService.PublicUserProfile,
): NearbyProfileFeedItemDto {
  return {
    userId: profile.id,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl,
    age: toNearbyProfileAge(row.user.birthDate),
    ageGroup: profile.ageGroup,
    distanceBucket: toDistanceBucket(row.distanceKm),
    goal: profile.goal,
    mood: profile.mood,
    interests: profile.interests,
    publicPhotos: profile.photos
      .slice(0, NEARBY_PROFILE_PUBLIC_PHOTO_PREVIEW_LIMIT)
      .map((photo) => ({
        mediaId: photo.mediaId,
        url: photo.url,
      })),
    nearbyStatus: row.visibility.nearbyStatus,
    statusKind: row.visibility.statusKind as NearbyProfileStatusKind | null,
    canMessage: true,
  };
}

function toNearbyProfileAge(birthDate: string | null | undefined): number | null {
  const age = calculateAge(birthDate, deps.now());
  return typeof age === "number" && Number.isFinite(age) && age >= 0 ? age : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function toVisibilityDto(
  row: Awaited<ReturnType<typeof nearbyRepo.findNearbyProfileVisibility>>,
): NearbyProfileVisibilityDto {
  if (!row) {
    return {
      status: "off",
      radiusKm: null,
      nearbyStatus: null,
      statusKind: null,
      updatedAt: null,
      expiresAt: null,
    };
  }

  return {
    status: effectiveVisibilityStatus(row),
    radiusKm: row.radiusKm,
    nearbyStatus: row.nearbyStatus,
    statusKind: row.statusKind as NearbyProfileStatusKind | null,
    updatedAt: row.updatedAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
  };
}

function effectiveVisibilityStatus(
  row: Awaited<ReturnType<typeof nearbyRepo.findNearbyProfileVisibility>>,
): NearbyProfileVisibilityDto["status"] {
  if (!row) {
    return "off";
  }

  if (row.status === "active" && (!row.expiresAt || row.expiresAt <= deps.now())) {
    return "expired";
  }

  return row.status as NearbyProfileVisibilityDto["status"];
}

function isActiveVisibilityForFeed(
  row: Awaited<ReturnType<typeof nearbyRepo.findNearbyProfileVisibility>>,
): row is NonNullable<Awaited<ReturnType<typeof nearbyRepo.findNearbyProfileVisibility>>> & {
  latitude: number;
  longitude: number;
  radiusKm: number;
  expiresAt: Date;
} {
  return Boolean(
    row &&
      effectiveVisibilityStatus(row) === "active" &&
      typeof row.latitude === "number" &&
      typeof row.longitude === "number" &&
      typeof row.radiusKm === "number" &&
      row.expiresAt,
  );
}

function expiresAtFromNow(now: Date, expiresInSec?: number): Date {
  return new Date(
    now.getTime() + (expiresInSec ?? NEARBY_PROFILE_DEFAULT_EXPIRES_IN_SEC) * 1000,
  );
}

function normalizeNearbyStatus(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function requireNumber(value: number | undefined): number {
  if (typeof value !== "number") {
    throw new AppError("validation_error", "Nearby visibility location is incomplete", 400);
  }

  return value;
}

function isMutuallyAgeCompatible(viewer: UserRow, candidate: UserRow): boolean {
  const now = deps.now();
  const viewerAge = calculateAge(viewer.birthDate, now);
  const candidateAge = calculateAge(candidate.birthDate, now);
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

function isMutuallyGenderCompatible(viewer: UserRow, candidate: UserRow): boolean {
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

function toDistanceBucket(distanceKm: number): NearbyProfileDistanceBucket {
  if (distanceKm < 1) return "under_1km";
  if (distanceKm < 5) return "1_5km";
  if (distanceKm < 25) return "5_25km";
  if (distanceKm < 100) return "25_100km";
  return "over_100km";
}
