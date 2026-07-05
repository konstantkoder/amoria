export type CreateNearbyStatusBody = {
  text: string;
  lat: number;
  lng: number;
  visibilityRadiusMeters: number;
  expiresInSec: number;
};

export type NearbyFeedQuery = {
  lat: number;
  lng: number;
  radiusMeters: number;
  limit: number;
};

export type NearbyProfileVisibilityStatus = "active" | "off" | "expired";

export type NearbyProfileStatusKind =
  | "coffee"
  | "walk"
  | "bike"
  | "talk_now"
  | "open_to_suggestions";

export type NearbyProfileDistanceBucket =
  | "under_1km"
  | "1_5km"
  | "5_25km"
  | "25_100km"
  | "over_100km";

export type UpdateNearbyVisibilityBody = {
  enabled: boolean;
  latitude?: number;
  longitude?: number;
  radiusKm?: number;
  nearbyStatus?: string | null;
  statusKind?: NearbyProfileStatusKind | null;
  expiresInSec?: number;
};

export type PatchNearbyProfileStatusBody = {
  nearbyStatus?: string | null;
  statusKind?: NearbyProfileStatusKind | null;
  expiresInSec?: number;
};

export type NearbyProfileFeedQuery = {
  limit: number;
};

export type NearbyStatusCreateDto = {
  id: string;
  text: string;
  createdAt: string;
  expiresAt: string;
};

export type CreateNearbyStatusResponse = {
  status: NearbyStatusCreateDto;
};

export type NearbyStatusAuthorDto = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
};

export type NearbyStatusFeedDto = {
  id: string;
  author: NearbyStatusAuthorDto;
  text: string;
  distanceMeters: number;
  createdAt: string;
  expiresAt: string;
};

export type NearbyFeedResponse = {
  items: NearbyStatusFeedDto[];
  nextCursor: null;
};

export type NearbyProfileVisibilityDto = {
  status: NearbyProfileVisibilityStatus;
  radiusKm: number | null;
  nearbyStatus: string | null;
  statusKind: NearbyProfileStatusKind | null;
  updatedAt: string | null;
  expiresAt: string | null;
};

export type NearbyMeResponse = {
  visibility: NearbyProfileVisibilityDto;
};

export type NearbySummaryResponse = {
  totalUsersCount: number;
  onlineNowCount: number;
  activeNearbyCount: number;
  checkedAt: string;
};

export type NearbyProfilePhotoPreviewDto = {
  mediaId: string;
  url: string;
};

export type NearbyProfileFeedItemDto = {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  age: number | null;
  ageGroup: string | null;
  distanceBucket: NearbyProfileDistanceBucket;
  goal: string | null;
  mood: string | null;
  interests: string[];
  publicPhotos: NearbyProfilePhotoPreviewDto[];
  nearbyStatus: string | null;
  statusKind: NearbyProfileStatusKind | null;
  canMessage: boolean;
};

export type NearbyProfileFeedResponse = {
  items: NearbyProfileFeedItemDto[];
  nextCursor: null;
};

export type OkResponse = {
  ok: true;
};
