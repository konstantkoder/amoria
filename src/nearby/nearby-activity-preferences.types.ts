import type {
  NearbyActivityCategory,
  NearbyActivityKey,
  UserActivityPreferenceSource,
  UserActivityPreferenceStatus,
} from "../config/constants";

export type NearbyActivityDto = {
  activityKey: NearbyActivityKey;
  title: string;
  category: NearbyActivityCategory;
  sortOrder: number;
};

export type NearbyActivityPreferenceInput = {
  activityKey: NearbyActivityKey;
  geoBucket?: string | null;
};

export type UpdateNearbyActivityPreferencesBody = {
  preferences: NearbyActivityPreferenceInput[];
};

export type NearbyActivityPreferenceDto = {
  activityKey: NearbyActivityKey;
  status: UserActivityPreferenceStatus;
  geoBucket: string | null;
  source: UserActivityPreferenceSource;
  updatedAt: string;
};

export type NearbyActivityPreferencesResponse = {
  availableActivities: NearbyActivityDto[];
  preferences: NearbyActivityPreferenceDto[];
};
