import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  DeviceEventEmitter,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Location from "expo-location";
import { useFocusEffect, useNavigation } from "@react-navigation/native";

import ScreenShell from "@/components/ScreenShell";
import { useLocale } from "@/contexts/LocaleContext";
import type { NearbyTabNavigationProp } from "@/navigation/appRoutes";
import { ApiError } from "@/services/api/apiClient";
import { reportClientError } from "@/services/api/clientErrorsApi";
import * as nearbyApi from "@/services/api/nearbyApi";
import type {
  AgeGroup,
  NearbyProfileFeedItemDto,
  NearbyProfileStatusKind,
  NearbyRoomCard,
  NearbySummaryResponse,
  NearbyProfileVisibilityDto,
} from "@/services/api/types";
import { setNearbyEnabled } from "@/services/locationPrivacy";
import {
  getPublicMediaUrlInfo,
  probePublicMediaUrlInfo,
  type PublicMediaUrlInfo,
} from "@/services/media/mediaUrl";
import { startStartupSpan } from "@/services/startupDiagnostics";
import {
  getMissingMatchingSafetyFields,
  getUserProfile,
  updateUserFields,
  type MatchingSafetyField,
} from "@/services/user";
import { PROFILE_UPDATED_EVENT } from "@/services/session/authEvents";
import type { ProfileGender, UserProfile } from "@/models/User";
import { theme } from "@/theme";

type LocationIssue = "permissionDenied" | "permissionBlocked" | "readFailed";
type GenderFilter = "all" | ProfileGender;
type AgeFilterId = "any" | AgeGroup;
type MissingNearbyPreferenceField = Extract<
  MatchingSafetyField,
  "gender" | "preferredGenders"
>;

const RADIUS_OPTIONS = [5, 25, 100, 250] as const;
const FEED_LIMIT = 30;
const DEFAULT_RADIUS_KM = 25;
const DEFAULT_STATUS_KIND: NearbyProfileStatusKind = "open_to_suggestions";
const ROOM_CARD_LIMIT = 4;

const GENDER_FILTERS: GenderFilter[] = ["all", "woman", "man", "nonbinary"];
const AGE_FILTER_OPTIONS: Array<{
  id: AgeFilterId;
  min: number;
  max: number | null;
}> = [
  { id: "any", min: 18, max: null },
  { id: "18-24", min: 18, max: 24 },
  { id: "25-34", min: 25, max: 34 },
  { id: "35-44", min: 35, max: 44 },
  { id: "45-54", min: 45, max: 54 },
  { id: "55+", min: 55, max: null },
];

function copyOrFallback(
  t: (key: string, params?: Record<string, string>) => string,
  key: string,
  fallback: string,
  params?: Record<string, string>
) {
  const value = t(key, params);
  if (value !== key) return value;
  return Object.entries(params ?? {}).reduce(
    (text, [paramKey, paramValue]) => text.replace(new RegExp(`\\{${paramKey}\\}`, "g"), paramValue),
    fallback
  );
}

function getLanguageCode(locale: string) {
  return locale.toLowerCase().split(/[-_]/)[0];
}

function getPeopleNearbyTitleFallback(locale: string) {
  const language = getLanguageCode(locale);
  if (language === "ru") return "Люди рядом";
  if (language === "hr") return "Ljudi u blizini";
  return "People nearby";
}

function getActivityConfigureFallback(locale: string) {
  const language = getLanguageCode(locale);
  if (language === "ru") return "Настроить";
  if (language === "hr") return "Postavi";
  return "Configure";
}

function getAgePreferenceLabel(
  profile: UserProfile | null,
  t: (key: string, params?: Record<string, string>) => string
) {
  const min = profile?.preferredAgeMin ?? 18;
  const max = profile?.preferredAgeMax ?? null;
  if (min <= 18 && max == null) {
    return copyOrFallback(t, "nearby.filterAgeAny", "Любой 18+");
  }
  if (max == null) {
    return copyOrFallback(t, "nearby.filterAgeOpen", "{min}+", {
      min: String(min),
    });
  }
  return copyOrFallback(t, "nearby.filterAgeRange", "{min}-{max}", {
    min: String(min),
    max: String(max),
  });
}

function getGenderFilter(profile: UserProfile | null): GenderFilter {
  const values = profile?.preferredGenders ?? [];
  return values.length === 1 ? values[0] : "all";
}

function getAgeFilter(profile: UserProfile | null): AgeFilterId {
  const min = profile?.preferredAgeMin ?? 18;
  const max = profile?.preferredAgeMax ?? null;
  return AGE_FILTER_OPTIONS.find((option) => option.min === min && option.max === max)?.id ?? "any";
}

function getAgeFilterLabel(
  id: AgeFilterId,
  t: (key: string, params?: Record<string, string>) => string
) {
  if (id === "any") {
    return copyOrFallback(t, "nearby.filterAgeAny", "Любой 18+");
  }
  return copyOrFallback(t, `nearby.age.${id}`, id);
}

function getMissingSafetyFieldLabels(
  fields: MatchingSafetyField[],
  t: (key: string, params?: Record<string, string>) => string
) {
  return fields.map((field) => {
    if (field === "birthDate") {
      return copyOrFallback(t, "profile.birthDateMissingBadge", "Birth date");
    }
    if (field === "gender") {
      return copyOrFallback(t, "profile.genderSummaryTitle", "Your gender");
    }
    return copyOrFallback(t, "profile.lookingForSummaryTitle", "Preferred genders");
  });
}

function getMissingSafetyFieldsBody(
  fields: MatchingSafetyField[],
  t: (key: string, params?: Record<string, string>) => string
) {
  const labels = getMissingSafetyFieldLabels(fields, t).join(", ");
  return copyOrFallback(
    t,
    "nearby.missingSafetyFieldsBody",
    "Required before matching: {fields}. Exact birth date is not shown to other people.",
    { fields: labels }
  );
}

function isProfileReady(profile: UserProfile | null) {
  return !getMissingMatchingSafetyFields(profile).includes("birthDate");
}

function getMissingNearbyPreferenceField(
  profile: UserProfile | null
): MissingNearbyPreferenceField | null {
  const missing = getMissingMatchingSafetyFields(profile);
  if (missing.includes("gender")) return "gender";
  if (missing.includes("preferredGenders")) return "preferredGenders";
  return null;
}

function getInitials(label?: string) {
  const parts = String(label ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "";
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

async function requestNearbyLocation(): Promise<
  | { ok: true; latitude: number; longitude: number }
  | { ok: false; issue: LocationIssue }
> {
  try {
    const current = await Location.getForegroundPermissionsAsync();
    const permission = current.granted
      ? current
      : await Location.requestForegroundPermissionsAsync();

    if (!permission.granted) {
      return {
        ok: false,
        issue: permission.canAskAgain === false ? "permissionBlocked" : "permissionDenied",
      };
    }

    const lastKnown = await Location.getLastKnownPositionAsync();
    const position = lastKnown ?? await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    const latitude = position.coords.latitude;
    const longitude = position.coords.longitude;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return { ok: false, issue: "readFailed" };
    }

    return { ok: true, latitude, longitude };
  } catch {
    return { ok: false, issue: "readFailed" };
  }
}

function getBackendErrorText(
  error: unknown,
  t: (key: string, params?: Record<string, string>) => string
) {
  if (error instanceof ApiError) {
    if (
      error.code === "profile_incomplete" ||
      error.fields?.birthDate ||
      error.fields?.profile
    ) {
      return copyOrFallback(
        t,
        "nearby.errorProfileSetup",
        "Заполните профиль, чтобы Рядом мог подобрать людей честно."
      );
    }
    return error.message;
  }
  return copyOrFallback(
    t,
    "nearby.errorGeneric",
    "Рядом временно недоступен. Попробуйте ещё раз."
  );
}

function isNearbyActivityPreferenceRequiredError(error: unknown) {
  return (
    error instanceof ApiError &&
    error.code === "nearby_activity_preference_required"
  );
}

export default function NearbyHubScreen() {
  const navigation = useNavigation<NearbyTabNavigationProp>();
  const { width } = useWindowDimensions();
  const { t, locale } = useLocale();
  const mountedRef = useRef(true);
  const visibilityRef = useRef<NearbyProfileVisibilityDto | null>(null);
  const radiusRef = useRef(DEFAULT_RADIUS_KM);
  const profileReadyRef = useRef(false);
  const matchingPreferencesReadyRef = useRef(false);
  const feedRequestIdRef = useRef(0);
  const radiusRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const manualRefreshBusyRef = useRef(false);
  const reportedMissingPreferenceRef = useRef<Set<MissingNearbyPreferenceField>>(new Set());
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [visibility, setVisibility] = useState<NearbyProfileVisibilityDto | null>(null);
  const [summary, setSummary] = useState<NearbySummaryResponse | null>(null);
  const [items, setItems] = useState<NearbyProfileFeedItemDto[]>([]);
  const [rooms, setRooms] = useState<NearbyRoomCard[]>([]);
  const [radiusKm, setRadiusKm] = useState(DEFAULT_RADIUS_KM);
  const [loading, setLoading] = useState(true);
  const [feedLoading, setFeedLoading] = useState(false);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [toggleBusy, setToggleBusy] = useState(false);
  const [preferenceBusy, setPreferenceBusy] = useState(false);
  const [roomActionBusyId, setRoomActionBusyId] = useState<string | null>(null);
  const [errorText, setErrorText] = useState("");
  const [roomErrorText, setRoomErrorText] = useState("");
  const [roomPreferenceGateVisible, setRoomPreferenceGateVisible] =
    useState(false);
  const [locationIssue, setLocationIssue] = useState<LocationIssue | null>(null);

  const active = visibility?.status === "active";
  const profileReady = isProfileReady(profile);
  const missingPreferenceField = getMissingNearbyPreferenceField(profile);
  const missingSafetyFields = loading ? [] : getMissingMatchingSafetyFields(profile);
  const matchingPreferencesReady = !missingPreferenceField;
  const genderFilter = getGenderFilter(profile);
  const ageFilter = getAgeFilter(profile);
  const screenHorizontalPadding = 14;
  const sectionGap = 14;
  const smallGap = 8;
  const gridGapSmall = 10;
  const gridGapMedium = 12;
  const cardRadius = 22;
  const cardInnerRadius = 18;
  const primaryColor = "#E8428A";
  const accentColor = "#F3C98B";
  const compactWidth = width <= 360;
  const wideWidth = width > 430;
  const columns = wideWidth ? 3 : 2;
  const peopleGridHorizontalPadding = compactWidth ? screenHorizontalPadding : 16;
  const gridGap = compactWidth ? gridGapSmall : wideWidth ? gridGapSmall : gridGapMedium;
  const peopleCardHeight = compactWidth ? 174 : wideWidth ? 172 : 190;
  const peopleAvatarSize = compactWidth ? 116 : wideWidth ? 112 : 132;
  const peopleCardWidth = Math.floor(
    Math.max(0, width - peopleGridHorizontalPadding * 2 - gridGap * (columns - 1)) / columns
  );
  const activityCardWidth = compactWidth ? 188 : wideWidth ? 220 : 204;
  const activityCardHeight = compactWidth ? 108 : wideWidth ? 112 : 110;
  const activityCardGap = wideWidth ? gridGapMedium : gridGapSmall;
  const firstPeopleCount = columns * 2;
  const refreshDisabled = feedLoading || roomsLoading || toggleBusy || preferenceBusy || Boolean(roomActionBusyId);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (radiusRefreshTimerRef.current) {
        clearTimeout(radiusRefreshTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    visibilityRef.current = visibility;
  }, [visibility]);

  useEffect(() => {
    radiusRef.current = radiusKm;
  }, [radiusKm]);

  useEffect(() => {
    profileReadyRef.current = profileReady;
  }, [profileReady]);

  useEffect(() => {
    matchingPreferencesReadyRef.current = matchingPreferencesReady;
  }, [matchingPreferencesReady]);

  useEffect(() => {
    if (!profileReady || !missingPreferenceField) return;
    if (reportedMissingPreferenceRef.current.has(missingPreferenceField)) return;
    reportedMissingPreferenceRef.current.add(missingPreferenceField);

    reportClientError({
      screen: "NearbyHubScreen",
      action: "profileCompletionRequired",
      step: "missingPreference",
      message: "Nearby profile preferences are incomplete",
      metadata: { missingField: missingPreferenceField },
    });
  }, [missingPreferenceField, profileReady]);

  const refreshSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const response = await nearbyApi.getNearbySummary();
      if (!mountedRef.current) return;
      setSummary(response);
    } catch {
      if (!mountedRef.current) return;
      setSummary(null);
    } finally {
      if (mountedRef.current) {
        setSummaryLoading(false);
      }
    }
  }, []);

  const refreshRooms = useCallback(async () => {
    setRoomsLoading(true);
    setRoomErrorText("");
    setRoomPreferenceGateVisible(false);
    try {
      const response = await nearbyApi.listNearbyRooms();
      if (!mountedRef.current) return;
      setRooms(response.items ?? []);
    } catch (error) {
      if (!mountedRef.current) return;
      setRooms([]);
      setRoomErrorText(getBackendErrorText(error, t));
    } finally {
      if (mountedRef.current) {
        setRoomsLoading(false);
      }
    }
  }, [t]);

  const refreshFeed = useCallback(
    async (
      baseVisibility: NearbyProfileVisibilityDto | null,
      nextRadiusKm: number,
      options?: { profileReady?: boolean; matchingPreferencesReady?: boolean }
    ) => {
      if (baseVisibility?.status !== "active") {
        setItems([]);
        setFeedLoading(false);
        return;
      }
      if ((options?.profileReady ?? profileReadyRef.current) === false) {
        setItems([]);
        setFeedLoading(false);
        return;
      }
      if ((options?.matchingPreferencesReady ?? matchingPreferencesReadyRef.current) === false) {
        setItems([]);
        setFeedLoading(false);
        return;
      }

      const requestId = ++feedRequestIdRef.current;
      setFeedLoading(true);
      setErrorText("");
      setLocationIssue(null);
      try {
        const location = await requestNearbyLocation();
        if (!mountedRef.current || requestId !== feedRequestIdRef.current) return;
        if (location.ok === false) {
          setItems([]);
          setLocationIssue(location.issue);
          return;
        }

        const nextVisibility = await nearbyApi.updateVisibility({
          enabled: true,
          latitude: location.latitude,
          longitude: location.longitude,
          radiusKm: nextRadiusKm,
          nearbyStatus: baseVisibility.nearbyStatus,
          statusKind: baseVisibility.statusKind ?? DEFAULT_STATUS_KIND,
        });
        const response = await nearbyApi.listProfileFeed(FEED_LIMIT);
        if (!mountedRef.current || requestId !== feedRequestIdRef.current) return;
        setVisibility(nextVisibility.visibility);
        setRadiusKm(nextVisibility.visibility.radiusKm ?? nextRadiusKm);
        setItems(response.items ?? []);
      } catch (error) {
        if (!mountedRef.current || requestId !== feedRequestIdRef.current) return;
        setItems([]);
        setErrorText(getBackendErrorText(error, t));
      } finally {
        if (mountedRef.current && requestId === feedRequestIdRef.current) {
          setFeedLoading(false);
        }
      }
    },
    [t]
  );

  const loadInitial = useCallback(async () => {
    void refreshSummary();
    void refreshRooms();
    const finishNearbyInitialLoad = startStartupSpan("nearby.initial_load", {
      focused: true,
    });
    setLoading(true);
    setErrorText("");
    setLocationIssue(null);
    let outcome = "success";
    let visibilityStatus = "unknown";
    try {
      const [me, currentProfile] = await Promise.all([
        nearbyApi.getNearbyMe(),
        getUserProfile({ allowCached: false }),
      ]);
      if (!mountedRef.current) return;
      visibilityStatus = me.visibility.status;
      setProfile(currentProfile);
      setVisibility(me.visibility);
      setRadiusKm(me.visibility.radiusKm ?? DEFAULT_RADIUS_KM);
      const currentProfileReady = isProfileReady(currentProfile);
      const currentPreferencesReady = !getMissingNearbyPreferenceField(currentProfile);
      if (me.visibility.status === "active" && currentProfileReady && currentPreferencesReady) {
        await refreshFeed(me.visibility, me.visibility.radiusKm ?? DEFAULT_RADIUS_KM, {
          profileReady: true,
          matchingPreferencesReady: true,
        });
      } else {
        setItems([]);
      }
    } catch (error) {
      if (!mountedRef.current) return;
      outcome = "error";
      setItems([]);
      setErrorText(getBackendErrorText(error, t));
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        finishNearbyInitialLoad({
          outcome,
          visibilityStatus,
        });
      }
    }
  }, [refreshFeed, refreshRooms, refreshSummary, t]);

  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener(PROFILE_UPDATED_EVENT, () => {
      void loadInitial();
    });

    return () => {
      subscription.remove();
    };
  }, [loadInitial]);

  const refreshNearby = useCallback(() => {
    if (refreshDisabled || manualRefreshBusyRef.current) return;
    manualRefreshBusyRef.current = true;
    void refreshSummary();
    void refreshRooms();

    const currentVisibility = visibilityRef.current;
    if (
      currentVisibility?.status === "active" &&
      profileReadyRef.current &&
      matchingPreferencesReadyRef.current
    ) {
      void refreshFeed(currentVisibility, radiusRef.current).finally(() => {
        manualRefreshBusyRef.current = false;
      });
      return;
    }

    void loadInitial().finally(() => {
      manualRefreshBusyRef.current = false;
    });
  }, [loadInitial, refreshDisabled, refreshFeed, refreshRooms, refreshSummary]);

  useFocusEffect(
    useCallback(() => {
      void loadInitial();
    }, [loadInitial])
  );

  const enableVisibility = useCallback(async () => {
    const missingFields = getMissingMatchingSafetyFields(profile);
    if (missingFields.length) {
      setErrorText(getMissingSafetyFieldsBody(missingFields, t));
      return;
    }

    setToggleBusy(true);
    setErrorText("");
    setLocationIssue(null);
    try {
      const location = await requestNearbyLocation();
      if (!mountedRef.current) return;
      if (location.ok === false) {
        setLocationIssue(location.issue);
        return;
      }

      const response = await nearbyApi.updateVisibility({
        enabled: true,
        latitude: location.latitude,
        longitude: location.longitude,
        radiusKm: radiusRef.current,
        nearbyStatus: visibility?.nearbyStatus ?? null,
        statusKind: visibility?.statusKind ?? DEFAULT_STATUS_KIND,
      });
      await setNearbyEnabled(true).catch(() => {});
      if (!mountedRef.current) return;
      setVisibility(response.visibility);
      void refreshSummary();
      await refreshFeed(response.visibility, response.visibility.radiusKm ?? radiusRef.current);
    } catch (error) {
      if (!mountedRef.current) return;
      setErrorText(getBackendErrorText(error, t));
    } finally {
      if (mountedRef.current) {
        setToggleBusy(false);
      }
    }
  }, [profile, radiusKm, refreshFeed, refreshSummary, t, visibility]);

  const disableVisibility = useCallback(async () => {
    setToggleBusy(true);
    setErrorText("");
    setLocationIssue(null);
    feedRequestIdRef.current += 1;
    if (radiusRefreshTimerRef.current) {
      clearTimeout(radiusRefreshTimerRef.current);
      radiusRefreshTimerRef.current = null;
    }
    try {
      const response = await nearbyApi.updateVisibility({ enabled: false });
      await setNearbyEnabled(false).catch(() => {});
      if (!mountedRef.current) return;
      setVisibility(response.visibility);
      setItems([]);
      void refreshSummary();
    } catch (error) {
      if (!mountedRef.current) return;
      setErrorText(getBackendErrorText(error, t));
    } finally {
      if (mountedRef.current) {
        setToggleBusy(false);
      }
    }
  }, [refreshSummary, t]);

  const handleToggle = useCallback(
    (value: boolean) => {
      if (toggleBusy) return;
      void (value ? enableVisibility() : disableVisibility());
    },
    [disableVisibility, enableVisibility, toggleBusy]
  );

  const handleRadiusChange = useCallback(
    (nextRadiusKm: number) => {
      if (nextRadiusKm === radiusRef.current) return;
      radiusRef.current = nextRadiusKm;
      feedRequestIdRef.current += 1;
      setRadiusKm(nextRadiusKm);
      if (visibility?.status === "active") {
        if (radiusRefreshTimerRef.current) {
          clearTimeout(radiusRefreshTimerRef.current);
        }
        setFeedLoading(true);
        radiusRefreshTimerRef.current = setTimeout(() => {
          radiusRefreshTimerRef.current = null;
          void refreshFeed(visibilityRef.current, nextRadiusKm);
        }, 320);
      }
    },
    [refreshFeed, visibility]
  );

  const handleGenderFilterChange = useCallback(
    async (next: GenderFilter) => {
      if (preferenceBusy) return;
      setPreferenceBusy(true);
      setErrorText("");
      try {
        const updated = await updateUserFields({
          preferredGenders: next === "all" ? [] : [next],
        });
        if (!mountedRef.current) return;
        setProfile(updated);
        if (visibility?.status === "active") {
          await refreshFeed(visibility, radiusRef.current, {
            profileReady: isProfileReady(updated),
            matchingPreferencesReady: !getMissingNearbyPreferenceField(updated),
          });
        }
      } catch (error) {
        if (!mountedRef.current) return;
        setErrorText(getBackendErrorText(error, t));
      } finally {
        if (mountedRef.current) {
          setPreferenceBusy(false);
        }
      }
    },
    [preferenceBusy, refreshFeed, t, visibility]
  );

  const handleAgeFilterChange = useCallback(
    async (next: AgeFilterId) => {
      if (preferenceBusy) return;
      const option = AGE_FILTER_OPTIONS.find((item) => item.id === next) ?? AGE_FILTER_OPTIONS[0];
      setPreferenceBusy(true);
      setErrorText("");
      try {
        const updated = await updateUserFields({
          preferredAgeMin: option.min,
          preferredAgeMax: option.max,
        });
        if (!mountedRef.current) return;
        setProfile(updated);
        if (visibility?.status === "active") {
          await refreshFeed(visibility, radiusRef.current, {
            profileReady: isProfileReady(updated),
            matchingPreferencesReady: !getMissingNearbyPreferenceField(updated),
          });
        }
      } catch (error) {
        if (!mountedRef.current) return;
        setErrorText(getBackendErrorText(error, t));
      } finally {
        if (mountedRef.current) {
          setPreferenceBusy(false);
        }
      }
    },
    [preferenceBusy, refreshFeed, t, visibility]
  );

  const openProfile = useCallback(
    (item: NearbyProfileFeedItemDto) => {
      navigation.navigate("UserProfile", {
        userId: item.userId,
        peerName: item.displayName,
        sourceContext: { source: "nearby" },
        nearbyCanMessage: item.canMessage,
      });
    },
    [navigation]
  );

  const goToProfileSetup = useCallback(() => {
    navigation.navigate("Profile", {
      screen: "EditProfile",
      params: { focus: "birthDate" },
    });
  }, [navigation]);

  const goToProfilePreferences = useCallback(() => {
    navigation.navigate("Profile", {
      screen: "EditProfile",
      params: { focus: "preferences" },
    });
  }, [navigation]);

  const openActivityPreferences = useCallback(() => {
    navigation.navigate("NearbyActivityPreferences");
  }, [navigation]);

  const widenRadius = useCallback(() => {
    if (refreshDisabled) return;
    const currentIndex = RADIUS_OPTIONS.findIndex((value) => value === radiusKm);
    const next = RADIUS_OPTIONS[Math.min(currentIndex + 1, RADIUS_OPTIONS.length - 1)];
    if (next) {
      handleRadiusChange(next);
    }
  }, [handleRadiusChange, radiusKm, refreshDisabled]);

  const handleJoinRoom = useCallback(
    async (room: NearbyRoomCard) => {
      if (roomActionBusyId) return;
      setRoomActionBusyId(room.id);
      setRoomErrorText("");
      setRoomPreferenceGateVisible(false);
      try {
        await nearbyApi.joinNearbyRoom(room.id);
        await refreshRooms();
      } catch (error) {
        if (!mountedRef.current) return;
        if (isNearbyActivityPreferenceRequiredError(error)) {
          setRoomPreferenceGateVisible(true);
          return;
        }
        setRoomErrorText(getBackendErrorText(error, t));
      } finally {
        if (mountedRef.current) {
          setRoomActionBusyId(null);
        }
      }
    },
    [refreshRooms, roomActionBusyId, t]
  );

  const handleOpenRoom = useCallback(
    async (room: NearbyRoomCard) => {
      if (roomActionBusyId) return;
      setRoomActionBusyId(room.id);
      setRoomErrorText("");
      setRoomPreferenceGateVisible(false);
      try {
        const response = await nearbyApi.openNearbyRoom(room.id);
        await refreshRooms();
        if (!mountedRef.current) return;
        navigation.navigate("NearbyRoomChat", {
          roomId: response.roomId,
          title: response.title || room.title,
        });
      } catch (error) {
        if (!mountedRef.current) return;
        if (isNearbyActivityPreferenceRequiredError(error)) {
          setRoomPreferenceGateVisible(true);
          return;
        }
        setRoomErrorText(getBackendErrorText(error, t));
      } finally {
        if (mountedRef.current) {
          setRoomActionBusyId(null);
        }
      }
    },
    [navigation, refreshRooms, roomActionBusyId, t]
  );

  const header = useMemo(
    () => (
      <View style={styles.headerArea}>
        <View style={styles.titleBlock}>
          <Text style={styles.title}>
            {copyOrFallback(t, "nearby.title", "Рядом")}
          </Text>
          <Text style={styles.subtitle}>
            {copyOrFallback(
              t,
              "nearby.subtitle",
              "Люди поблизости, которые открыты к знакомству."
            )}
          </Text>
        </View>

        <NearbyStatsCards summary={summary} loading={summaryLoading} t={t} />

        <LinearGradient
          colors={["rgba(4, 8, 20, 0.78)", "rgba(4, 8, 20, 0.78)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.controlPanel}
        >
          <View style={styles.toggleRow}>
            <View style={styles.toggleText}>
              <Text style={styles.sectionTitle}>
                {copyOrFallback(
                  t,
                  "nearby.visibilityToggle",
                  "Показывать меня в Рядом"
                )}
              </Text>
              <Text style={styles.privacyNote}>
                {copyOrFallback(
                  t,
                  "nearby.privacyNote",
                  "Точные координаты не показываются."
                )}
              </Text>
            </View>
            {toggleBusy ? (
              <ActivityIndicator color="#F3C98B" />
            ) : (
              <Switch
                value={active}
                onValueChange={handleToggle}
                trackColor={{
                  false: "rgba(255,255,255,0.18)",
                  true: "rgba(255, 88, 141, 0.44)",
                }}
                thumbColor={active ? "#FF8A57" : "#F5F5FF"}
              />
            )}
          </View>

          <View style={styles.filterGroup}>
            <Text style={styles.filterLabel}>
              {copyOrFallback(t, "nearby.filterRadius", "Радиус")}
            </Text>
            <View style={styles.segmentRow}>
              {RADIUS_OPTIONS.map((option) => (
                <Pressable
                  key={option}
                  onPress={() => handleRadiusChange(option)}
                  style={[
                    styles.segment,
                    radiusKm === option ? styles.segmentActive : null,
                  ]}
                >
                  {radiusKm === option ? (
                    <LinearGradient
                      pointerEvents="none"
                      colors={["#FF8848", "#E8428A", "#A01878"]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.segmentActiveGradient}
                    />
                  ) : null}
                  <Text
                    style={[
                      styles.segmentText,
                      radiusKm === option ? styles.segmentTextActive : null,
                    ]}
                  >
                    {copyOrFallback(t, "nearby.radiusKm", "{km} км", {
                      km: String(option),
                    })}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.filterGroup}>
            <Text style={styles.filterLabel}>
              {copyOrFallback(t, "nearby.filterWho", "Кого показывать")}
            </Text>
            <View style={styles.segmentRow}>
              {GENDER_FILTERS.map((option) => (
                <Pressable
                  key={option}
                  onPress={() => void handleGenderFilterChange(option)}
                  disabled={preferenceBusy}
                  style={[
                    styles.segment,
                    genderFilter === option ? styles.segmentActive : null,
                    preferenceBusy ? styles.segmentDisabled : null,
                  ]}
                >
                  {genderFilter === option ? (
                    <LinearGradient
                      pointerEvents="none"
                      colors={["#FF8848", "#E8428A", "#A01878"]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.segmentActiveGradient}
                    />
                  ) : null}
                  <Text
                    style={[
                      styles.segmentText,
                      genderFilter === option ? styles.segmentTextActive : null,
                    ]}
                  >
                    {copyOrFallback(
                      t,
                      `nearby.gender.${option}`,
                      option === "all" ? "Все" : option
                    )}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.filterGroup}>
            <Text style={styles.filterLabel}>
              {copyOrFallback(t, "nearby.filterAge", "Возраст")}
            </Text>
            <View style={styles.segmentRow}>
              {AGE_FILTER_OPTIONS.map((option) => (
                <Pressable
                  key={option.id}
                  onPress={() => void handleAgeFilterChange(option.id)}
                  disabled={preferenceBusy}
                  style={[
                    styles.segment,
                    ageFilter === option.id ? styles.segmentActive : null,
                    preferenceBusy ? styles.segmentDisabled : null,
                  ]}
                >
                  {ageFilter === option.id ? (
                    <LinearGradient
                      pointerEvents="none"
                      colors={["#FF8848", "#E8428A", "#A01878"]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.segmentActiveGradient}
                    />
                  ) : null}
                  <Text
                    style={[
                      styles.segmentText,
                      ageFilter === option.id ? styles.segmentTextActive : null,
                    ]}
                  >
                    {getAgeFilterLabel(option.id, t)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.summaryRow}>
            <Ionicons name="filter-outline" size={16} color="#F3C98B" />
            <Text style={styles.summaryText}>
              {copyOrFallback(
                t,
                "nearby.ageBackendNote",
                "Возрастный фильтр сохраняется в профиле и применяется backend-подбором."
              )}{" "}
              {getAgePreferenceLabel(profile, t)}
            </Text>
          </View>

          {active ? (
            <Pressable
              onPress={refreshNearby}
              disabled={refreshDisabled}
              style={[
                styles.refreshButton,
                refreshDisabled ? styles.buttonDisabled : null,
              ]}
            >
              <LinearGradient
                pointerEvents="none"
                colors={["#A01878", "#E8428A", "#FF8848"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.refreshButtonGradient}
              />
              {feedLoading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Ionicons name="refresh-outline" size={20} color="#FFFFFF" />
              )}
              <Text style={styles.refreshButtonText}>
                {copyOrFallback(t, "nearby.refreshAction", "Обновить")}
              </Text>
            </Pressable>
          ) : null}
        </LinearGradient>

        {missingSafetyFields.length ? (
          <View style={styles.completionPanel}>
            <View style={styles.completionIcon}>
              <Ionicons name="shield-checkmark-outline" size={18} color="#F3C98B" />
            </View>
            <View style={styles.completionCopy}>
              <Text style={styles.completionTitle}>
                {copyOrFallback(t, "profile.completeProfile", "Complete profile")}
              </Text>
              <Text style={styles.completionBody}>
                {getMissingSafetyFieldsBody(missingSafetyFields, t)}
              </Text>
            </View>
            <Pressable
              onPress={
                missingSafetyFields.includes("birthDate")
                  ? goToProfileSetup
                  : goToProfilePreferences
              }
              style={styles.completionButton}
            >
              <Text style={styles.completionButtonText}>
                {copyOrFallback(t, "nearby.emptyProfileAction", "Fill profile")}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {errorText ? (
          <View style={styles.errorPanel}>
            <Ionicons name="alert-circle-outline" size={18} color="#FFD2DA" />
            <Text style={styles.errorText}>{errorText}</Text>
            <Pressable
              onPress={refreshNearby}
              disabled={refreshDisabled}
              style={[
                styles.retryButton,
                refreshDisabled ? styles.buttonDisabled : null,
              ]}
            >
              <Text style={styles.retryButtonText}>
                {copyOrFallback(t, "nearby.retryAction", "Повторить")}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    ),
    [
      active,
      ageFilter,
      errorText,
      genderFilter,
      handleAgeFilterChange,
      handleGenderFilterChange,
      handleRadiusChange,
      handleToggle,
      missingSafetyFields,
      preferenceBusy,
      profile,
      radiusKm,
      refreshDisabled,
      refreshNearby,
      summary,
      summaryLoading,
      t,
      toggleBusy,
    ]
  );

  const emptyState = useMemo(() => {
    if (loading || feedLoading) return null;

    if (!profileReady) {
      return {
        icon: "person-add-outline" as const,
        title: copyOrFallback(t, "nearby.emptyProfileTitle", "Заполните профиль"),
        body: copyOrFallback(
          t,
          "nearby.emptyProfileBody",
          "Для честного подбора нужен возрастной контекст. Точная дата рождения другим людям не показывается."
        ),
        actions: [
          {
            label: copyOrFallback(t, "nearby.emptyProfileAction", "Заполнить анкету"),
            onPress: goToProfileSetup,
            variant: "primary" as const,
          },
          ...(active
            ? [
                {
                  label: copyOrFallback(t, "nearby.refreshAction", "Обновить"),
                  onPress: refreshNearby,
                  variant: "secondary" as const,
                  disabled: refreshDisabled,
                },
              ]
            : []),
        ],
      };
    }

    if (missingPreferenceField) {
      return {
        icon: "options-outline" as const,
        title: copyOrFallback(t, "nearby.emptyPreferencesTitle", "Заполните анкету"),
        body: copyOrFallback(
          t,
          "nearby.emptyPreferencesBody",
          "Заполните, кого вы ищете, чтобы Рядом показывал подходящих людей."
        ),
        actions: [
          {
            label: copyOrFallback(t, "nearby.emptyPreferencesAction", "Заполнить анкету"),
            onPress: goToProfilePreferences,
            variant: "primary" as const,
          },
          ...(active
            ? [
                {
                  label: copyOrFallback(t, "nearby.refreshAction", "Обновить"),
                  onPress: refreshNearby,
                  variant: "secondary" as const,
                  disabled: refreshDisabled,
                },
              ]
            : []),
        ],
      };
    }

    if (!active) {
      return {
        icon: "eye-off-outline" as const,
        title: copyOrFallback(t, "nearby.emptyOffTitle", "Включите видимость"),
        body: copyOrFallback(
          t,
          "nearby.emptyOffBody",
          "Пока видимость выключена, лента Рядом не показывает идентифицируемые профили."
        ),
        actions: [
          {
            label: copyOrFallback(t, "nearby.emptyOffAction", "Показывать меня"),
            onPress: enableVisibility,
            variant: "primary" as const,
            disabled: toggleBusy,
          },
        ],
      };
    }

    if (locationIssue) {
      const blocked = locationIssue === "permissionBlocked";
      return {
        icon: "location-outline" as const,
        title: copyOrFallback(
          t,
          blocked ? "nearby.emptyLocationBlockedTitle" : "nearby.emptyLocationTitle",
          "Нужна геолокация"
        ),
        body: copyOrFallback(
          t,
          blocked ? "nearby.emptyLocationBlockedBody" : "nearby.emptyLocationBody",
          "Разрешите геолокацию, чтобы обновить Рядом. Точные координаты не показываются."
        ),
        actions: [
          {
            label: copyOrFallback(t, "nearby.refreshAction", "Обновить"),
            onPress: refreshNearby,
            variant: "primary" as const,
            disabled: refreshDisabled,
          },
        ],
      };
    }

    return {
      icon: "people-outline" as const,
      title: copyOrFallback(t, "nearby.emptyPeopleTitle", "Пока рядом никого нет"),
      body:
        radiusKm < 250
          ? copyOrFallback(
              t,
              "nearby.emptyWidenBody",
              "Попробуйте расширить радиус или обновить ленту позже."
            )
          : copyOrFallback(
              t,
              "nearby.emptyPeopleBody",
              "Люди появятся здесь, когда включат видимость и подойдут по взаимным настройкам."
            ),
      actions: [
        {
          label: copyOrFallback(t, "nearby.refreshAction", "Обновить"),
          onPress: refreshNearby,
          variant: "primary" as const,
          disabled: refreshDisabled,
        },
        ...(radiusKm < 250
          ? [
              {
                label: copyOrFallback(t, "nearby.emptyWidenAction", "Расширить радиус"),
                onPress: widenRadius,
                variant: "secondary" as const,
                disabled: refreshDisabled,
              },
            ]
          : []),
      ],
    };
  }, [
    active,
    enableVisibility,
    feedLoading,
    goToProfileSetup,
    goToProfilePreferences,
    loading,
    locationIssue,
    missingPreferenceField,
    profileReady,
    radiusKm,
    refreshDisabled,
    refreshNearby,
    t,
    toggleBusy,
    widenRadius,
  ]);

  const renderEmpty = useCallback(() => {
    if (loading || feedLoading) {
      return (
        <View style={styles.emptyPanel}>
          <ActivityIndicator color="#F3C98B" />
          <Text style={styles.emptyTitle}>
            {copyOrFallback(t, "nearby.loading", "Загружаем Рядом…")}
          </Text>
        </View>
      );
    }

    if (!emptyState) return null;
    return (
      <View style={styles.emptyPanel}>
        <Ionicons name={emptyState.icon} size={30} color="#F3C98B" />
        <Text style={styles.emptyTitle}>{emptyState.title}</Text>
        <Text style={styles.emptyBody}>{emptyState.body}</Text>
        <View style={styles.emptyActions}>
          {emptyState.actions.map((action) => (
            <Pressable
              key={action.label}
              style={[
                styles.emptyButton,
                action.variant === "secondary" ? styles.emptyButtonSecondary : null,
                action.disabled ? styles.buttonDisabled : null,
              ]}
              disabled={action.disabled}
              onPress={action.onPress}
            >
              <Text
                style={[
                  styles.emptyButtonText,
                  action.variant === "secondary" ? styles.emptyButtonSecondaryText : null,
                ]}
              >
                {action.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
  }, [emptyState, feedLoading, loading, t]);

  const peopleItems = useMemo(
    () => (active && profileReady && matchingPreferencesReady ? items : []),
    [active, items, matchingPreferencesReady, profileReady]
  );
  const firstPeopleItems = useMemo(
    () => peopleItems.slice(0, firstPeopleCount),
    [firstPeopleCount, peopleItems]
  );
  const remainingPeopleItems = useMemo(
    () => peopleItems.slice(firstPeopleCount),
    [firstPeopleCount, peopleItems]
  );

  const renderCard = useCallback(
    ({ item }: { item: NearbyProfileFeedItemDto }) => (
      <NearbyProfileCardSlot
        item={item}
        onOpen={() => openProfile(item)}
        cardWidth={peopleCardWidth}
        cardHeight={peopleCardHeight}
        avatarSize={peopleAvatarSize}
        cardRadius={cardRadius}
        cardInnerRadius={cardInnerRadius}
        primaryColor={primaryColor}
        accentColor={accentColor}
        t={t}
      />
    ),
    [
      accentColor,
      cardInnerRadius,
      cardRadius,
      openProfile,
      peopleAvatarSize,
      peopleCardHeight,
      peopleCardWidth,
      primaryColor,
      t,
    ]
  );

  const visibleRooms = useMemo(
    () => rooms.slice(0, ROOM_CARD_LIMIT),
    [rooms]
  );

  const activityShelf = useMemo(() => {
    if (!visibleRooms.length && !roomErrorText && !roomPreferenceGateVisible) {
      return null;
    }

    return (
      <NearbyRoomCardsSection
        rooms={visibleRooms}
        loading={roomsLoading}
        errorText={roomErrorText}
        preferenceGateVisible={roomPreferenceGateVisible}
        busyRoomId={roomActionBusyId}
        onJoin={(room) => void handleJoinRoom(room)}
        onOpen={(room) => void handleOpenRoom(room)}
        onOpenPreferences={openActivityPreferences}
        cardWidth={activityCardWidth}
        cardHeight={activityCardHeight}
        cardGap={activityCardGap}
        horizontalPadding={screenHorizontalPadding}
        sectionGap={sectionGap}
        smallGap={smallGap}
        primaryColor={primaryColor}
        accentColor={accentColor}
        t={t}
        locale={locale}
      />
    );
  }, [
    accentColor,
    activityCardGap,
    activityCardHeight,
    activityCardWidth,
    handleJoinRoom,
    handleOpenRoom,
    openActivityPreferences,
    primaryColor,
    roomActionBusyId,
    roomErrorText,
    roomPreferenceGateVisible,
    roomsLoading,
    screenHorizontalPadding,
    sectionGap,
    smallGap,
    locale,
    t,
    visibleRooms,
  ]);

  const listFooter = useMemo(
    () => (
      <View>
        {activityShelf}
        {remainingPeopleItems.length ? (
          <View
            style={[
              styles.remainingPeopleGrid,
              {
                gap: gridGap,
                paddingHorizontal: peopleGridHorizontalPadding,
              },
            ]}
          >
            {remainingPeopleItems.map((item) => (
              <NearbyProfileCardSlot
                key={item.userId}
                item={item}
                onOpen={() => openProfile(item)}
                cardWidth={peopleCardWidth}
                cardHeight={peopleCardHeight}
                avatarSize={peopleAvatarSize}
                cardRadius={cardRadius}
                cardInnerRadius={cardInnerRadius}
                primaryColor={primaryColor}
                accentColor={accentColor}
                t={t}
              />
            ))}
          </View>
        ) : null}
        <View style={{ height: smallGap }} />
      </View>
    ),
    [
      accentColor,
      activityShelf,
      cardInnerRadius,
      cardRadius,
      gridGap,
      openProfile,
      peopleAvatarSize,
      peopleCardHeight,
      peopleCardWidth,
      peopleGridHorizontalPadding,
      primaryColor,
      remainingPeopleItems,
      smallGap,
      t,
    ]
  );

  const peopleSectionHeader = useMemo(
    () => (
      <Text style={styles.peopleSectionTitle}>
        {copyOrFallback(
          t,
          "nearby.people.title",
          getPeopleNearbyTitleFallback(locale)
        )}
      </Text>
    ),
    [locale, t]
  );

  const listHeader = useMemo(
    () => (
      <View>
        {header}
        {peopleSectionHeader}
      </View>
    ),
    [header, peopleSectionHeader]
  );

  const columnWrapperStyle = useMemo(
    () => [
      styles.columnWrap,
      {
        gap: gridGap,
        paddingHorizontal: peopleGridHorizontalPadding,
        marginBottom: gridGap,
      },
    ],
    [gridGap, peopleGridHorizontalPadding]
  );

  const listContentStyle = useMemo(
    () => [
      styles.listContent,
      {
        paddingBottom: sectionGap,
      },
    ],
    [sectionGap]
  );

  return (
    <ScreenShell
      title={copyOrFallback(t, "tabs.nearby", "Рядом")}
      background="now"
      overlayOpacity={0.2}
      blurRadius={0}
    >
      <FlatList
        key={`${columns}-${peopleCardWidth}`}
        data={firstPeopleItems}
        numColumns={columns}
        keyExtractor={(item) => item.userId}
        renderItem={renderCard}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={listFooter}
        columnWrapperStyle={columnWrapperStyle}
        contentContainerStyle={listContentStyle}
        refreshing={feedLoading || (roomsLoading && !loading)}
        onRefresh={() => {
          if (active && !refreshDisabled) {
            refreshNearby();
          }
        }}
      />
    </ScreenShell>
  );
}

function NearbyStatsCards({
  summary,
  loading,
  t,
}: {
  summary: NearbySummaryResponse | null;
  loading: boolean;
  t: (key: string, params?: Record<string, string>) => string;
}) {
  const metrics: Array<{
    key: string;
    label: string;
    value: number | undefined;
    icon: React.ComponentProps<typeof Ionicons>["name"];
  }> = [
    {
      key: "people",
      label: copyOrFallback(t, "nearby.pulsePeople", "Людей"),
      value: summary?.totalUsersCount,
      icon: "people-outline",
    },
    {
      key: "online",
      label: copyOrFallback(t, "nearby.pulseOnline", "Онлайн"),
      value: summary?.onlineNowCount,
      icon: "radio-outline",
    },
    {
      key: "nearby",
      label: copyOrFallback(t, "nearby.pulseNearby", "Рядом"),
      value: summary?.activeNearbyCount,
      icon: "location-outline",
    },
  ];

  return (
    <View style={styles.statsGrid}>
      {metrics.map((metric) => (
        <LinearGradient
          key={metric.key}
          colors={["rgba(13, 25, 52, 0.58)", "rgba(13, 25, 52, 0.58)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.statCard}
        >
          <View style={styles.statIconFrame}>
            {loading && !summary ? (
              <ActivityIndicator size="small" color="#F3C98B" />
            ) : (
              <Ionicons name={metric.icon} size={20} color="#F3C98B" />
            )}
          </View>
          <View style={styles.statCopy}>
            <Text style={styles.statLabel} numberOfLines={1} ellipsizeMode="tail">
              {metric.label}
            </Text>
            <Text style={styles.statValue} numberOfLines={1} maxFontSizeMultiplier={1}>
              {formatPulseCount(metric.value, t)}
            </Text>
          </View>
        </LinearGradient>
      ))}
    </View>
  );
}

function NearbyRoomCardsSection({
  rooms,
  loading,
  errorText,
  preferenceGateVisible,
  busyRoomId,
  onJoin,
  onOpen,
  onOpenPreferences,
  cardWidth,
  cardHeight,
  cardGap,
  horizontalPadding,
  sectionGap,
  smallGap,
  primaryColor,
  accentColor,
  t,
  locale,
}: {
  rooms: NearbyRoomCard[];
  loading: boolean;
  errorText: string;
  preferenceGateVisible: boolean;
  busyRoomId: string | null;
  onJoin: (room: NearbyRoomCard) => void;
  onOpen: (room: NearbyRoomCard) => void;
  onOpenPreferences: () => void;
  cardWidth: number;
  cardHeight: number;
  cardGap: number;
  horizontalPadding: number;
  sectionGap: number;
  smallGap: number;
  primaryColor: string;
  accentColor: string;
  t: (key: string, params?: Record<string, string>) => string;
  locale: string;
}) {
  return (
    <View
      style={[
        styles.roomsSection,
        {
          marginTop: sectionGap,
          marginBottom: sectionGap,
          paddingVertical: 12,
        },
      ]}
    >
      <View style={styles.roomsHeader}>
        <Text style={styles.roomsTitle} numberOfLines={1}>
          {copyOrFallback(t, "nearby.rooms.title", "Активности рядом")}
        </Text>
        <View style={styles.roomsHeaderActions}>
          {loading ? <ActivityIndicator size="small" color={accentColor} /> : null}
          <Pressable
            onPress={onOpenPreferences}
            style={styles.roomsConfigureButton}
            accessibilityRole="button"
          >
            <Text
              style={[styles.roomsConfigureText, { color: accentColor }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.82}
            >
              {copyOrFallback(
                t,
                "nearby.activityPreferences.configure",
                getActivityConfigureFallback(locale)
              )}
            </Text>
          </Pressable>
        </View>
      </View>

      {errorText ? (
        <View style={[styles.roomsError, { marginHorizontal: horizontalPadding }]}>
          <Ionicons name="alert-circle-outline" size={16} color="#FFD2DA" />
          <Text style={styles.roomsErrorText}>{errorText}</Text>
        </View>
      ) : null}

      {preferenceGateVisible ? (
        <View
          style={[
            styles.roomsPreferenceGate,
            { marginHorizontal: horizontalPadding, marginTop: smallGap },
          ]}
        >
          <View style={styles.roomsPreferenceGateHeader}>
            <View style={styles.roomsPreferenceGateIcon}>
              <Ionicons name="options-outline" size={18} color={accentColor} />
            </View>
            <View style={styles.roomsPreferenceGateCopy}>
              <Text style={styles.roomsPreferenceGateTitle}>
                {copyOrFallback(
                  t,
                  "nearby.activityPreferences.requiredTitle",
                  "Сначала выберите активности рядом"
                )}
              </Text>
              <Text style={styles.roomsPreferenceGateBody}>
                {copyOrFallback(
                  t,
                  "nearby.activityPreferences.requiredBody",
                  "Чтобы присоединиться к этой активности, отметьте её во второй анкете."
                )}
              </Text>
            </View>
          </View>
          <Pressable
            onPress={onOpenPreferences}
            style={styles.roomsPreferenceGateButton}
            accessibilityRole="button"
          >
            <Text
              style={styles.roomsPreferenceGateButtonText}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.82}
            >
              {copyOrFallback(
                t,
                "nearby.activityPreferences.requiredButton",
                "Выбрать активности"
              )}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {rooms.length ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.roomRail}
          contentContainerStyle={[
            styles.roomRailContent,
            {
              gap: cardGap,
              paddingHorizontal: horizontalPadding,
              paddingRight: horizontalPadding + cardGap,
            },
          ]}
        >
          {rooms.map((room) => (
            <NearbyRoomCardView
              key={room.id}
              room={room}
              cardWidth={cardWidth}
              cardHeight={cardHeight}
              primaryColor={primaryColor}
              accentColor={accentColor}
              busy={busyRoomId === room.id}
              disabled={Boolean(busyRoomId)}
              onJoin={() => onJoin(room)}
              onOpen={() => onOpen(room)}
              t={t}
              locale={locale}
            />
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

function NearbyRoomCardView({
  room,
  cardWidth,
  cardHeight,
  primaryColor,
  accentColor,
  busy,
  disabled,
  onJoin,
  onOpen,
  t,
  locale,
}: {
  room: NearbyRoomCard;
  cardWidth: number;
  cardHeight: number;
  primaryColor: string;
  accentColor: string;
  busy: boolean;
  disabled: boolean;
  onJoin: () => void;
  onOpen: () => void;
  t: (key: string, params?: Record<string, string>) => string;
  locale: string;
}) {
  const action = getNearbyRoomAction(room, t);
  const canAct = action.kind === "join" || action.kind === "open";
  const startsAtLabel = formatNearbyRoomStartsAt(room.startsAt, locale);
  const locationLabel = normalizeOptionalRoomLabel(room.locationLabel);

  return (
    <View style={[styles.roomCard, { width: cardWidth, height: cardHeight }]}>
      <Text style={styles.roomTitle} numberOfLines={2} ellipsizeMode="tail">
        {room.title}
      </Text>

      {startsAtLabel || locationLabel ? (
        <View style={styles.roomSchedule}>
          {startsAtLabel ? (
            <View style={styles.roomScheduleItem}>
              <Ionicons name="time-outline" size={12} color={accentColor} />
              <Text
                style={styles.roomScheduleText}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {startsAtLabel}
              </Text>
            </View>
          ) : null}
          {locationLabel ? (
            <View style={styles.roomScheduleItem}>
              <Ionicons name="location-outline" size={12} color={accentColor} />
              <Text
                style={styles.roomScheduleText}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {locationLabel}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={styles.roomCompactFooter}>
        <View style={styles.roomMetaPill}>
          <Ionicons name="people-outline" size={12} color="#E8EBFF" />
          <Text style={styles.roomMetaText} numberOfLines={1}>
            {copyOrFallback(t, "nearby.rooms.members", "{count} участн.", {
              count: String(Math.max(0, room.memberCount)),
            })}
          </Text>
        </View>

        <Pressable
          disabled={!canAct || disabled || busy}
          onPress={action.kind === "join" ? onJoin : action.kind === "open" ? onOpen : undefined}
          style={[
            styles.roomActionButton,
            canAct
              ? [styles.roomActionButtonEnabled, { backgroundColor: primaryColor }]
              : styles.roomActionButtonDisabled,
            disabled || busy ? styles.buttonDisabled : null,
          ]}
        >
          {busy ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text
              style={[
                styles.roomActionText,
                canAct ? styles.roomActionTextEnabled : styles.roomActionTextDisabled,
              ]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.82}
            >
              {action.label}
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

function formatPulseCount(
  value: number | null | undefined,
  t: (key: string, params?: Record<string, string>) => string
) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.max(0, Math.floor(value)));
  }

  return t("nearby.summaryUnavailable");
}

function normalizeOptionalRoomLabel(value: string | null | undefined) {
  const label = String(value ?? "").trim();
  return label || "";
}

function formatNearbyRoomStartsAt(
  value: string | null | undefined,
  locale: string
) {
  const rawValue = normalizeOptionalRoomLabel(value);
  if (!rawValue) return "";

  const date = new Date(rawValue);
  if (!Number.isFinite(date.getTime())) return "";

  try {
    const formatted = new Intl.DateTimeFormat(locale, {
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);

    return formatted
      ? formatted.charAt(0).toLocaleUpperCase(locale) + formatted.slice(1)
      : "";
  } catch {
    return "";
  }
}

function getNearbyRoomAction(
  room: NearbyRoomCard,
  t: (key: string, params?: Record<string, string>) => string
): { kind: "join" | "open" | "unavailable"; label: string } {
  if (room.canJoin) {
    return {
      kind: "join",
      label: copyOrFallback(t, "nearby.rooms.join", "Присоединиться"),
    };
  }

  if (room.canOpen) {
    return {
      kind: "open",
      label: copyOrFallback(t, "nearby.rooms.open", "Открыть"),
    };
  }

  if (room.status === "active") {
    return {
      kind: "open",
      label: copyOrFallback(t, "nearby.rooms.continue", "Продолжить"),
    };
  }

  return {
    kind: "unavailable",
    label: copyOrFallback(t, "nearby.rooms.unavailable", "Недоступно"),
  };
}

function NearbyProfileCardSlot({
  item,
  onOpen,
  cardWidth,
  cardHeight,
  avatarSize,
  cardRadius,
  cardInnerRadius,
  primaryColor,
  accentColor,
  t,
}: {
  item: NearbyProfileFeedItemDto;
  onOpen: () => void;
  cardWidth: number;
  cardHeight: number;
  avatarSize: number;
  cardRadius: number;
  cardInnerRadius: number;
  primaryColor: string;
  accentColor: string;
  t: (key: string, params?: Record<string, string>) => string;
}) {
  return (
    <View style={[styles.cardSlot, { width: cardWidth, height: cardHeight }]}>
      <NearbyProfileCard
        item={item}
        onOpen={onOpen}
        cardWidth={cardWidth}
        cardHeight={cardHeight}
        avatarSize={avatarSize}
        cardRadius={cardRadius}
        cardInnerRadius={cardInnerRadius}
        primaryColor={primaryColor}
        accentColor={accentColor}
        t={t}
      />
    </View>
  );
}

function NearbyProfileCard({
  item,
  onOpen,
  cardWidth,
  cardHeight,
  avatarSize,
  cardRadius,
  cardInnerRadius,
  primaryColor,
  accentColor,
  t,
}: {
  item: NearbyProfileFeedItemDto;
  onOpen: () => void;
  cardWidth: number;
  cardHeight: number;
  avatarSize: number;
  cardRadius: number;
  cardInnerRadius: number;
  primaryColor: string;
  accentColor: string;
  t: (key: string, params?: Record<string, string>) => string;
}) {
  const ageGroupLabel = item.ageGroup ? getAgeFilterLabel(item.ageGroup, t) : "";
  const hasStatus = Boolean(item.statusKind);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.displayName}
      onPress={onOpen}
      style={({ pressed }) => [
        styles.card,
        {
          width: cardWidth,
          height: cardHeight,
          borderRadius: cardRadius,
          borderColor: "rgba(255,255,255,0.13)",
        },
        pressed ? styles.cardPressed : null,
      ]}
    >
      <View
        style={[
          styles.cardAvatarFrame,
          {
            width: avatarSize,
            height: avatarSize,
            borderRadius: cardInnerRadius,
            borderColor: `${primaryColor}66`,
          },
        ]}
      >
        <NearbyCardMedia item={item} />
        <View style={styles.cardPhotoTint} pointerEvents="none" />
        <LinearGradient
          pointerEvents="none"
          colors={["rgba(0,0,0,0.00)", "rgba(0,0,0,0.08)", "rgba(0,0,0,0.42)"]}
          locations={[0, 0.55, 1]}
          style={styles.cardPhotoVignette}
        />

        <View
          style={[
            styles.cardStatusDot,
            hasStatus ? styles.cardStatusDotActive : styles.cardStatusDotMuted,
          ]}
          pointerEvents="none"
        />
      </View>

      <View style={styles.cardCopy} pointerEvents="none">
        <Text
          style={styles.cardName}
          numberOfLines={1}
          ellipsizeMode="tail"
          maxFontSizeMultiplier={1}
        >
          {item.displayName}
        </Text>
        {ageGroupLabel ? (
          <Text
            style={[styles.cardMeta, { color: accentColor }]}
            numberOfLines={1}
            ellipsizeMode="tail"
            adjustsFontSizeToFit
            minimumFontScale={0.82}
            maxFontSizeMultiplier={1}
          >
            {ageGroupLabel}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function NearbyCardMedia({ item }: { item: NearbyProfileFeedItemDto }) {
  const firstPublicPhoto = item.publicPhotos[0] ?? null;
  const avatarInfo = React.useMemo(
    () => getPublicMediaUrlInfo(item.avatarUrl, "nearby card avatar URL"),
    [item.avatarUrl]
  );
  const publicPhotoInfo = React.useMemo(
    () => getPublicMediaUrlInfo(firstPublicPhoto?.url, "nearby card public photo URL"),
    [firstPublicPhoto?.url]
  );
  const [avatarFailed, setAvatarFailed] = React.useState(false);
  const [publicPhotoFailed, setPublicPhotoFailed] = React.useState(false);
  const [avatarLoading, setAvatarLoading] = React.useState(false);
  const [publicPhotoLoading, setPublicPhotoLoading] = React.useState(false);
  const reportedMediaFailuresRef = React.useRef<Set<string>>(new Set());
  const hasAvatarUrl = Boolean(String(item.avatarUrl ?? "").trim());
  const publicPhotoCount = item.publicPhotos.length;

  React.useEffect(() => {
    setAvatarFailed(false);
    setPublicPhotoFailed(false);
    setAvatarLoading(Boolean(avatarInfo.url));
    setPublicPhotoLoading(false);
    reportedMediaFailuresRef.current.clear();
  }, [avatarInfo.url, item.userId, publicPhotoInfo.url]);

  const reportMediaFailure = React.useCallback(
    (
      step: "avatarLoadFailed" | "publicPhotoLoadFailed",
      urlInfo: PublicMediaUrlInfo,
      mediaId?: string
    ) => {
      const safeMediaId = mediaId ?? urlInfo.mediaId;
      const reportKey = `${step}:${safeMediaId ?? urlInfo.urlKind}`;
      if (reportedMediaFailuresRef.current.has(reportKey)) return;
      reportedMediaFailuresRef.current.add(reportKey);

      void probePublicMediaUrlInfo(urlInfo).then((probe) => {
        const reportedMediaId = safeMediaId ?? probe.mediaId;
        reportClientError({
          screen: "NearbyHubScreen",
          action: step === "avatarLoadFailed" ? "loadAvatar" : "loadPublicPhoto",
          step: "imageLoadFailed",
          message: "Nearby card media failed to load",
          metadata: {
            ...(reportedMediaId ? { mediaId: reportedMediaId } : {}),
            urlKind: probe.urlKind,
            httpStatus: probe.httpStatus ?? null,
            contentType: probe.contentType ?? null,
            hasAvatarUrl,
            photoCount: publicPhotoCount,
            visibility: step === "avatarLoadFailed" ? "avatar" : "public",
          },
        });
      });
    },
    [hasAvatarUrl, item.userId, publicPhotoCount]
  );

  React.useEffect(() => {
    if (hasAvatarUrl && !avatarInfo.url) {
      reportMediaFailure("avatarLoadFailed", avatarInfo);
    }
  }, [avatarInfo, hasAvatarUrl, reportMediaFailure]);

  React.useEffect(() => {
    const shouldTryPublicPhoto = !avatarInfo.url || avatarFailed;
    if (shouldTryPublicPhoto && firstPublicPhoto?.url && !publicPhotoInfo.url) {
      reportMediaFailure("publicPhotoLoadFailed", publicPhotoInfo, firstPublicPhoto.mediaId);
    }
  }, [
    avatarFailed,
    avatarInfo.url,
    firstPublicPhoto?.mediaId,
    firstPublicPhoto?.url,
    publicPhotoInfo,
    reportMediaFailure,
  ]);

  if (avatarInfo.url && !avatarFailed) {
    return (
      <View style={styles.cardMedia}>
        <Image
          source={{ uri: avatarInfo.url }}
          style={styles.cardMediaImage}
          resizeMode="cover"
          onLoadStart={() => setAvatarLoading(true)}
          onLoadEnd={() => setAvatarLoading(false)}
          onError={() => {
            setAvatarFailed(true);
            setAvatarLoading(false);
            reportMediaFailure("avatarLoadFailed", avatarInfo);
          }}
        />
        {avatarLoading ? (
          <View style={styles.cardMediaLoading}>
            <ActivityIndicator color="#FFFFFF" />
          </View>
        ) : null}
      </View>
    );
  }

  if (publicPhotoInfo.url && !publicPhotoFailed) {
    return (
      <View style={styles.cardMedia}>
        <Image
          source={{ uri: publicPhotoInfo.url }}
          style={styles.cardMediaImage}
          resizeMode="cover"
          onLoadStart={() => setPublicPhotoLoading(true)}
          onLoadEnd={() => setPublicPhotoLoading(false)}
          onError={() => {
            setPublicPhotoFailed(true);
            setPublicPhotoLoading(false);
            reportMediaFailure(
              "publicPhotoLoadFailed",
              publicPhotoInfo,
              firstPublicPhoto?.mediaId
            );
          }}
        />
        {publicPhotoLoading ? (
          <View style={styles.cardMediaLoading}>
            <ActivityIndicator color="#FFFFFF" />
          </View>
        ) : null}
      </View>
    );
  }

  const initials = getInitials(item.displayName);
  return (
    <View style={[styles.cardMedia, styles.cardMediaFallback]}>
      {initials ? (
        <Text style={styles.cardMediaInitials}>{initials}</Text>
      ) : (
        <Ionicons name="person-outline" size={34} color={theme.colors.text} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: 0,
  },
  columnWrap: {
    alignItems: "stretch",
  },
  remainingPeopleGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  peopleSectionTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    lineHeight: 22,
    fontWeight: "900",
    marginHorizontal: 14,
    marginBottom: 8,
  },
  cardSlot: {
    alignItems: "center",
    justifyContent: "center",
  },
  headerArea: {
    gap: 10,
    paddingTop: 2,
    paddingBottom: 8,
  },
  titleBlock: {
    paddingHorizontal: 4,
    gap: 5,
  },
  title: {
    color: theme.colors.text,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "900",
  },
  subtitle: {
    color: "#D6D8E8",
    fontSize: 14,
    lineHeight: 20,
  },
  statsGrid: {
    flexDirection: "row",
    gap: 7,
  },
  statCard: {
    flex: 1,
    minWidth: 0,
    height: 58,
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderRadius: 15,
    paddingHorizontal: 9,
    paddingVertical: 8,
    backgroundColor: "rgba(13, 25, 52, 0.58)",
    borderWidth: 1,
    borderColor: "rgba(137, 181, 226, 0.18)",
    shadowColor: "#000",
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  statIconFrame: {
    width: 31,
    height: 31,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  statCopy: {
    flex: 1,
    minWidth: 0,
    marginTop: 0,
    gap: 1,
  },
  statLabel: {
    color: "#C9CEE1",
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "800",
  },
  statValue: {
    color: "#FFFFFF",
    fontSize: 20,
    lineHeight: 23,
    fontWeight: "900",
    textShadowColor: "rgba(255, 79, 139, 0.22)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 5,
  },
  controlPanel: {
    marginTop: 6,
    borderRadius: 18,
    padding: 12,
    gap: 10,
    backgroundColor: "rgba(4, 8, 20, 0.58)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  completionPanel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: theme.shapes.cardInner,
    backgroundColor: "rgba(243, 201, 139, 0.11)",
    borderWidth: 1,
    borderColor: "rgba(243, 201, 139, 0.24)",
  },
  completionIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.18)",
  },
  completionCopy: {
    flex: 1,
    gap: 3,
  },
  completionTitle: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: "900",
  },
  completionBody: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 12,
    lineHeight: 17,
  },
  completionButton: {
    minHeight: 34,
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3C98B",
  },
  completionButtonText: {
    color: "#24150B",
    fontSize: 12,
    fontWeight: "900",
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  toggleText: {
    flex: 1,
    gap: 4,
  },
  sectionTitle: {
    color: "#FFFFFF",
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "800",
  },
  privacyNote: {
    color: "#AEB6CE",
    fontSize: 11,
    lineHeight: 14,
  },
  filterGroup: {
    gap: 7,
  },
  filterLabel: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 11,
    lineHeight: 13,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  segmentRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  segment: {
    position: "relative",
    overflow: "hidden",
    height: 32,
    minHeight: 32,
    justifyContent: "center",
    borderRadius: 11,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: "rgba(18, 25, 45, 0.54)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  segmentActive: {
    backgroundColor: "rgba(255, 79, 139, 0.22)",
    borderColor: "rgba(255,184,104,0.58)",
    shadowColor: "rgba(255,105,72,0.30)",
    shadowOpacity: 0.55,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  segmentActiveGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  segmentDisabled: {
    opacity: 0.55,
  },
  segmentText: {
    zIndex: 1,
    color: "rgba(226,232,255,0.84)",
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "700",
  },
  segmentTextActive: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
    textShadowColor: "rgba(95, 20, 52, 0.34)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 7,
    backgroundColor: "rgba(0,0,0,0.13)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  summaryText: {
    flex: 1,
    color: "#DDE2F2",
    fontSize: 11,
    lineHeight: 15,
  },
  refreshButton: {
    position: "relative",
    overflow: "hidden",
    alignSelf: "flex-start",
    height: 38,
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 14,
    paddingHorizontal: 13,
    backgroundColor: "#E8428A",
    borderWidth: 1,
    borderColor: "rgba(255,184,104,0.75)",
    shadowColor: "rgba(255,105,72,0.34)",
    shadowOpacity: 0.45,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  refreshButtonGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  refreshButtonText: {
    zIndex: 1,
    color: "#FFFFFF",
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "800",
    textShadowColor: "rgba(79, 18, 53, 0.35)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  errorPanel: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderRadius: 14,
    padding: 11,
    backgroundColor: "rgba(255, 77, 103, 0.16)",
    borderWidth: 1,
    borderColor: "rgba(255, 210, 218, 0.24)",
  },
  errorText: {
    flex: 1,
    color: "#FFD2DA",
    fontSize: 13,
    lineHeight: 18,
  },
  retryButton: {
    minHeight: 30,
    justifyContent: "center",
    borderRadius: 10,
    paddingHorizontal: 10,
    backgroundColor: "rgba(255, 210, 218, 0.18)",
    borderWidth: 1,
    borderColor: "rgba(255, 210, 218, 0.30)",
  },
  retryButtonText: {
    color: "#FFD2DA",
    fontSize: 12,
    fontWeight: "900",
  },
  roomsSection: {
    backgroundColor: "rgba(4,8,20,0.42)",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  roomsHeader: {
    height: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 14,
    marginBottom: 8,
  },
  roomsTitle: {
    flex: 1,
    minWidth: 0,
    color: "#FFFFFF",
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "900",
  },
  roomsHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  roomsConfigureButton: {
    height: 28,
    minHeight: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    paddingHorizontal: 8,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(243, 201, 139, 0.20)",
  },
  roomsConfigureText: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "900",
  },
  roomsError: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
    borderRadius: 14,
    padding: 10,
    backgroundColor: "rgba(255, 77, 103, 0.13)",
    borderWidth: 1,
    borderColor: "rgba(255, 210, 218, 0.20)",
  },
  roomsErrorText: {
    flex: 1,
    color: "#FFD2DA",
    fontSize: 12,
    lineHeight: 16,
  },
  roomsPreferenceGate: {
    gap: 10,
    borderRadius: 16,
    padding: 12,
    backgroundColor: "rgba(243, 201, 139, 0.11)",
    borderWidth: 1,
    borderColor: "rgba(243, 201, 139, 0.24)",
  },
  roomsPreferenceGateHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
  },
  roomsPreferenceGateIcon: {
    width: 34,
    height: 34,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.18)",
  },
  roomsPreferenceGateCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  roomsPreferenceGateTitle: {
    color: theme.colors.text,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "900",
  },
  roomsPreferenceGateBody: {
    color: "rgba(255,255,255,0.74)",
    fontSize: 12,
    lineHeight: 17,
  },
  roomsPreferenceGateButton: {
    minHeight: 36,
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    paddingHorizontal: 12,
    backgroundColor: "rgba(243, 201, 139, 0.94)",
  },
  roomsPreferenceGateButtonText: {
    color: "#24150B",
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "900",
  },
  roomRail: {
    marginHorizontal: 0,
  },
  roomRailContent: {},
  roomCard: {
    borderRadius: 18,
    padding: 12,
    backgroundColor: "rgba(9,14,32,0.78)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    overflow: "hidden",
  },
  roomTitle: {
    color: "#FFFFFF",
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "900",
  },
  roomSchedule: {
    marginTop: 4,
    gap: 2,
    minHeight: 0,
    flexShrink: 1,
  },
  roomScheduleItem: {
    minHeight: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  roomScheduleText: {
    flex: 1,
    minWidth: 0,
    color: "rgba(255,255,255,0.82)",
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "800",
  },
  roomCompactFooter: {
    marginTop: "auto",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  roomMetaPill: {
    height: 24,
    minHeight: 24,
    maxWidth: 82,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 12,
    paddingHorizontal: 8,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  roomMetaText: {
    flexShrink: 1,
    color: "#E8EBFF",
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "800",
  },
  roomActionButton: {
    height: 30,
    minHeight: 30,
    minWidth: 92,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    paddingHorizontal: 10,
  },
  roomActionButtonEnabled: {
    borderWidth: 1,
    borderColor: "rgba(255,184,104,0.58)",
  },
  roomActionButtonDisabled: {
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  roomActionText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "900",
  },
  roomActionTextEnabled: {
    color: "#FFFFFF",
  },
  roomActionTextDisabled: {
    color: "rgba(226,232,255,0.66)",
  },
  card: {
    alignItems: "center",
    paddingTop: 10,
    paddingHorizontal: 8,
    paddingBottom: 9,
    overflow: "hidden",
    backgroundColor: "rgba(9,14,32,0.78)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.13)",
  },
  cardPressed: {
    opacity: 0.86,
    transform: [{ scale: 0.98 }],
  },
  cardAvatarFrame: {
    position: "relative",
    overflow: "hidden",
    backgroundColor: "rgba(30, 22, 52, 0.96)",
    borderWidth: 1,
  },
  cardMedia: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
  cardMediaImage: {
    width: "100%",
    height: "100%",
  },
  cardMediaLoading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(8, 12, 24, 0.22)",
  },
  cardMediaFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(30, 22, 52, 0.96)",
  },
  cardMediaInitials: {
    color: theme.colors.text,
    fontSize: 28,
    lineHeight: 32,
    fontWeight: "900",
  },
  cardPhotoTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.03)",
  },
  cardPhotoVignette: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.14)",
  },
  cardStatusDot: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.88)",
  },
  cardStatusDotActive: {
    backgroundColor: "#20E69A",
    shadowColor: "#20E69A",
    shadowOpacity: 0.9,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  cardStatusDotMuted: {
    backgroundColor: "#AAB2C6",
  },
  cardCopy: {
    flex: 1,
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 7,
    minWidth: 0,
  },
  cardName: {
    color: theme.colors.text,
    textAlign: "center",
    fontSize: 14,
    lineHeight: 17,
    fontWeight: "900",
  },
  cardMeta: {
    textAlign: "center",
    fontSize: 12,
    lineHeight: 14,
    fontWeight: "800",
    marginTop: 2,
  },
  buttonDisabled: {
    opacity: 0.58,
  },
  emptyPanel: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 18,
    borderRadius: 18,
    padding: 18,
    gap: 9,
    backgroundColor: "rgba(10, 16, 24, 0.72)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  emptyTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: "900",
    textAlign: "center",
  },
  emptyBody: {
    color: "#C5CADB",
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
  },
  emptyActions: {
    marginTop: 4,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
  },
  emptyButton: {
    minHeight: 38,
    justifyContent: "center",
    borderRadius: 12,
    paddingHorizontal: 14,
    backgroundColor: "#F3C98B",
  },
  emptyButtonSecondary: {
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(245, 205, 139, 0.34)",
  },
  emptyButtonText: {
    color: "#24150B",
    fontSize: 13,
    fontWeight: "900",
  },
  emptyButtonSecondaryText: {
    color: "#F3C98B",
  },
});
