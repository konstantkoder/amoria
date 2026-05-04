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

export type OkResponse = {
  ok: true;
};
