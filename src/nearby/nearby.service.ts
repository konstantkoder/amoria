import { AppError } from "../common/errors";
import * as nearbyRepo from "./nearby.repo";
import type {
  CreateNearbyStatusBody,
  CreateNearbyStatusResponse,
  NearbyFeedQuery,
  NearbyFeedResponse,
  OkResponse,
} from "./nearby.types";

const NEARBY_STATUS_MIN_RADIUS_METERS = 200;
const NEARBY_STATUS_MAX_RADIUS_METERS = 10000;
const NEARBY_STATUS_MIN_EXPIRES_IN_SEC = 60;
const NEARBY_STATUS_MAX_EXPIRES_IN_SEC = 7200;

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
  const expiresAt = new Date(Date.now() + expiresInSec * 1000);

  const status = await nearbyRepo.createNearbyStatus({
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
  const rows = await nearbyRepo.listNearbyFeedRows(
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

export async function deleteStatus(userId: string, statusId: string): Promise<OkResponse> {
  const deleted = await nearbyRepo.deleteOwnedNearbyStatus(statusId, userId);
  if (!deleted) {
    throw new AppError("not_found", "Nearby status not found", 404);
  }

  return { ok: true };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
