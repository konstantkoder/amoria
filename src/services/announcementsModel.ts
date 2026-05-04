import type { AnnouncementDto } from "@/services/api/types";

export type NearbyAnnouncementCategory =
  | "walk"
  | "trip"
  | "coffee"
  | "activity"
  | "sport"
  | "ride";

export type NearbyAnnouncementStatus = "active" | "closed" | "deleted" | "under_review";

export type NearbyAnnouncement = {
  id: string;
  title: string;
  description: string;
  category: NearbyAnnouncementCategory;
  placeLabel: string;
  proximityLabel?: string;
  authorLabel: string;
  authorName?: string;
  authorAvatarUrl?: string;
  authorUid: string;
  createdAt: number;
  updatedAt: number;
  status: NearbyAnnouncementStatus;
  responseCount: number;
  lastResponseAt?: number;
  hasPhoto: boolean;
  photoUrl?: string;
  photoUri?: string;
  isMine?: boolean;
  hasResponded?: boolean;
};

export const NEARBY_ANNOUNCEMENT_CATEGORY_ORDER: NearbyAnnouncementCategory[] = [
  "walk",
  "coffee",
  "trip",
  "activity",
  "sport",
  "ride",
];

function isCategory(value: unknown): value is NearbyAnnouncementCategory {
  return NEARBY_ANNOUNCEMENT_CATEGORY_ORDER.includes(
    value as NearbyAnnouncementCategory
  );
}

function normalizeStatus(value: unknown): NearbyAnnouncementStatus {
  if (value === "closed" || value === "deleted" || value === "under_review") return value;
  return "active";
}

function normalizeSharedMediaUrl(value: unknown) {
  const url = String(value ?? "").trim();
  return url.startsWith("https://") || url.startsWith("http://") ? url : "";
}

function readTimestamp(value: unknown, fallback = Date.now()) {
  const timestamp = Date.parse(String(value ?? ""));
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : fallback;
}

export function mapAnnouncementDtoToNearbyAnnouncement(
  dto: AnnouncementDto
): NearbyAnnouncement | null {
  const id = String(dto?.id ?? "").trim();
  const title = String(dto?.title ?? "").trim();
  const description = String(dto?.description ?? "").trim();
  const authorUid = String(dto?.author?.id ?? "").trim();
  if (!id || !title || !description || !authorUid) return null;

  const authorName = String(dto.author.displayName ?? "").trim();
  const authorAvatarUrl = normalizeSharedMediaUrl(dto.author.avatarUrl);
  const photoUrl = normalizeSharedMediaUrl(dto.photoUrl);
  const createdAt = readTimestamp(dto.createdAt);
  const updatedAt = readTimestamp(dto.updatedAt, createdAt);
  const responseCount = Math.max(Number(dto.responseCount ?? 0), 0);

  return {
    id,
    title,
    description,
    category: isCategory(dto.category) ? dto.category : "activity",
    placeLabel: String(dto.placeLabel ?? "").trim(),
    authorLabel: authorName || "profile.amoriaUser",
    ...(authorName ? { authorName } : {}),
    ...(authorAvatarUrl ? { authorAvatarUrl } : {}),
    authorUid,
    createdAt,
    updatedAt,
    status: normalizeStatus(dto.status),
    responseCount: Number.isFinite(responseCount) ? responseCount : 0,
    hasPhoto: Boolean(photoUrl),
    ...(photoUrl ? { photoUrl, photoUri: photoUrl } : {}),
    ...(typeof dto.isMine === "boolean" ? { isMine: dto.isMine } : {}),
    ...(typeof dto.hasResponded === "boolean"
      ? { hasResponded: dto.hasResponded }
      : {}),
  };
}

export function mapAnnouncementDtosToNearbyAnnouncements(
  items: AnnouncementDto[] = []
): NearbyAnnouncement[] {
  return items
    .map(mapAnnouncementDtoToNearbyAnnouncement)
    .filter((item): item is NearbyAnnouncement => Boolean(item));
}
