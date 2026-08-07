import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
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
  buildNearbyFilterSummaryLabels,
  formatLocalizedCount,
} from "@/services/localizedCounts";
import { buildProfileCompatibilityHints } from "@/services/profileCompatibility";
import {
  beginNearbyProfileRefresh,
  canShowNearbyIncompleteProfile,
  completeNearbyProfileRefresh,
  failNearbyProfileRefresh,
  type NearbyProfileLoadState,
} from "@/services/nearbyProfileLoadState";
import {
  buildNearbyPersonAccessibilityLabel,
  buildNearbyPersonMetadata,
  formatNearbyDistanceAccessibility,
  formatNearbyDistanceBucket,
  getNearbyPeopleGridLayout,
} from "@/services/nearbyPresentation";
import {
  getMissingMatchingSafetyFields,
  getUserProfile,
  updateUserFields,
  type MatchingSafetyField,
} from "@/services/user";
import { PROFILE_UPDATED_EVENT } from "@/services/session/authEvents";
import type { ProfileGender, UserProfile } from "@/models/User";
import { theme } from "@/theme";
import { getNearbyActivityArt } from "@/assets/nearby/activityArt";

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
const ACCENT_COLOR = theme.colors.textAccent;
const PRIMARY_ACTION_BG = theme.colors.primaryActionBg;
const PRIMARY_ACTION_TEXT = theme.colors.primaryActionText;
const PRIMARY_ACTION_BORDER = theme.colors.primaryActionBorder;

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

function getActivityButtonTitleFallback(locale: string) {
  const language = getLanguageCode(locale);
  if (language === "ru") return "Активности";
  if (language === "hr") return "Aktivnosti";
  return "Activities";
}

function getActivitiesSheetSubtitleFallback(locale: string) {
  const language = getLanguageCode(locale);
  if (language === "ru") return "Группы не занимают место в ленте людей.";
  if (language === "hr") return "Grupe ostaju odvojene od liste ljudi.";
  return "Groups stay separate from the people feed.";
}

function getActivitiesSheetEmptyFallback(locale: string) {
  const language = getLanguageCode(locale);
  if (language === "ru") return "Пока нет активностей рядом.";
  if (language === "hr") return "Trenutno nema aktivnosti u blizini.";
  return "No nearby activities right now.";
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

    let position: Location.LocationObject | null = null;
    try {
      position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
    } catch {
      position = await Location.getLastKnownPositionAsync();
    }
    if (!position) return { ok: false, issue: "readFailed" };
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
  const [profileLoadState, setProfileLoadState] = useState<NearbyProfileLoadState>("loading");
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
  const [activitiesSheetVisible, setActivitiesSheetVisible] = useState(false);
  const [locationIssue, setLocationIssue] = useState<LocationIssue | null>(null);
  const [filtersSheetVisible, setFiltersSheetVisible] = useState(false);
  const [filtersApplying, setFiltersApplying] = useState(false);
  const [draftRadiusKm, setDraftRadiusKm] = useState<number>(DEFAULT_RADIUS_KM);
  const [draftGenderFilter, setDraftGenderFilter] =
    useState<GenderFilter>("all");
  const [draftAgeFilter, setDraftAgeFilter] = useState<AgeFilterId>("any");

  const active = visibility?.status === "active";
  const profileStateAuthoritative = canShowNearbyIncompleteProfile(profileLoadState);
  const profileReady = profileStateAuthoritative && isProfileReady(profile);
  const missingPreferenceField = profileStateAuthoritative
    ? getMissingNearbyPreferenceField(profile)
    : null;
  const missingSafetyFields = profileStateAuthoritative
    ? getMissingMatchingSafetyFields(profile)
    : [];
  const matchingPreferencesReady = !missingPreferenceField;
  const genderFilter = getGenderFilter(profile);
  const ageFilter = getAgeFilter(profile);
  const sectionGap = 14;
  const smallGap = 8;
  const refreshDisabled = feedLoading || roomsLoading || toggleBusy || preferenceBusy || Boolean(roomActionBusyId);
  const hasActivityContent = Boolean(
    rooms.length || roomErrorText || roomPreferenceGateVisible
  );
  const peopleGridLayout = useMemo(
    () => getNearbyPeopleGridLayout(width),
    [width]
  );

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
      setActivitiesSheetVisible(true);
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
    if (!profileReadyRef.current) {
      setLoading(true);
    }
    setProfileLoadState(beginNearbyProfileRefresh);
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
      setProfileLoadState(completeNearbyProfileRefresh());
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
      setProfileLoadState(failNearbyProfileRefresh);
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

  useEffect(() => {
    let previousState = AppState.currentState;
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (previousState.match(/inactive|background/) && nextState === "active") {
        void loadInitial();
      }
      previousState = nextState;
    });
    return () => subscription.remove();
  }, [loadInitial]);

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

  const filterSummaryLabels = useMemo(() => {
    const radiusLabel = copyOrFallback(t, "nearby.radiusKm", "{km} км", {
      km: String(radiusKm),
    });
    const genderLabel = copyOrFallback(
      t,
      `nearby.gender.${genderFilter}`,
      genderFilter === "all" ? "Все" : genderFilter
    );
    const ageLabel = getAgeFilterLabel(ageFilter, t);
    return buildNearbyFilterSummaryLabels(radiusLabel, genderLabel, ageLabel);
  }, [ageFilter, genderFilter, radiusKm, t]);

  const activityButtonLabel = useMemo(() => {
    if (roomPreferenceGateVisible) {
      return copyOrFallback(
        t,
        "nearby.activityPreferences.requiredButton",
        getActivityButtonTitleFallback(locale)
      );
    }

    const title = copyOrFallback(
      t,
      "nearby.rooms.title",
      getActivityButtonTitleFallback(locale)
    );
    return rooms.length ? `${title} \u00B7 ${rooms.length}` : title;
  }, [locale, roomPreferenceGateVisible, rooms.length, t]);

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

  const openActivitiesSheet = useCallback(() => {
    setActivitiesSheetVisible(true);
  }, []);

  const closeActivitiesSheet = useCallback(() => {
    setActivitiesSheetVisible(false);
  }, []);

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
    setActivitiesSheetVisible(false);
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
          setActivitiesSheetVisible(true);
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
        setActivitiesSheetVisible(false);
        navigation.navigate("NearbyRoomChat", {
          roomId: response.roomId,
          title: response.title || room.title,
        });
      } catch (error) {
        if (!mountedRef.current) return;
        if (isNearbyActivityPreferenceRequiredError(error)) {
          setRoomPreferenceGateVisible(true);
          setActivitiesSheetVisible(true);
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
              <ActivityIndicator color={ACCENT_COLOR} />
            ) : (
              <Switch
                value={active}
                onValueChange={handleToggle}
                trackColor={{
                  false: "rgba(255,255,255,0.18)",
                  true: "rgba(230,185,118,0.42)",
                }}
                thumbColor={active ? ACCENT_COLOR : "#F5F5FF"}
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
        <View
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
              <ActivityIndicator color={ACCENT_COLOR} />
            ) : (
              <Switch
                value={active}
                onValueChange={handleToggle}
                trackColor={{
                  false: "rgba(255,255,255,0.18)",
                  true: "rgba(230,185,118,0.42)",
                }}
                thumbColor={active ? ACCENT_COLOR : "#F5F5FF"}
              />
            )}
          </View>

        </View>
        ) : null}

        {active ? (
          <View style={styles.filterControls}>
            <ScrollView
              horizontal
              style={styles.filterSummaryScroll}
              contentContainerStyle={styles.filterSummaryScrollContent}
              showsHorizontalScrollIndicator={false}
              nestedScrollEnabled
              accessibilityRole="summary"
            >
              {filterSummaryLabels.map((label, index) => (
                <View key={`${index}-${label}`} style={styles.filterSummaryPill}>
                  <Text style={styles.filterSummaryText}>{label}</Text>
                </View>
              ))}
            </ScrollView>
            <View style={styles.filterSummaryRow}>
              <Pressable
                onPress={openFiltersSheet}
                disabled={filtersApplying || preferenceBusy || toggleBusy}
                style={[
                  styles.filterSummaryButton,
                  filtersApplying || preferenceBusy || toggleBusy ? styles.buttonDisabled : null,
                ]}
                accessibilityRole="button"
              >
                <Ionicons name="options-outline" size={16} color={ACCENT_COLOR} />
                <Text style={styles.filterSummaryButtonText}>
                  {copyOrFallback(t, "nearby.filters.button", "Фильтры")}
                </Text>
              </Pressable>
              {hasActivityContent ? (
                <Pressable
                  onPress={openActivitiesSheet}
                  style={styles.activitiesEntryButton}
                  accessibilityRole="button"
                >
                  <Ionicons name="chatbubbles-outline" size={15} color={ACCENT_COLOR} />
                  <Text
                    style={styles.activitiesEntryButtonText}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.82}
                  >
                    {activityButtonLabel}
                  </Text>
                </Pressable>
              ) : null}
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
          </View>
        ) : null}

        {missingSafetyFields.length ? (
          <View style={styles.completionPanel}>
            <View style={styles.completionIcon}>
              <Ionicons name="shield-checkmark-outline" size={18} color={ACCENT_COLOR} />
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
      activityButtonLabel,
      errorText,
      filterSummaryLabels,
      filtersApplying,
      goToProfilePreferences,
      goToProfileSetup,
      handleToggle,
      hasActivityContent,
      missingSafetyFields,
      openActivitiesSheet,
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
    if (!canShowNearbyIncompleteProfile(profileLoadState)) return null;

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
    profileLoadState,
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
          <ActivityIndicator color={ACCENT_COLOR} />
          <Text style={styles.emptyTitle}>
            {copyOrFallback(t, "nearby.loading", "Загружаем Рядом…")}
          </Text>
        </View>
      );
    }

    if (!emptyState) return null;
    return (
      <View style={styles.emptyPanel}>
        <Ionicons name={emptyState.icon} size={30} color={ACCENT_COLOR} />
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
  const primaryPeople = peopleItems.slice(0, 4);
  const remainingPeople = peopleItems.slice(4);

  return (
    <ScreenShell
      title={copyOrFallback(t, "tabs.nearby", "Рядом")}
      background="nearbyHarborV6"
      blurRadius={0}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={listContentStyle}
        refreshControl={
          <RefreshControl
            refreshing={feedLoading || (roomsLoading && !loading)}
            tintColor={ACCENT_COLOR}
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
        {primaryPeople.length ? (
          <NearbyPeopleGrid
            selfProfile={profile}
            items={primaryPeople}
            layout={peopleGridLayout}
            onOpen={openProfile}
            t={t}
          />
        ) : (
          <View style={styles.peopleEmptyWrap}>{renderEmpty()}</View>
        )}
        <View style={styles.roomsShelfSection}>
          <View style={styles.roomsShelfHeader}>
            <Text style={styles.roomsShelfTitle}>
              {copyOrFallback(t, "nearby.rooms.title", "Активности рядом")}
            </Text>
            <Pressable
              onPress={openActivitiesSheet}
              style={styles.roomsShelfSeeAll}
              accessibilityRole="button"
            >
              <Text style={styles.roomsShelfSeeAllText}>
                {copyOrFallback(t, "nearby.rooms.seeAll", "Смотреть все")}
              </Text>
            </Pressable>
          </View>
          {roomsLoading && !rooms.length ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.roomsShelfContent}
            >
              {[0, 1, 2].map((index) => (
                <View key={index} style={styles.roomShelfSkeleton} />
              ))}
            </ScrollView>
          ) : roomErrorText ? (
            <View style={styles.roomsShelfState}>
              <Text style={styles.roomsShelfStateText}>{roomErrorText}</Text>
            </View>
          ) : roomPreferenceGateVisible ? (
            <Pressable
              style={styles.roomsShelfState}
              onPress={openActivityPreferences}
              accessibilityRole="button"
            >
              <Text style={styles.roomsShelfStateText}>
                {copyOrFallback(
                  t,
                  "nearby.activityPreferences.requiredBody",
                  "Choose activities before joining a nearby activity."
                )}
              </Text>
            </Pressable>
          ) : rooms.length ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              decelerationRate="fast"
              contentContainerStyle={styles.roomsShelfContent}
            >
              {rooms.map((room) => {
                const action = getNearbyRoomAction(room, t);
                const canAct = action.kind === "join" || action.kind === "open";
                return (
                  <Pressable
                    key={room.id}
                    style={styles.roomShelfCard}
                    disabled={!canAct || Boolean(roomActionBusyId)}
                    onPress={
                      action.kind === "join"
                        ? () => void handleJoinRoom(room)
                        : action.kind === "open"
                          ? () => void handleOpenRoom(room)
                          : undefined
                    }
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !canAct || Boolean(roomActionBusyId) }}
                  >
                    <Image
                      source={getNearbyActivityArt(room.typeKey)}
                      style={styles.roomShelfCover}
                      resizeMode="cover"
                      accessible={false}
                    />
                    <View style={styles.roomShelfCopy}>
                      <Text style={styles.roomShelfCardTitle} numberOfLines={2}>
                        {room.title}
                      </Text>
                      <Text style={styles.roomShelfMeta} numberOfLines={2}>
                        {formatActivityRowMeta(room, t, locale)}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : (
            <View style={styles.roomsShelfState}>
              <Text style={styles.roomsShelfStateText}>
                {getActivitiesSheetEmptyFallback(locale)}
              </Text>
            </View>
          )}
        </View>
        {remainingPeople.length ? (
          <NearbyPeopleGrid
            selfProfile={profile}
            items={remainingPeople}
            layout={peopleGridLayout}
            onOpen={openProfile}
            t={t}
          />
        ) : null}
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
      <NearbyActivitiesSheet
        visible={activitiesSheetVisible}
        screenHeight={height}
        rooms={rooms}
        loading={roomsLoading}
        errorText={roomErrorText}
        preferenceGateVisible={roomPreferenceGateVisible}
        busyRoomId={roomActionBusyId}
        onJoin={(room) => void handleJoinRoom(room)}
        onOpen={(room) => void handleOpenRoom(room)}
        onOpenPreferences={openActivityPreferences}
        onClose={closeActivitiesSheet}
        t={t}
        locale={locale}
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
        <View
          key={metric.key}
          style={styles.statCard}
        >
          <View style={styles.statIconFrame}>
            {loading && !summary ? (
              <ActivityIndicator size="small" color={ACCENT_COLOR} />
            ) : (
              <Ionicons name={metric.icon} size={20} color={ACCENT_COLOR} />
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
        </View>
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

function NearbyActivitiesSheet({
  visible,
  screenHeight,
  rooms,
  loading,
  errorText,
  preferenceGateVisible,
  busyRoomId,
  onJoin,
  onOpen,
  onOpenPreferences,
  onClose,
  t,
  locale,
}: {
  visible: boolean;
  screenHeight: number;
  rooms: NearbyRoomCard[];
  loading: boolean;
  errorText: string;
  preferenceGateVisible: boolean;
  busyRoomId: string | null;
  onJoin: (room: NearbyRoomCard) => void;
  onOpen: (room: NearbyRoomCard) => void;
  onOpenPreferences: () => void;
  onClose: () => void;
  t: (key: string, params?: Record<string, string>) => string;
  locale: string;
}) {
  const sheetMaxHeight = screenHeight * 0.72;
  const showEmpty = !preferenceGateVisible && !errorText && !loading && !rooms.length;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.activitiesSheetBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.activitiesSheet, { maxHeight: sheetMaxHeight }]}>
          <View style={styles.filterSheetHandle} />
          <View style={styles.activitiesSheetHeader}>
            <View style={styles.activitiesSheetTitleCopy}>
              <Text style={styles.activitiesSheetTitle}>
                {copyOrFallback(
                  t,
                  "nearby.rooms.title",
                  getActivityButtonTitleFallback(locale)
                )}
              </Text>
              <Text style={styles.activitiesSheetSubtitle}>
                {copyOrFallback(
                  t,
                  "nearby.rooms.separateSubtitle",
                  getActivitiesSheetSubtitleFallback(locale)
                )}
              </Text>
            </View>
            <View style={styles.activitiesSheetHeaderActions}>
              <Pressable
                onPress={onOpenPreferences}
                style={styles.activitiesSheetConfigureButton}
                accessibilityRole="button"
              >
                <Text style={styles.activitiesSheetConfigureText}>
                  {copyOrFallback(
                    t,
                    "nearby.activityPreferences.configure",
                    getActivityConfigureFallback(locale)
                  )}
                </Text>
              </Pressable>
              <Pressable
                onPress={onClose}
                style={styles.activitiesSheetCloseButton}
                accessibilityRole="button"
              >
                <Ionicons
                  name="close"
                  size={theme.buttons.icon.iconSize}
                  color={theme.buttons.icon.iconColor}
                />
              </Pressable>
            </View>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.activitiesSheetContent}
          >
            {preferenceGateVisible ? (
              <View style={styles.activityPreferenceGate}>
                <Text style={styles.activityPreferenceGateTitle}>
                  {copyOrFallback(
                    t,
                    "nearby.activityPreferences.requiredTitle",
                    "Choose nearby activities"
                  )}
                </Text>
                <Text style={styles.activityPreferenceGateBody}>
                  {copyOrFallback(
                    t,
                    "nearby.activityPreferences.requiredBody",
                    "Choose activities before joining a nearby activity."
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
                <ActivityIndicator size="small" color={ACCENT_COLOR} />
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

            {showEmpty ? (
              <Text style={styles.activitiesSheetEmptyText}>
                {getActivitiesSheetEmptyFallback(locale)}
              </Text>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
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
      <Image
        source={getNearbyActivityArt(room.typeKey)}
        style={styles.activityExpandedArt}
        resizeMode="cover"
        accessible={false}
      />
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
    formatLocalizedCount(
      t,
      locale as "en" | "ru" | "hr",
      "nearby.rooms.members",
      room.memberCount
    ),
  ].filter(Boolean);

  return parts.join(" \u00B7 ");
}

function NearbyPeopleGrid({
  items,
  selfProfile,
  layout,
  onOpen,
  t,
}: {
  items: NearbyProfileFeedItemDto[];
  selfProfile: UserProfile | null;
  layout: ReturnType<typeof getNearbyPeopleGridLayout>;
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
          selfProfile={selfProfile}
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
  selfProfile,
  onOpen,
  tileWidth,
  tileHeight,
  avatarSize,
  t,
}: {
  item: NearbyProfileFeedItemDto;
  selfProfile: UserProfile | null;
  onOpen: () => void;
  tileWidth: number;
  tileHeight: number;
  avatarSize: number;
  t: (key: string, params?: Record<string, string>) => string;
}) {
  const ageLabel = getNearbyPersonAgeLabel(item, t);
  const distanceLabel = formatNearbyDistanceBucket(item.distanceBucket, t);
  const metadataLabel = buildNearbyPersonMetadata(ageLabel, distanceLabel);
  const accessibilityLabel = buildNearbyPersonAccessibilityLabel(
    item.displayName,
    ageLabel,
    formatNearbyDistanceAccessibility(item.distanceBucket, t)
  );
  const compatibility = buildProfileCompatibilityHints(selfProfile, item);
  const primaryReason = compatibility.reasons[0];
  const compatibilityLabel = primaryReason?.kind === "goal"
    ? t("compatibility.badgeGoal")
    : primaryReason?.kind === "interest" && primaryReason.value
      ? t("compatibility.reasonInterest", { value: primaryReason.value })
      : primaryReason?.kind === "age"
        ? t("compatibility.reasonAge")
        : "";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
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
        {compatibilityLabel ? (
          <View
            style={[styles.compatibilityBadge, { maxWidth: avatarSize - 18 }]}
            pointerEvents="none"
          >
            <Text style={styles.compatibilityBadgeText} numberOfLines={1}>
              {compatibilityLabel}
            </Text>
          </View>
        ) : null}
        <View style={styles.personAvatarOverlay} pointerEvents="none">
          <Text
            style={styles.personAvatarName}
            numberOfLines={1}
            ellipsizeMode="tail"
            maxFontSizeMultiplier={1}
          >
            {item.displayName}
          </Text>
          {metadataLabel ? (
            <Text
              style={styles.personAvatarMeta}
              numberOfLines={1}
              ellipsizeMode="tail"
              maxFontSizeMultiplier={1}
              adjustsFontSizeToFit
              minimumFontScale={0.88}
            >
              {metadataLabel}
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
  roomsShelfSection: {
    marginTop: 16,
    gap: 10,
  },
  roomsShelfHeader: {
    minHeight: 44,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  roomsShelfTitle: {
    flex: 1,
    color: theme.colors.textWarm,
    fontFamily: "serif",
    fontSize: 18,
    lineHeight: 23,
    fontWeight: "600",
  },
  roomsShelfSeeAll: {
    minHeight: 44,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  roomsShelfSeeAllText: {
    color: theme.colors.gold,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
  },
  roomsShelfContent: {
    paddingHorizontal: 16,
    gap: 10,
  },
  roomShelfCard: {
    width: 158,
    height: 190,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "transparent",
    borderWidth: 0,
  },
  roomShelfCover: {
    width: "100%",
    height: 96,
  },
  roomShelfCopy: {
    flex: 1,
    padding: 10,
  },
  roomShelfCardTitle: {
    color: theme.colors.textWarm,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "600",
  },
  roomShelfMeta: {
    marginTop: 4,
    color: theme.colors.textSecondary,
    fontSize: 11,
    lineHeight: 15,
  },
  roomShelfSkeleton: {
    width: 158,
    height: 190,
    borderRadius: 20,
    backgroundColor: "rgba(5,8,22,0.22)",
    borderWidth: 1,
    borderColor: "rgba(230,185,118,0.12)",
  },
  roomsShelfState: {
    minHeight: 72,
    marginHorizontal: 16,
    padding: 14,
    justifyContent: "center",
    backgroundColor: "transparent",
    borderWidth: 0,
  },
  roomsShelfStateText: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  nearbyBody: {
    alignItems: "flex-start",
  },
  activityPreferenceGate: {
    marginBottom: 8,
    borderRadius: theme.cards.warning.borderRadius,
    padding: theme.cards.warning.padding,
    backgroundColor: theme.cards.warning.backgroundColor,
    borderWidth: 1,
    borderColor: theme.cards.warning.borderColor,
    gap: 8,
  },
  activityPreferenceGateTitle: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "900",
  },
  activityPreferenceGateBody: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
  },
  activityPreferenceGateButton: {
    minHeight: theme.buttons.primary.height,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.buttons.primary.borderRadius,
    paddingHorizontal: theme.buttons.primary.paddingHorizontal,
    backgroundColor: theme.buttons.primary.backgroundColor,
    borderWidth: theme.buttons.primary.borderWidth,
    borderColor: theme.buttons.primary.borderColor,
  },
  activityPreferenceGateButtonText: {
    color: theme.buttons.primary.textColor,
    fontSize: theme.buttons.primary.fontSize,
    lineHeight: theme.buttons.primary.lineHeight,
    fontWeight: theme.buttons.primary.fontWeight,
  },
  activityErrorRow: {
    minHeight: 44,
    marginBottom: 8,
    borderRadius: 14,
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "rgba(217,92,75,0.13)",
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
    width: "100%",
    minHeight: 76,
    marginBottom: 0,
    padding: 10,
    backgroundColor: "transparent",
    borderWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  activityExpandedArt: {
    width: 52,
    height: 52,
    borderRadius: 14,
  },
  activityExpandedCopy: {
    flex: 1,
    minWidth: 0,
  },
  activityExpandedTitle: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "600",
  },
  activityExpandedMeta: {
    marginTop: 2,
    color: theme.colors.textSecondary,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "800",
  },
  activityExpandedButton: {
    minHeight: 44,
    minWidth: 90,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  activityExpandedButtonEnabled: {
    backgroundColor: theme.buttons.primary.backgroundColor,
    borderWidth: theme.buttons.primary.borderWidth,
    borderColor: theme.buttons.primary.borderColor,
  },
  activityExpandedButtonDisabled: {
    backgroundColor: theme.buttons.secondary.backgroundColor,
    borderWidth: theme.buttons.secondary.borderWidth,
    borderColor: theme.buttons.secondary.borderColor,
  },
  activityExpandedButtonText: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "700",
  },
  activityExpandedButtonTextEnabled: {
    color: theme.buttons.primary.textColor,
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
    borderColor: "rgba(255,210,170,0.72)",
    backgroundColor: "rgba(5,8,22,0.22)",
  },
  personAvatarOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 4,
    paddingTop: 4,
    paddingBottom: 6,
    gap: 1,
    backgroundColor: "transparent",
  },
  compatibilityBadge: {
    position: "absolute",
    top: 7,
    right: 7,
    minHeight: 22,
    justifyContent: "center",
    paddingHorizontal: 7,
    borderRadius: 999,
    backgroundColor: "rgba(5,8,22,0.18)",
    borderWidth: 0,
  },
  compatibilityBadgeText: {
    color: theme.colors.textAccent,
    fontSize: 10,
    fontWeight: "900",
  },
  personAvatarName: {
    color: "#FFFFFF",
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "900",
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.68)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  personAvatarMeta: {
    color: "rgba(240,242,248,0.92)",
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "800",
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.72)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
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
    marginTop: 6,
    marginBottom: 8,
    paddingHorizontal: 13,
    paddingVertical: 10,
    minHeight: 58,
    backgroundColor: "transparent",
    borderWidth: 0,
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  title: {
    color: theme.colors.text,
    fontSize: 22,
    lineHeight: 26,
    fontWeight: "900",
  },
  subtitle: {
    color: "rgba(226,232,255,0.76)",
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "600",
    marginTop: 3,
  },
  headerCountsLine: {
    color: ACCENT_COLOR,
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
    paddingHorizontal: 9,
    paddingVertical: 8,
    backgroundColor: "transparent",
    borderWidth: 0,
    shadowOpacity: 0,
    elevation: 0,
  },
  statIconFrame: {
    width: 31,
    height: 31,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
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
    textShadowColor: "rgba(230,185,118,0.18)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 5,
  },
  controlPanel: {
    marginTop: 6,
    padding: 12,
    gap: 10,
    backgroundColor: "transparent",
    borderWidth: 0,
    shadowOpacity: 0,
    elevation: 0,
  },
  completionPanel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: theme.shapes.cardInner,
    backgroundColor: theme.colors.warningBg,
    borderWidth: 1,
    borderColor: theme.colors.borderWarm,
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
    backgroundColor: PRIMARY_ACTION_BG,
  },
  completionButtonText: {
    color: PRIMARY_ACTION_TEXT,
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
  filterControls: {
    marginHorizontal: 14,
    marginBottom: 10,
    gap: 7,
  },
  filterSummaryRow: {
    height: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  filterSummaryScroll: {
    flexGrow: 0,
    height: 32,
  },
  filterSummaryScrollContent: {
    alignItems: "center",
    gap: 6,
    paddingRight: 2,
  },
  filterSummaryPill: {
    height: 32,
    borderRadius: 16,
    paddingHorizontal: 12,
    justifyContent: "center",
    backgroundColor: "transparent",
    borderWidth: 0,
  },
  filterSummaryText: {
    color: "rgba(226,232,255,0.88)",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
  },
  filterSummaryButton: {
    height: 40,
    minWidth: 88,
    borderRadius: 20,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  filterSummaryButtonText: {
    color: ACCENT_COLOR,
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
  activitiesEntryButton: {
    height: 38,
    maxWidth: 126,
    minWidth: 38,
    borderRadius: 19,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: theme.colors.surfaceWarm,
    borderWidth: 1,
    borderColor: theme.colors.borderWarm,
  },
  activitiesEntryButtonText: {
    flexShrink: 1,
    color: theme.colors.textAccent,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "900",
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
  activitiesSheetBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.44)",
  },
  activitiesSheet: {
    width: "100%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 18,
    backgroundColor: theme.sheets.backgroundColor,
    borderTopWidth: 1,
    borderColor: theme.sheets.borderColor,
  },
  activitiesSheetHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 12,
  },
  activitiesSheetTitleCopy: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  activitiesSheetTitle: {
    color: theme.colors.textPrimary,
    fontSize: 20,
    lineHeight: 24,
    fontWeight: "900",
  },
  activitiesSheetSubtitle: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
  },
  activitiesSheetHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  activitiesSheetConfigureButton: {
    height: 36,
    borderRadius: 18,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.buttons.secondary.backgroundColor,
    borderWidth: theme.buttons.secondary.borderWidth,
    borderColor: theme.buttons.secondary.borderColor,
  },
  activitiesSheetConfigureText: {
    color: theme.buttons.secondary.textColor,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: theme.buttons.secondary.fontWeight,
  },
  activitiesSheetCloseButton: {
    width: theme.buttons.icon.width,
    height: theme.buttons.icon.height,
    borderRadius: theme.buttons.icon.borderRadius,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.buttons.icon.backgroundColor,
    borderWidth: theme.buttons.icon.borderWidth,
    borderColor: theme.buttons.icon.borderColor,
  },
  activitiesSheetContent: {
    gap: 8,
    paddingBottom: 4,
  },
  activitiesSheetEmptyText: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
    paddingVertical: 10,
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
    color: ACCENT_COLOR,
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
    backgroundColor: theme.colors.chipActiveBg,
    borderColor: theme.colors.chipActiveBorder,
  },
  filterSheetChipText: {
    color: "rgba(226,232,255,0.84)",
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "900",
  },
  filterSheetChipTextActive: {
    color: ACCENT_COLOR,
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
    borderColor: PRIMARY_ACTION_BORDER,
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
    color: ACCENT_COLOR,
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
    backgroundColor: "rgba(217,92,75,0.16)",
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
  card: {
    alignItems: "center",
    paddingTop: 10,
    paddingHorizontal: 8,
    paddingBottom: 9,
    overflow: "hidden",
    backgroundColor: "transparent",
    borderWidth: 0,
  },
  cardPressed: {
    opacity: 0.86,
    transform: [{ scale: 0.98 }],
  },
  cardAvatarFrame: {
    position: "relative",
    overflow: "hidden",
    backgroundColor: "rgba(5,8,22,0.28)",
    borderWidth: 0,
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
    backgroundColor: "rgba(5,8,22,0.28)",
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
    backgroundColor: "transparent",
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
    padding: 18,
    gap: 9,
    backgroundColor: "transparent",
    borderWidth: 0,
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
    backgroundColor: PRIMARY_ACTION_BG,
  },
  emptyButtonSecondary: {
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: theme.colors.borderWarm,
  },
  emptyButtonText: {
    color: PRIMARY_ACTION_TEXT,
    fontSize: 13,
    fontWeight: "900",
  },
  emptyButtonSecondaryText: {
    color: ACCENT_COLOR,
  },
});
