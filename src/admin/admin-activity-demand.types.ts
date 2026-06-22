import type { NearbyActivityKey } from "../config/constants";

export type AdminNearbyActivityDemandGeoBucketDto = {
  geoBucket: string;
  interestedUsersCount: number;
};

export type AdminNearbyActivityDemandRowDto = {
  activityKey: NearbyActivityKey;
  activityTitle: string;
  interestedUsersCount: number;
  activeNearbyUsersCount: number;
  recentlyUpdatedUsersCount: number;
  geoBuckets: AdminNearbyActivityDemandGeoBucketDto[];
  existingActiveRoomCount: number;
  lastUpdatedAt: string | null;
};

export type AdminNearbyActivityDemandResponse = {
  items: AdminNearbyActivityDemandRowDto[];
  nextCursor: null;
};
