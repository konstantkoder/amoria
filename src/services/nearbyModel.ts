import type { NearbyStatusDto } from "@/services/api/types";
import { normalizePublicMediaUrl } from "@/services/media/mediaUrl";

export type NowMood = "chill" | "talk" | "drink" | "walk" | "fun" | "other";
export type NowPostStatus = "active" | "expired" | "deleted";

export type NowPost = {
  id: string;
  authorUid: string;
  authorName?: string;
  authorAvatarUrl?: string;
  text: string;
  mood: NowMood;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  status: NowPostStatus;
  distanceMeters?: number;
};

export const NEARBY_STATUS_TTL_MS = 2 * 60 * 60 * 1000;

function normalizeSharedMediaUrl(value: unknown) {
  return normalizePublicMediaUrl(value, "nearby media URL") ?? "";
}

function readTimestamp(value: unknown, fallback = Date.now()) {
  const timestamp = Date.parse(String(value ?? ""));
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : fallback;
}

export function mapNearbyStatusDtoToNowPost(dto: NearbyStatusDto): NowPost | null {
  const id = String(dto?.id ?? "").trim();
  const authorUid = String(dto?.author?.id ?? "").trim();
  const text = String(dto?.text ?? "").trim();
  if (!id || !authorUid || !text) return null;

  const authorName = String(dto.author.displayName ?? "").trim();
  const avatarUrl = normalizeSharedMediaUrl(dto.author.avatarUrl);
  const createdAt = readTimestamp(dto.createdAt);
  const expiresAt = readTimestamp(dto.expiresAt, createdAt + NEARBY_STATUS_TTL_MS);
  const distanceMeters = Number(dto.distanceMeters);

  return {
    id,
    authorUid,
    ...(authorName ? { authorName } : {}),
    ...(avatarUrl ? { authorAvatarUrl: avatarUrl } : {}),
    text,
    mood: "other",
    createdAt,
    updatedAt: createdAt,
    expiresAt,
    status: "active",
    ...(Number.isFinite(distanceMeters) ? { distanceMeters } : {}),
  };
}

export function mapNearbyStatusDtosToNowPosts(
  items: NearbyStatusDto[] = []
): NowPost[] {
  return items
    .map(mapNearbyStatusDtoToNowPost)
    .filter((item): item is NowPost => Boolean(item));
}
