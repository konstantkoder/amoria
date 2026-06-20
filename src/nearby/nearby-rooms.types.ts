import type { NEARBY_ROOM_TYPE_KEYS } from "../config/constants";

export type NearbyRoomTypeKey = (typeof NEARBY_ROOM_TYPE_KEYS)[number];

export type NearbyRoomCardDto = {
  id: string;
  typeKey: string;
  title: string;
  geoBucket: string;
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
  roomType: AdminNearbyRoomTypeDto;
  status: string;
  geoBucket: string;
  memberCount: number;
  threadId: string | null;
  createdByAdminUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminNearbyRoomTypesResponse = {
  items: AdminNearbyRoomTypeDto[];
  nextCursor: null;
};

export type AdminNearbyRoomsResponse = {
  items: AdminNearbyRoomDto[];
  nextCursor: null;
};

export type AdminNearbyRoomDetailResponse = {
  room: AdminNearbyRoomDto;
};

export type AdminCreateNearbyRoomBody = {
  typeKey: string;
  geoBucket: string;
};

export type AdminNearbyRoomAction = "close" | "disable" | "reopen";

export type AdminNearbyRoomActionBody = {
  action: AdminNearbyRoomAction;
};
