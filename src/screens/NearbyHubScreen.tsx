import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  DeviceEventEmitter,
  Image,
  Modal,
  Pressable,
  RefreshControl,
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
const PRIMARY_ACTION_BG = "#F3C98B";
const PRIMARY_ACTION_TEXT = "#24150B";
const SECONDARY_ACTION_BG = "rgba(255,255,255,0.07)";

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

function getNearbySummaryLine(
  summary: NearbySummaryResponse,
  t: (key: string, params?: Record<string, string>) => string
) {
  const peopleLabel = copyOrFallback(t, "nearby.pulsePeople", "People");
  const onlineLabel = copyOrFallback(t, "nearby.pulseOnline", "Online");
  const nearbyLabel = copyOrFallback(t, "nearby.pulseNearby", "Nearby");
  return `${peopleLabel}: ${formatPulseCount(summary.totalUsersCount, t)} \u00B7 ${onlineLabel}: ${formatPulseCount(summary.onlineNowCount, t)} \u00B7 ${nearbyLabel}: ${formatPulseCount(summary.activeNearbyCount, t)}`;
}

function getPeopleGridLayout(width: number) {
  const compact = width <= 360;
  const large = width > 430;
  const columns = large ? 3 : 2;
  const horizontalPadding = compact ? 14 : 16;
  const columnGap = compact ? 14 : large ? 12 : 16;
  const rowGap = 14;
  const avatarSize = compact ? 118 : large ? 116 : 132;
  const tileHeight = compact ? 126 : large ? 124 : 140;
  const availableWidth = Math.max(
    0,
    width - horizontalPadding * 2 - columnGap * (columns - 1)
  );

  return {
    columns,
    horizontalPadding,
    columnGap,
    rowGap,
    avatarSize,
    tileWidth: Math.floor(availableWidth / columns),
    tileHeight,
  };
}

function getActivityShelfLayout(width: number) {
  if (width > 430) {
    return { cardWidth: 220, cardHeight: 112, cardGap: 12 };
  }
  if (width > 360) {
    return { cardWidth: 204, cardHeight: 110, cardGap: 10 };
  }
  return { cardWidth: 188, cardHeight: 108, cardGap: 10 };
}

export default function NearbyHubScreen() {
  const navigation = useNavigation<NearbyTabNavigationProp>();
  const { width, height } = useWindowDimensions();
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
  const [activitiesExpanded, setActivitiesExpanded] = useState(false);
  const [locationIssue, setLocationIssue] = useState<LocationIssue | null>(null);
  const [filtersSheetVisible, setFiltersSheetVisible] = useState(false);
  const [filtersApplying, setFiltersApplying] = useState(false);
  const [draftRadiusKm, setDraftRadiusKm] = useState<number>(DEFAULT_RADIUS_KM);
  const [draftGenderFilter, setDraftGenderFilter] =
    useState<GenderFilter>("all");
  const [draftAgeFilter, setDraftAgeFilter] = useState<AgeFilterId>("any");

  const active = visibility?.status === "active";
  const profileReady = isProfileReady(profile);
  const missingPreferenceField = getMissingNearbyPreferenceField(profile);
  const missingSafetyFields = loading ? [] : getMissingMatchingSafetyFields(profile);
  const matchingPreferencesReady = !missingPreferenceField;
  const genderFilter = getGenderFilter(profile);
  const ageFilter = getAgeFilter(profile);
  const sectionGap = 14;
  const smallGap = 8;
  const refreshDisabled = feedLoading || roomsLoading || toggleBusy || preferenceBusy || Boolean(roomActionBusyId);
  const visibleRooms = useMemo(
    () => rooms.slice(0, ROOM_CARD_LIMIT),
    [rooms]
  );
  const hasActivityContent = Boolean(
    visibleRooms.length || roomErrorText || roomPreferenceGateVisible
  );
  const peopleGridLayout = useMemo(
    () => getPeopleGridLayout(width),
    [width]
  );
  const activityShelfLayout = useMemo(
    () => getActivityShelfLayout(width),
    [width]
  );
  const firstPeopleCount = peopleGridLayout.columns * 2;

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
    if (roomPreferenceGateVisible) {
      setActivitiesExpanded(true);
    }
  }, [roomPreferenceGateVisible]);

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
        return true;
      }
      if ((options?.profileReady ?? profileReadyRef.current) === false) {
        setItems([]);
        setFeedLoading(false);
        return false;
      }
      if ((options?.matchingPreferencesReady ?? matchingPreferencesReadyRef.current) === false) {
        setItems([]);
        setFeedLoading(false);
        return false;
      }

      const requestId = ++feedRequestIdRef.current;
      setFeedLoading(true);
      setErrorText("");
      setLocationIssue(null);
      try {
        const location = await requestNearbyLocation();
        if (!mountedRef.current || requestId !== feedRequestIdRef.current) return false;
        if (location.ok === false) {
          setItems([]);
          setLocationIssue(location.issue);
          return false;
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
        if (!mountedRef.current || requestId !== feedRequestIdRef.current) return false;
        setVisibility(nextVisibility.visibility);
        setRadiusKm(nextVisibility.visibility.radiusKm ?? nextRadiusKm);
        setItems(response.items ?? []);
        return true;
      } catch (error) {
        if (!mountedRef.current || requestId !== feedRequestIdRef.current) return false;
        setItems([]);
        setErrorText(getBackendErrorText(error, t));
        return false;
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
      if (nextRadiusKm === radiusRef.current) return true;
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
      return true;
    },
    [refreshFeed, visibility]
  );

  const applyRadiusFilterChange = useCallback(
    async (nextRadiusKm: number) => {
      if (nextRadiusKm === radiusRef.current) return true;
      if (radiusRefreshTimerRef.current) {
        clearTimeout(radiusRefreshTimerRef.current);
        radiusRefreshTimerRef.current = null;
      }
      if (visibilityRef.current?.status !== "active") {
        return handleRadiusChange(nextRadiusKm);
      }
      const refreshed = await refreshFeed(visibilityRef.current, nextRadiusKm);
      if (refreshed) {
        radiusRef.current = nextRadiusKm;
      }
      return refreshed;
    },
    [handleRadiusChange, refreshFeed]
  );

  const handleGenderFilterChange = useCallback(
    async (next: GenderFilter) => {
      if (preferenceBusy) return false;
      setPreferenceBusy(true);
      setErrorText("");
      try {
        const updated = await updateUserFields({
          preferredGenders: next === "all" ? [] : [next],
        });
        if (!mountedRef.current) return false;
        setProfile(updated);
        if (visibility?.status === "active") {
          const refreshed = await refreshFeed(visibility, radiusRef.current, {
            profileReady: isProfileReady(updated),
            matchingPreferencesReady: !getMissingNearbyPreferenceField(updated),
          });
          if (!refreshed) return false;
        }
        return true;
      } catch (error) {
        if (!mountedRef.current) return false;
        setErrorText(getBackendErrorText(error, t));
        return false;
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
      if (preferenceBusy) return false;
      const option = AGE_FILTER_OPTIONS.find((item) => item.id === next) ?? AGE_FILTER_OPTIONS[0];
      setPreferenceBusy(true);
      setErrorText("");
      try {
        const updated = await updateUserFields({
          preferredAgeMin: option.min,
          preferredAgeMax: option.max,
        });
        if (!mountedRef.current) return false;
        setProfile(updated);
        if (visibility?.status === "active") {
          const refreshed = await refreshFeed(visibility, radiusRef.current, {
            profileReady: isProfileReady(updated),
            matchingPreferencesReady: !getMissingNearbyPreferenceField(updated),
          });
          if (!refreshed) return false;
        }
        return true;
      } catch (error) {
        if (!mountedRef.current) return false;
        setErrorText(getBackendErrorText(error, t));
        return false;
      } finally {
        if (mountedRef.current) {
          setPreferenceBusy(false);
        }
      }
    },
    [preferenceBusy, refreshFeed, t, visibility]
  );

  const filterSummaryText = useMemo(() => {
    const radiusLabel = copyOrFallback(t, "nearby.radiusKm", "{km} км", {
      km: String(radiusKm),
    });
    const genderLabel = copyOrFallback(
      t,
      `nearby.gender.${genderFilter}`,
      genderFilter === "all" ? "Все" : genderFilter
    );
    const ageLabel = getAgeFilterLabel(ageFilter, t);
    return copyOrFallback(
      t,
      "nearby.filters.summary",
      "{radius} · {gender} · {age}",
      { radius: radiusLabel, gender: genderLabel, age: ageLabel }
    );
  }, [ageFilter, genderFilter, radiusKm, t]);

  const openFiltersSheet = useCallback(() => {
    setDraftRadiusKm(radiusKm);
    setDraftGenderFilter(genderFilter);
    setDraftAgeFilter(ageFilter);
    setFiltersSheetVisible(true);
  }, [ageFilter, genderFilter, radiusKm]);

  const closeFiltersSheet = useCallback(() => {
    if (filtersApplying) return;
    setFiltersSheetVisible(false);
  }, [filtersApplying]);

  const resetDraftFilters = useCallback(() => {
    setDraftRadiusKm(DEFAULT_RADIUS_KM);
    setDraftGenderFilter("all");
    setDraftAgeFilter("any");
  }, []);

  const applyDraftFilters = useCallback(async () => {
    if (filtersApplying || preferenceBusy || toggleBusy) return;
    setFiltersApplying(true);
    try {
      let applied = true;
      if (draftRadiusKm !== radiusKm) {
        applied = (await applyRadiusFilterChange(draftRadiusKm)) && applied;
      }
      if (draftGenderFilter !== genderFilter) {
        applied = (await handleGenderFilterChange(draftGenderFilter)) && applied;
      }
      if (applied && draftAgeFilter !== ageFilter) {
        applied = (await handleAgeFilterChange(draftAgeFilter)) && applied;
      }
      if (applied && mountedRef.current) {
        setFiltersSheetVisible(false);
      }
    } finally {
      if (mountedRef.current) {
        setFiltersApplying(false);
      }
    }
  }, [
    ageFilter,
    draftAgeFilter,
    draftGenderFilter,
    draftRadiusKm,
    filtersApplying,
    genderFilter,
    applyRadiusFilterChange,
    handleAgeFilterChange,
    handleGenderFilterChange,
    preferenceBusy,
    radiusKm,
    toggleBusy,
  ]);

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
          setActivitiesExpanded(true);
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
          setActivitiesExpanded(true);
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
        <View style={styles.nearbyHeaderCard}>
          <View style={styles.headerTopRow}>
            <Text style={styles.title}>
            {copyOrFallback(t, "nearby.title", "Рядом")}
            </Text>
            {toggleBusy ? (
              <ActivityIndicator color="#F3C98B" />
            ) : (
              <Switch
                value={active}
                onValueChange={handleToggle}
                trackColor={{
                  false: "rgba(255,255,255,0.18)",
                  true: "rgba(243,201,139,0.42)",
                }}
                thumbColor={active ? "#F3C98B" : "#F5F5FF"}
              />
            )}
          </View>
          <Text style={styles.subtitle}>
            {copyOrFallback(
              t,
              "nearby.subtitle",
              "Люди поблизости, которые открыты к знакомству."
            )}
          </Text>
          {summary ? (
            <Text style={styles.headerCountsLine} numberOfLines={1}>
              {getNearbySummaryLine(summary, t)}
            </Text>
          ) : null}
        </View>

        {false ? (
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
                  true: "rgba(243,201,139,0.42)",
                }}
                thumbColor={active ? "#F3C98B" : "#F5F5FF"}
              />
            )}
          </View>

        </LinearGradient>
        ) : null}

        {active ? (
          <View style={styles.filterSummaryRow}>
            <View style={styles.filterSummaryPill}>
              <Text style={styles.filterSummaryText} numberOfLines={1}>
                {filterSummaryText}
              </Text>
            </View>
            <Pressable
              onPress={openFiltersSheet}
              disabled={filtersApplying || preferenceBusy || toggleBusy}
              style={[
                styles.filterSummaryButton,
                filtersApplying || preferenceBusy || toggleBusy ? styles.buttonDisabled : null,
              ]}
              accessibilityRole="button"
            >
              <Ionicons name="options-outline" size={16} color="#F3C98B" />
              <Text style={styles.filterSummaryButtonText}>
                {copyOrFallback(t, "nearby.filters.button", "Фильтры")}
              </Text>
            </Pressable>
            <Pressable
              onPress={refreshNearby}
              disabled={refreshDisabled}
              style={[
                styles.filterRefreshButton,
                refreshDisabled ? styles.buttonDisabled : null,
              ]}
              accessibilityRole="button"
            >
              <Ionicons name="refresh-outline" size={18} color="#E8EBFF" />
            </Pressable>
          </View>
        ) : null}

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
      errorText,
      filterSummaryText,
      filtersApplying,
      goToProfilePreferences,
      goToProfileSetup,
      handleToggle,
      missingSafetyFields,
      openFiltersSheet,
      preferenceBusy,
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

  const listContentStyle = useMemo(
    () => [
      styles.listContent,
      {
        paddingBottom: sectionGap,
      },
    ],
    [sectionGap]
  );

  const activityShelf = hasActivityContent ? (
    <NearbyRoomCardsSection
      rooms={visibleRooms}
      loading={roomsLoading}
      errorText={roomErrorText}
      preferenceGateVisible={roomPreferenceGateVisible}
      expanded={activitiesExpanded}
      busyRoomId={roomActionBusyId}
      onJoin={(room) => void handleJoinRoom(room)}
      onOpen={(room) => void handleOpenRoom(room)}
      onOpenPreferences={openActivityPreferences}
      onToggleExpanded={() => setActivitiesExpanded((current) => !current)}
      cardWidth={activityShelfLayout.cardWidth}
      cardHeight={activityShelfLayout.cardHeight}
      cardGap={activityShelfLayout.cardGap}
      t={t}
      locale={locale}
    />
  ) : null;

  return (
    <ScreenShell
      title={copyOrFallback(t, "tabs.nearby", "Рядом")}
      background="now"
      overlayOpacity={0.2}
      blurRadius={0}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={listContentStyle}
        refreshControl={
          <RefreshControl
            refreshing={feedLoading || (roomsLoading && !loading)}
            tintColor="#F3C98B"
            onRefresh={() => {
              if (active && !refreshDisabled) {
                refreshNearby();
              }
            }}
          />
        }
      >
        {header}
        {peopleSectionHeader}
        {peopleItems.length ? (
          <>
            <NearbyPeopleGrid
              items={firstPeopleItems}
              layout={peopleGridLayout}
              onOpen={openProfile}
              t={t}
            />
            {activityShelf}
            {remainingPeopleItems.length ? (
              <NearbyPeopleGrid
                items={remainingPeopleItems}
                layout={peopleGridLayout}
                onOpen={openProfile}
                t={t}
              />
            ) : null}
          </>
        ) : (
          <>
            <View style={styles.peopleEmptyWrap}>{renderEmpty()}</View>
            {activityShelf}
          </>
        )}
        <View style={{ height: smallGap }} />
      </ScrollView>
      <NearbyFiltersSheet
        visible={filtersSheetVisible}
        screenHeight={height}
        draftRadiusKm={draftRadiusKm}
        draftGenderFilter={draftGenderFilter}
        draftAgeFilter={draftAgeFilter}
        applying={filtersApplying}
        onChangeRadius={setDraftRadiusKm}
        onChangeGender={setDraftGenderFilter}
        onChangeAge={setDraftAgeFilter}
        onApply={applyDraftFilters}
        onReset={resetDraftFilters}
        onClose={closeFiltersSheet}
        t={t}
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

function NearbyFiltersSheet({
  visible,
  screenHeight,
  draftRadiusKm,
  draftGenderFilter,
  draftAgeFilter,
  applying,
  onChangeRadius,
  onChangeGender,
  onChangeAge,
  onApply,
  onReset,
  onClose,
  t,
}: {
  visible: boolean;
  screenHeight: number;
  draftRadiusKm: number;
  draftGenderFilter: GenderFilter;
  draftAgeFilter: AgeFilterId;
  applying: boolean;
  onChangeRadius: (value: number) => void;
  onChangeGender: (value: GenderFilter) => void;
  onChangeAge: (value: AgeFilterId) => void;
  onApply: () => void;
  onReset: () => void;
  onClose: () => void;
  t: (key: string, params?: Record<string, string>) => string;
}) {
  const sheetMaxHeight = Math.min(screenHeight * 0.72, 520);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.filterSheetBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.filterSheet, { maxHeight: sheetMaxHeight }]}>
          <View style={styles.filterSheetHandle} />
          <Pressable
            onPress={onClose}
            disabled={applying}
            style={[
              styles.filterSheetCloseButton,
              applying ? styles.buttonDisabled : null,
            ]}
            accessibilityRole="button"
          >
            <Ionicons name="close" size={18} color="#FFFFFF" />
          </Pressable>
          <Text style={styles.filterSheetTitle}>
            {copyOrFallback(t, "nearby.filters.title", "Фильтры Рядом")}
          </Text>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.filterSheetContent}
          >
            <Text style={styles.filterSheetSectionLabel}>
              {copyOrFallback(t, "nearby.filters.radius", "Радиус")}
            </Text>
            <View style={styles.filterSheetChipRow}>
              {RADIUS_OPTIONS.map((option) => {
                const active = draftRadiusKm === option;
                return (
                  <Pressable
                    key={option}
                    disabled={applying}
                    onPress={() => onChangeRadius(option)}
                    style={[
                      styles.filterSheetChip,
                      active ? styles.filterSheetChipActive : null,
                      applying ? styles.buttonDisabled : null,
                    ]}
                    accessibilityRole="button"
                  >
                    <Text
                      style={[
                        styles.filterSheetChipText,
                        active ? styles.filterSheetChipTextActive : null,
                      ]}
                    >
                      {copyOrFallback(t, "nearby.radiusKm", "{km} км", {
                        km: String(option),
                      })}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.filterSheetSectionLabel}>
              {copyOrFallback(t, "nearby.filters.who", "Кого показывать")}
            </Text>
            <View style={styles.filterSheetChipRow}>
              {GENDER_FILTERS.map((option) => {
                const active = draftGenderFilter === option;
                return (
                  <Pressable
                    key={option}
                    disabled={applying}
                    onPress={() => onChangeGender(option)}
                    style={[
                      styles.filterSheetChip,
                      active ? styles.filterSheetChipActive : null,
                      applying ? styles.buttonDisabled : null,
                    ]}
                    accessibilityRole="button"
                  >
                    <Text
                      style={[
                        styles.filterSheetChipText,
                        active ? styles.filterSheetChipTextActive : null,
                      ]}
                    >
                      {copyOrFallback(
                        t,
                        `nearby.gender.${option}`,
                        option === "all" ? "Все" : option
                      )}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.filterSheetSectionLabel}>
              {copyOrFallback(t, "nearby.filters.age", "Возраст")}
            </Text>
            <View style={styles.filterSheetChipRow}>
              {AGE_FILTER_OPTIONS.map((option) => {
                const active = draftAgeFilter === option.id;
                return (
                  <Pressable
                    key={option.id}
                    disabled={applying}
                    onPress={() => onChangeAge(option.id)}
                    style={[
                      styles.filterSheetChip,
                      active ? styles.filterSheetChipActive : null,
                      applying ? styles.buttonDisabled : null,
                    ]}
                    accessibilityRole="button"
                  >
                    <Text
                      style={[
                        styles.filterSheetChipText,
                        active ? styles.filterSheetChipTextActive : null,
                      ]}
                    >
                      {getAgeFilterLabel(option.id, t)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          <View style={styles.filterSheetFooter}>
            <Pressable
              onPress={onApply}
              disabled={applying}
              style={[
                styles.filterSheetApplyButton,
                applying ? styles.buttonDisabled : null,
              ]}
              accessibilityRole="button"
            >
              <Text style={styles.filterSheetApplyText}>
                {copyOrFallback(t, "nearby.filters.apply", "Применить")}
              </Text>
            </Pressable>
            <Pressable
              onPress={onReset}
              disabled={applying}
              style={[
                styles.filterSheetResetButton,
                applying ? styles.buttonDisabled : null,
              ]}
              accessibilityRole="button"
            >
              <Text style={styles.filterSheetResetText}>
                {copyOrFallback(t, "nearby.filters.reset", "Сбросить")}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function ActivityExpandedPanel({
  rooms,
  loading,
  errorText,
  preferenceGateVisible,
  busyRoomId,
  onJoin,
  onOpen,
  onOpenPreferences,
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
  t: (key: string, params?: Record<string, string>) => string;
  locale: string;
}) {
  return (
    <View style={styles.activityExpandedPanel}>
      {preferenceGateVisible ? (
        <View style={styles.activityPreferenceGate}>
          <Text style={styles.activityPreferenceGateTitle}>
            {copyOrFallback(
              t,
              "nearby.activityPreferences.requiredTitle",
              "Choose nearby activities"
            )}
          </Text>
          <Pressable
            onPress={onOpenPreferences}
            style={styles.activityPreferenceGateButton}
            accessibilityRole="button"
          >
            <Text style={styles.activityPreferenceGateButtonText}>
              {copyOrFallback(
                t,
                "nearby.activityPreferences.requiredButton",
                "Choose activities"
              )}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {errorText ? (
        <View style={styles.activityErrorRow}>
          <Ionicons name="alert-circle-outline" size={16} color="#FFD2DA" />
          <Text style={styles.activityErrorText}>{errorText}</Text>
        </View>
      ) : null}

      {loading && !rooms.length ? (
        <View style={styles.activityLoadingRow}>
          <ActivityIndicator size="small" color="#F3C98B" />
        </View>
      ) : null}

      {rooms.map((room) => (
        <ActivityExpandedRow
          key={room.id}
          room={room}
          busy={busyRoomId === room.id}
          disabled={Boolean(busyRoomId)}
          onJoin={() => onJoin(room)}
          onOpen={() => onOpen(room)}
          t={t}
          locale={locale}
        />
      ))}
    </View>
  );
}

function ActivityExpandedRow({
  room,
  busy,
  disabled,
  onJoin,
  onOpen,
  t,
  locale,
}: {
  room: NearbyRoomCard;
  busy: boolean;
  disabled: boolean;
  onJoin: () => void;
  onOpen: () => void;
  t: (key: string, params?: Record<string, string>) => string;
  locale: string;
}) {
  const action = getNearbyRoomAction(room, t);
  const canAct = action.kind === "join" || action.kind === "open";
  const meta = formatActivityRowMeta(room, t, locale);

  return (
    <View style={styles.activityExpandedRow}>
      <View style={styles.activityExpandedIcon}>
        <Ionicons name="chatbubbles-outline" size={15} color="#F3C98B" />
      </View>
      <View style={styles.activityExpandedCopy}>
        <Text style={styles.activityExpandedTitle} numberOfLines={1}>
          {room.title}
        </Text>
        <Text style={styles.activityExpandedMeta} numberOfLines={1}>
          {meta}
        </Text>
      </View>
      <Pressable
        disabled={!canAct || disabled || busy}
        onPress={action.kind === "join" ? onJoin : action.kind === "open" ? onOpen : undefined}
        style={[
          styles.activityExpandedButton,
          canAct ? styles.activityExpandedButtonEnabled : styles.activityExpandedButtonDisabled,
          disabled || busy ? styles.buttonDisabled : null,
        ]}
        accessibilityRole="button"
      >
        {busy ? (
          <ActivityIndicator size="small" color={PRIMARY_ACTION_TEXT} />
        ) : (
          <Text
            style={[
              styles.activityExpandedButtonText,
              canAct
                ? styles.activityExpandedButtonTextEnabled
                : styles.activityExpandedButtonTextDisabled,
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
  );
}

function formatActivityRowMeta(
  room: NearbyRoomCard,
  t: (key: string, params?: Record<string, string>) => string,
  locale: string
) {
  const parts = [
    formatNearbyRoomStartsAt(room.startsAt, locale),
    normalizeOptionalRoomLabel(room.locationLabel),
    copyOrFallback(t, "nearby.rooms.members", "{count}", {
      count: String(Math.max(0, room.memberCount)),
    }),
  ].filter(Boolean);

  return parts.join(" \u00B7 ");
}

function NearbyPeopleGrid({
  items,
  layout,
  onOpen,
  t,
}: {
  items: NearbyProfileFeedItemDto[];
  layout: ReturnType<typeof getPeopleGridLayout>;
  onOpen: (item: NearbyProfileFeedItemDto) => void;
  t: (key: string, params?: Record<string, string>) => string;
}) {
  return (
    <View
      style={[
        styles.peopleGrid,
        {
          paddingHorizontal: layout.horizontalPadding,
          columnGap: layout.columnGap,
          rowGap: layout.rowGap,
        },
      ]}
    >
      {items.map((item) => (
        <NearbyProfileCardSlot
          key={item.userId}
          item={item}
          onOpen={() => onOpen(item)}
          tileWidth={layout.tileWidth}
          tileHeight={layout.tileHeight}
          avatarSize={layout.avatarSize}
          t={t}
        />
      ))}
    </View>
  );
}

function NearbyRoomCardsSection({
  rooms,
  loading,
  errorText,
  preferenceGateVisible,
  expanded,
  busyRoomId,
  onJoin,
  onOpen,
  onOpenPreferences,
  onToggleExpanded,
  cardWidth,
  cardHeight,
  cardGap,
  t,
  locale,
}: {
  rooms: NearbyRoomCard[];
  loading: boolean;
  errorText: string;
  preferenceGateVisible: boolean;
  expanded: boolean;
  busyRoomId: string | null;
  onJoin: (room: NearbyRoomCard) => void;
  onOpen: (room: NearbyRoomCard) => void;
  onOpenPreferences: () => void;
  onToggleExpanded: () => void;
  cardWidth: number;
  cardHeight: number;
  cardGap: number;
  t: (key: string, params?: Record<string, string>) => string;
  locale: string;
}) {
  return (
    <View style={styles.roomsSection}>
      <View style={styles.roomsHeader}>
        <Pressable
          onPress={onToggleExpanded}
          style={styles.roomsHeaderTitleButton}
          accessibilityRole="button"
        >
        <Text style={styles.roomsTitle} numberOfLines={1}>
          {copyOrFallback(t, "nearby.rooms.title", "Активности рядом")}
        </Text>
        </Pressable>
        <View style={styles.roomsHeaderActions}>
          {loading ? <ActivityIndicator size="small" color="#F3C98B" /> : null}
          <Pressable
            onPress={onOpenPreferences}
            style={styles.roomsConfigureButton}
            accessibilityRole="button"
          >
            <Text
              style={styles.roomsConfigureText}
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
          <Pressable
            onPress={onToggleExpanded}
            style={styles.roomsExpandButton}
            accessibilityRole="button"
          >
            <Ionicons
              name={expanded ? "chevron-up" : "chevron-down"}
              size={18}
              color="#F3C98B"
            />
          </Pressable>
        </View>
      </View>

      {errorText ? (
        <View style={styles.roomsError}>
          <Ionicons name="alert-circle-outline" size={16} color="#FFD2DA" />
          <Text style={styles.roomsErrorText}>{errorText}</Text>
        </View>
      ) : null}

      {false ? (
        <View style={styles.roomsPreferenceGate}>
          <View style={styles.roomsPreferenceGateHeader}>
            <View style={styles.roomsPreferenceGateIcon}>
              <Ionicons name="options-outline" size={18} color="#F3C98B" />
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
              paddingHorizontal: 14,
              paddingRight: 14 + cardGap,
            },
          ]}
        >
          {rooms.map((room) => (
            <NearbyRoomCardView
              key={room.id}
              room={room}
              cardWidth={cardWidth}
              cardHeight={cardHeight}
              primaryColor={PRIMARY_ACTION_BG}
              accentColor="#F3C98B"
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

      {expanded ? (
        <View style={styles.roomsExpandedPanel}>
          {preferenceGateVisible ? (
            <View style={styles.roomsPreferenceGate}>
              <View style={styles.roomsPreferenceGateHeader}>
                <View style={styles.roomsPreferenceGateIcon}>
                  <Ionicons name="options-outline" size={18} color="#F3C98B" />
                </View>
                <View style={styles.roomsPreferenceGateCopy}>
                  <Text style={styles.roomsPreferenceGateTitle}>
                    {copyOrFallback(
                      t,
                      "nearby.activityPreferences.requiredTitle",
                      "Choose nearby activities"
                    )}
                  </Text>
                  <Text style={styles.roomsPreferenceGateBody}>
                    {copyOrFallback(
                      t,
                      "nearby.activityPreferences.requiredBody",
                      "Choose activities before joining a nearby activity."
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
                    "Choose activities"
                  )}
                </Text>
              </Pressable>
            </View>
          ) : null}
          {rooms.map((room) => (
            <ActivityExpandedRow
              key={room.id}
              room={room}
              busy={busyRoomId === room.id}
              disabled={Boolean(busyRoomId)}
              onJoin={() => onJoin(room)}
              onOpen={() => onOpen(room)}
              t={t}
              locale={locale}
            />
          ))}
        </View>
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
            <ActivityIndicator size="small" color={PRIMARY_ACTION_TEXT} />
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
  tileWidth,
  tileHeight,
  avatarSize,
  t,
}: {
  item: NearbyProfileFeedItemDto;
  onOpen: () => void;
  tileWidth: number;
  tileHeight: number;
  avatarSize: number;
  t: (key: string, params?: Record<string, string>) => string;
}) {
  const ageLabel = getNearbyPersonAgeLabel(item, t);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.displayName}
      onPress={onOpen}
      style={({ pressed }) => [
        styles.personTile,
        { width: tileWidth, height: tileHeight },
        pressed ? styles.personTilePressed : null,
      ]}
    >
      <View
        style={[
          styles.personAvatarCircle,
          {
            width: avatarSize,
            height: avatarSize,
            borderRadius: avatarSize / 2,
          },
        ]}
      >
        <NearbyCardMedia item={item} />
        <View style={styles.personAvatarOverlay} pointerEvents="none">
          <Text
            style={styles.personAvatarName}
            numberOfLines={1}
            ellipsizeMode="tail"
            maxFontSizeMultiplier={1}
          >
            {item.displayName}
          </Text>
          {ageLabel ? (
            <Text
              style={styles.personAvatarAge}
              numberOfLines={1}
              ellipsizeMode="tail"
              maxFontSizeMultiplier={1}
            >
              {ageLabel}
            </Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

function getNearbyPersonAgeLabel(
  item: NearbyProfileFeedItemDto,
  t: (key: string, params?: Record<string, string>) => string
) {
  if (typeof item.age === "number" && Number.isFinite(item.age) && item.age >= 0) {
    return String(Math.floor(item.age));
  }
  return item.ageGroup ? getAgeFilterLabel(item.ageGroup, t) : "";
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
  nearbyBody: {
    alignItems: "flex-start",
  },
  activityExpandedPanel: {
    marginHorizontal: 14,
    marginTop: 8,
    gap: 8,
  },
  activityPreferenceGate: {
    marginBottom: 8,
    borderRadius: 16,
    padding: 10,
    backgroundColor: "rgba(243, 201, 139, 0.11)",
    borderWidth: 1,
    borderColor: "rgba(243, 201, 139, 0.24)",
    gap: 8,
  },
  activityPreferenceGateTitle: {
    color: "#FFFFFF",
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "900",
  },
  activityPreferenceGateButton: {
    minHeight: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
    paddingHorizontal: 12,
    backgroundColor: PRIMARY_ACTION_BG,
    borderWidth: 1,
    borderColor: "rgba(255,219,159,0.55)",
  },
  activityPreferenceGateButtonText: {
    color: PRIMARY_ACTION_TEXT,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "900",
  },
  activityErrorRow: {
    minHeight: 44,
    marginBottom: 8,
    borderRadius: 14,
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "rgba(255, 77, 103, 0.13)",
    borderWidth: 1,
    borderColor: "rgba(255, 210, 218, 0.20)",
  },
  activityErrorText: {
    flex: 1,
    color: "#FFD2DA",
    fontSize: 12,
    lineHeight: 16,
  },
  activityLoadingRow: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  activityExpandedRow: {
    minHeight: 56,
    marginBottom: 0,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "rgba(9,14,32,0.72)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  activityExpandedIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(243,201,139,0.10)",
  },
  activityExpandedCopy: {
    flex: 1,
    minWidth: 0,
  },
  activityExpandedTitle: {
    color: "#FFFFFF",
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "900",
  },
  activityExpandedMeta: {
    marginTop: 2,
    color: "rgba(226,232,255,0.68)",
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "800",
  },
  activityExpandedButton: {
    height: 30,
    minWidth: 86,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  activityExpandedButtonEnabled: {
    backgroundColor: PRIMARY_ACTION_BG,
    borderWidth: 1,
    borderColor: "rgba(255,219,159,0.55)",
  },
  activityExpandedButtonDisabled: {
    backgroundColor: SECONDARY_ACTION_BG,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  activityExpandedButtonText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "900",
  },
  activityExpandedButtonTextEnabled: {
    color: PRIMARY_ACTION_TEXT,
  },
  activityExpandedButtonTextDisabled: {
    color: "rgba(226,232,255,0.66)",
  },
  peopleGrid: {
    alignSelf: "stretch",
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-start",
  },
  peopleGridEmpty: {
    flex: 1,
    alignSelf: "stretch",
  },
  peopleEmptyWrap: {
    marginHorizontal: 14,
  },
  personTile: {
    alignItems: "center",
    justifyContent: "flex-start",
    margin: 0,
    padding: 0,
    borderWidth: 0,
    borderRadius: 0,
    backgroundColor: "transparent",
  },
  personTilePressed: {
    opacity: 0.86,
    transform: [{ scale: 0.98 }],
  },
  personAvatarCircle: {
    position: "relative",
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "rgba(243,201,139,0.72)",
    backgroundColor: "rgba(9,14,32,0.72)",
  },
  personAvatarOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingVertical: 5,
    paddingHorizontal: 4,
    backgroundColor: "rgba(5,8,18,0.62)",
  },
  personAvatarName: {
    color: "#FFFFFF",
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "900",
    textAlign: "center",
  },
  personAvatarAge: {
    color: "rgba(226,232,255,0.88)",
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "800",
    textAlign: "center",
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
    gap: 0,
    paddingTop: 0,
    paddingBottom: 8,
  },
  nearbyHeaderCard: {
    marginHorizontal: 14,
    marginTop: 8,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 64,
    borderRadius: 22,
    backgroundColor: "rgba(4,8,20,0.62)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  title: {
    color: theme.colors.text,
    fontSize: 24,
    lineHeight: 28,
    fontWeight: "900",
  },
  subtitle: {
    color: "rgba(226,232,255,0.76)",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
    marginTop: 4,
  },
  headerCountsLine: {
    color: "#F3C98B",
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "700",
    marginTop: 5,
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
  filterSummaryRow: {
    marginHorizontal: 14,
    marginBottom: 12,
    height: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  filterSummaryPill: {
    flex: 1,
    height: 40,
    borderRadius: 20,
    paddingHorizontal: 12,
    justifyContent: "center",
    backgroundColor: "rgba(10,16,28,0.70)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  filterSummaryText: {
    color: "rgba(226,232,255,0.88)",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
  },
  filterSummaryButton: {
    height: 40,
    minWidth: 94,
    borderRadius: 20,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  filterSummaryButtonText: {
    color: "#F3C98B",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "900",
  },
  filterRefreshButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  filterSheetBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.38)",
  },
  filterSheet: {
    width: "100%",
    minHeight: 320,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: "rgba(7,11,21,0.98)",
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  filterSheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.24)",
    alignSelf: "center",
    marginBottom: 14,
  },
  filterSheetCloseButton: {
    position: "absolute",
    top: 12,
    right: 16,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  filterSheetTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    lineHeight: 24,
    fontWeight: "900",
    marginBottom: 14,
    paddingRight: 42,
  },
  filterSheetContent: {
    paddingBottom: 4,
  },
  filterSheetSectionLabel: {
    color: "#F3C98B",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.7,
    marginBottom: 8,
  },
  filterSheetChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  filterSheetChip: {
    height: 34,
    justifyContent: "center",
    borderRadius: 17,
    paddingHorizontal: 12,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  filterSheetChipActive: {
    backgroundColor: "rgba(243,201,139,0.18)",
    borderColor: "rgba(243,201,139,0.46)",
  },
  filterSheetChipText: {
    color: "rgba(226,232,255,0.84)",
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "900",
  },
  filterSheetChipTextActive: {
    color: "#F3C98B",
  },
  filterSheetFooter: {
    height: 52,
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  filterSheetApplyButton: {
    height: 48,
    flex: 1,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: PRIMARY_ACTION_BG,
    borderWidth: 1,
    borderColor: "rgba(255,219,159,0.55)",
  },
  filterSheetApplyText: {
    color: PRIMARY_ACTION_TEXT,
    fontSize: 15,
    lineHeight: 18,
    fontWeight: "900",
  },
  filterSheetResetButton: {
    height: 48,
    width: 104,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  filterSheetResetText: {
    color: "#F3C98B",
    fontSize: 14,
    lineHeight: 17,
    fontWeight: "900",
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
    marginTop: 14,
    marginBottom: 14,
    paddingVertical: 10,
    backgroundColor: "rgba(4,8,20,0.38)",
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
  roomsHeaderTitleButton: {
    flex: 1,
    minWidth: 0,
    height: 28,
    justifyContent: "center",
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
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    paddingHorizontal: 8,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(243, 201, 139, 0.20)",
  },
  roomsConfigureText: {
    color: "#F3C98B",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "900",
  },
  roomsExpandButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  roomsError: {
    marginHorizontal: 14,
    marginBottom: 8,
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
    minHeight: 86,
    marginBottom: 8,
    gap: 10,
    borderRadius: 18,
    padding: 12,
    backgroundColor: "rgba(243,201,139,0.10)",
    borderWidth: 1,
    borderColor: "rgba(243,201,139,0.30)",
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
    backgroundColor: PRIMARY_ACTION_BG,
    borderWidth: 1,
    borderColor: "rgba(255,219,159,0.55)",
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
  roomsExpandedPanel: {
    marginHorizontal: 14,
    marginTop: 8,
    gap: 8,
  },
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
    color: "rgba(226,232,255,0.76)",
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "700",
  },
  roomCompactFooter: {
    height: 32,
    marginTop: "auto",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  roomMetaPill: {
    height: 24,
    maxWidth: 82,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 12,
    paddingHorizontal: 8,
    backgroundColor: "rgba(255,255,255,0.07)",
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
    minWidth: 86,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
    paddingHorizontal: 10,
  },
  roomActionButtonEnabled: {
    borderWidth: 1,
    borderColor: "rgba(255,219,159,0.55)",
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
    color: PRIMARY_ACTION_TEXT,
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
