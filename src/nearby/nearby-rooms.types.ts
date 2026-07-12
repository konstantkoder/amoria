import type { NEARBY_ROOM_TYPE_KEYS } from "../config/constants";

export type NearbyRoomTypeKey = (typeof NEARBY_ROOM_TYPE_KEYS)[number];

export type NearbyRoomCardDto = {
  id: string;
  typeKey: string;
  title: string;
  geoBucket: string;
  locationLabel: string | null;
  startsAt: string | null;
  memberCount: number;
  status: string;
  canJoin: boolean;
  canOpen: boolean;
  threadId: string | null;
};

export type NearbyRoomsResponse = {
  items: NearbyRoomCardDto[];
  nextCursor: null;
};

export type NearbyRoomActionResponse = {
  room: NearbyRoomCardDto;
};

export type AdminNearbyRoomTypeDto = {
  key: string;
  title: string;
  status: string;
  adminApproved: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type AdminNearbyRoomDto = {
  id: string;
  typeKey: string;
  title: string | null;
  description: string | null;
  locationLabel: string | null;
  startsAt: string | null;
  endsAt: string | null;
  expiresAt: string | null;
  createdFromDemandSnapshot: AdminNearbyRoomDemandSnapshotDto | null;
  roomType: AdminNearbyRoomTypeDto;
  status: string;
  geoBucket: string;
  memberCount: number;
  threadId: string | null;
  createdByAdminUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminNearbyRoomDemandSnapshotDto = {
  activityKey: string;
  geoBucket: string;
  interestedUsersCount: number;
  activeNearbyUsersCount: number;
  recentlyUpdatedUsersCount: number;
  capturedAt: string;
};

export type AdminNearbyRoomTypesResponse = {
  items: AdminNearbyRoomTypeDto[];
  nextCursor: null;
};

export type AdminCreateNearbyRoomTypeBody = {
  key: string;
  title: string;
};

export type AdminNearbyRoomTypeDetailResponse = {
  roomType: AdminNearbyRoomTypeDto;
};

export type AdminNearbyRoomsResponse = {
  items: AdminNearbyRoomDto[];
  nextCursor: null;
};

export type AdminNearbyRoomsQuery = {
  includeArchived: boolean;
};

export type AdminNearbyRoomDetailResponse = {
  room: AdminNearbyRoomDto;
};

export type AdminCreateNearbyRoomBody = {
  typeKey: string;
  geoBucket: string;
  title?: string;
  description?: string;
  locationLabel?: string;
  startsAt?: string;
  endsAt?: string;
  expiresAt?: string;
};

export type AdminCreateNearbyRoomFromDemandBody = {
  activityKey: string;
  geoBucket: string;
  title?: string;
  description?: string;
  locationLabel?: string;
  startsAt?: string;
  endsAt?: string;
  expiresAt?: string;
};

export type AdminNearbyRoomAction = "close" | "disable" | "reopen" | "archive" | "delete";

export type AdminNearbyRoomActionBody = {
  action: AdminNearbyRoomAction;
};
