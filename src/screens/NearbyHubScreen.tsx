import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
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
import UserAvatar from "@/components/UserAvatar";
import { useLocale } from "@/contexts/LocaleContext";
import type { NearbyTabNavigationProp } from "@/navigation/appRoutes";
import { ApiError } from "@/services/api/apiClient";
import * as chatApi from "@/services/api/chatApi";
import * as nearbyApi from "@/services/api/nearbyApi";
import type {
  AgeGroup,
  NearbyProfileFeedItemDto,
  NearbyProfileStatusKind,
  NearbyProfileVisibilityDto,
} from "@/services/api/types";
import { setNearbyEnabled } from "@/services/locationPrivacy";
import { getUserProfile, updateUserFields } from "@/services/user";
import type { ProfileGender, UserProfile } from "@/models/User";
import { theme } from "@/theme";

type LocationIssue = "permissionDenied" | "permissionBlocked" | "readFailed";
type GenderFilter = "all" | ProfileGender;
type AgeFilterId = "any" | AgeGroup;

const RADIUS_OPTIONS = [5, 25, 100, 250] as const;
const FEED_LIMIT = 30;
const DEFAULT_RADIUS_KM = 25;
const DEFAULT_STATUS_KIND: NearbyProfileStatusKind = "open_to_suggestions";

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

function isProfileReady(profile: UserProfile | null) {
  return Boolean(profile?.birthDate && profile.displayName?.trim());
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

export default function NearbyHubScreen() {
  const navigation = useNavigation<NearbyTabNavigationProp>();
  const { width } = useWindowDimensions();
  const { t } = useLocale();
  const mountedRef = useRef(true);
  const visibilityRef = useRef<NearbyProfileVisibilityDto | null>(null);
  const radiusRef = useRef(DEFAULT_RADIUS_KM);
  const profileReadyRef = useRef(false);
  const feedRequestIdRef = useRef(0);
  const radiusRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [visibility, setVisibility] = useState<NearbyProfileVisibilityDto | null>(null);
  const [items, setItems] = useState<NearbyProfileFeedItemDto[]>([]);
  const [radiusKm, setRadiusKm] = useState(DEFAULT_RADIUS_KM);
  const [loading, setLoading] = useState(true);
  const [feedLoading, setFeedLoading] = useState(false);
  const [toggleBusy, setToggleBusy] = useState(false);
  const [preferenceBusy, setPreferenceBusy] = useState(false);
  const [openingUserId, setOpeningUserId] = useState<string | null>(null);
  const [errorText, setErrorText] = useState("");
  const [locationIssue, setLocationIssue] = useState<LocationIssue | null>(null);

  const active = visibility?.status === "active";
  const profileReady = isProfileReady(profile);
  const genderFilter = getGenderFilter(profile);
  const ageFilter = getAgeFilter(profile);
  const columns = width >= 350 ? 2 : 1;

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

  const refreshFeed = useCallback(
    async (
      baseVisibility: NearbyProfileVisibilityDto | null,
      nextRadiusKm: number,
      options?: { profileReady?: boolean }
    ) => {
      if (baseVisibility?.status !== "active") {
        setItems([]);
        return;
      }
      if ((options?.profileReady ?? profileReadyRef.current) === false) {
        setItems([]);
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
    setLoading(true);
    setErrorText("");
    setLocationIssue(null);
    try {
      const [me, currentProfile] = await Promise.all([
        nearbyApi.getNearbyMe(),
        getUserProfile(),
      ]);
      if (!mountedRef.current) return;
      setProfile(currentProfile);
      setVisibility(me.visibility);
      setRadiusKm(me.visibility.radiusKm ?? DEFAULT_RADIUS_KM);
      if (me.visibility.status === "active" && isProfileReady(currentProfile)) {
        await refreshFeed(me.visibility, me.visibility.radiusKm ?? DEFAULT_RADIUS_KM, {
          profileReady: true,
        });
      } else {
        setItems([]);
      }
    } catch (error) {
      if (!mountedRef.current) return;
      setItems([]);
      setErrorText(getBackendErrorText(error, t));
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [refreshFeed, t]);

  useFocusEffect(
    useCallback(() => {
      void loadInitial();
    }, [loadInitial])
  );

  const enableVisibility = useCallback(async () => {
    if (!profileReady) {
      setErrorText(
        copyOrFallback(
          t,
          "nearby.errorProfileSetup",
          "Заполните профиль, чтобы Рядом мог подобрать людей честно."
        )
      );
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
      await refreshFeed(response.visibility, response.visibility.radiusKm ?? radiusRef.current);
    } catch (error) {
      if (!mountedRef.current) return;
      setErrorText(getBackendErrorText(error, t));
    } finally {
      if (mountedRef.current) {
        setToggleBusy(false);
      }
    }
  }, [profileReady, radiusKm, refreshFeed, t, visibility]);

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
    } catch (error) {
      if (!mountedRef.current) return;
      setErrorText(getBackendErrorText(error, t));
    } finally {
      if (mountedRef.current) {
        setToggleBusy(false);
      }
    }
  }, [t]);

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
      });
    },
    [navigation]
  );

  const openMessage = useCallback(
    async (item: NearbyProfileFeedItemDto) => {
      if (!item.canMessage || openingUserId) return;
      setOpeningUserId(item.userId);
      setErrorText("");
      try {
        const thread = await chatApi.openDirectThread(item.userId, {
          type: "nearby",
          sourceId: item.userId,
        });
        navigation.navigate("DMChat", {
          threadId: thread.id,
          peerId: item.userId,
          peerName: item.displayName,
          sourceContext: { source: "nearby" },
        });
      } catch (error) {
        setErrorText(getBackendErrorText(error, t));
      } finally {
        if (mountedRef.current) {
          setOpeningUserId(null);
        }
      }
    },
    [navigation, openingUserId, t]
  );

  const goToProfileSetup = useCallback(() => {
    navigation.navigate("Profile", {
      screen: "EditProfile",
      params: { focus: "birthDate" },
    });
  }, [navigation]);

  const widenRadius = useCallback(() => {
    const currentIndex = RADIUS_OPTIONS.findIndex((value) => value === radiusKm);
    const next = RADIUS_OPTIONS[Math.min(currentIndex + 1, RADIUS_OPTIONS.length - 1)];
    if (next) {
      handleRadiusChange(next);
    }
  }, [handleRadiusChange, radiusKm]);

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

        <View style={styles.controlPanel}>
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
                  false: "rgba(255,255,255,0.20)",
                  true: "rgba(245, 205, 139, 0.42)",
                }}
                thumbColor={active ? "#F3C98B" : "#F5F5FF"}
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
        </View>

        {errorText ? (
          <View style={styles.errorPanel}>
            <Ionicons name="alert-circle-outline" size={18} color="#FFD2DA" />
            <Text style={styles.errorText}>{errorText}</Text>
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
      preferenceBusy,
      profile,
      radiusKm,
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
        action: copyOrFallback(t, "nearby.emptyProfileAction", "Заполнить профиль"),
        onPress: goToProfileSetup,
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
        action: copyOrFallback(t, "nearby.emptyOffAction", "Показывать меня"),
        onPress: enableVisibility,
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
        action: copyOrFallback(t, "nearby.emptyRefreshAction", "Обновить"),
        onPress: () => void refreshFeed(visibility, radiusKm),
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
      action:
        radiusKm < 250
          ? copyOrFallback(t, "nearby.emptyWidenAction", "Расширить радиус")
          : copyOrFallback(t, "nearby.emptyRefreshAction", "Обновить"),
      onPress: radiusKm < 250 ? widenRadius : () => void refreshFeed(visibility, radiusKm),
    };
  }, [
    active,
    enableVisibility,
    feedLoading,
    goToProfileSetup,
    loading,
    locationIssue,
    profileReady,
    radiusKm,
    refreshFeed,
    t,
    visibility,
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
        <Pressable style={styles.emptyButton} onPress={emptyState.onPress}>
          <Text style={styles.emptyButtonText}>{emptyState.action}</Text>
        </Pressable>
      </View>
    );
  }, [emptyState, feedLoading, loading, t]);

  const renderCard = useCallback(
    ({ item }: { item: NearbyProfileFeedItemDto }) => (
      <View style={[styles.cardSlot, columns > 1 ? styles.cardSlotGrid : styles.cardSlotList]}>
        <NearbyProfileCard
          item={item}
          opening={openingUserId === item.userId}
          onOpen={() => openProfile(item)}
          onMessage={() => void openMessage(item)}
          t={t}
        />
      </View>
    ),
    [columns, openMessage, openProfile, openingUserId, t]
  );

  return (
    <ScreenShell
      title={copyOrFallback(t, "tabs.nearby", "Рядом")}
      background="now"
      overlayOpacity={0.2}
      blurRadius={0}
    >
      <FlatList
        key={columns}
        data={active && profileReady ? items : []}
        numColumns={columns}
        keyExtractor={(item) => item.userId}
        renderItem={renderCard}
        ListHeaderComponent={header}
        ListEmptyComponent={renderEmpty}
        columnWrapperStyle={columns > 1 ? styles.columnWrap : undefined}
        contentContainerStyle={styles.listContent}
        refreshing={feedLoading}
        onRefresh={() => {
          if (active) {
            void refreshFeed(visibility, radiusKm);
          }
        }}
      />
    </ScreenShell>
  );
}

function NearbyProfileCard({
  item,
  opening,
  onOpen,
  onMessage,
  t,
}: {
  item: NearbyProfileFeedItemDto;
  opening: boolean;
  onOpen: () => void;
  onMessage: () => void;
  t: (key: string, params?: Record<string, string>) => string;
}) {
  const details = [
    item.ageGroup,
    copyOrFallback(t, `nearby.distance.${item.distanceBucket}`, item.distanceBucket),
  ].filter(Boolean);
  const profileLabels = [
    item.nearbyStatus ??
      (item.statusKind ? copyOrFallback(t, `nearby.statusKind.${item.statusKind}`, "") : ""),
    item.goal ? copyOrFallback(t, `profile.goal.${item.goal}`, item.goal) : "",
    item.mood ? copyOrFallback(t, `profile.mood.${item.mood}`, item.mood) : "",
  ].filter(Boolean);
  const photos = item.publicPhotos.slice(0, 2);

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <UserAvatar avatarUrl={item.avatarUrl ?? undefined} label={item.displayName} size={38} />
        <View style={styles.cardIdentity}>
          <Text style={styles.cardName} numberOfLines={1}>
            {item.displayName}
          </Text>
          <Text style={styles.cardMeta} numberOfLines={1}>
            {details.join(" · ")}
          </Text>
        </View>
      </View>

      {profileLabels.length ? (
        <Text style={styles.profileLine} numberOfLines={1}>
          {profileLabels.join(" · ")}
        </Text>
      ) : null}

      {item.interests.length ? (
        <View style={styles.chipRow}>
          {item.interests.slice(0, 3).map((interest) => (
            <View key={interest} style={styles.interestChip}>
              <Text style={styles.interestText} numberOfLines={1}>
                {interest}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {photos.length ? (
        <View style={styles.photoRow}>
          {photos.map((photo) => (
            <Image
              key={photo.mediaId}
              source={{ uri: photo.url }}
              style={styles.photoPreview}
            />
          ))}
        </View>
      ) : null}

      <View style={styles.actionRow}>
        <Pressable style={styles.secondaryButton} onPress={onOpen}>
          <Ionicons name="person-outline" size={13} color="#F3C98B" />
          <Text style={styles.secondaryButtonText}>
            {copyOrFallback(t, "nearby.openProfile", "Открыть")}
          </Text>
        </Pressable>
        <Pressable
          style={[
            styles.primaryButton,
            !item.canMessage || opening ? styles.buttonDisabled : null,
          ]}
          disabled={!item.canMessage || opening}
          onPress={onMessage}
        >
          {opening ? (
            <ActivityIndicator color="#24150B" size="small" />
          ) : (
            <>
              <Ionicons name="chatbubble-outline" size={13} color="#24150B" />
              <Text style={styles.primaryButtonText}>
                {copyOrFallback(t, "nearby.message", "Написать")}
              </Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: 0,
    paddingBottom: 18,
    gap: 8,
  },
  columnWrap: {
    alignItems: "stretch",
  },
  cardSlot: {
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  cardSlotGrid: {
    width: "50%",
  },
  cardSlotList: {
    width: "100%",
  },
  headerArea: {
    gap: 12,
    paddingTop: 2,
    paddingBottom: 10,
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
  controlPanel: {
    borderRadius: 16,
    padding: 12,
    gap: 12,
    backgroundColor: "rgba(10, 16, 24, 0.86)",
    borderWidth: 1,
    borderColor: "rgba(245, 205, 139, 0.24)",
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  toggleText: {
    flex: 1,
    gap: 4,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: "800",
  },
  privacyNote: {
    color: "#BDC3D6",
    fontSize: 12,
    lineHeight: 16,
  },
  filterGroup: {
    gap: 8,
  },
  filterLabel: {
    color: "#F3C98B",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  segmentRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  segment: {
    minHeight: 32,
    justifyContent: "center",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  segmentActive: {
    backgroundColor: "rgba(185, 130, 114, 0.24)",
    borderColor: "rgba(245, 205, 139, 0.42)",
  },
  segmentDisabled: {
    opacity: 0.55,
  },
  segmentText: {
    color: "#D9DEEC",
    fontSize: 12,
    fontWeight: "700",
  },
  segmentTextActive: {
    color: "#F3C98B",
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 9,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  summaryText: {
    flex: 1,
    color: "#E9ECF7",
    fontSize: 13,
    lineHeight: 17,
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
  card: {
    flex: 1,
    minWidth: 0,
    borderRadius: 14,
    padding: 9,
    gap: 7,
    backgroundColor: "rgba(12, 18, 28, 0.88)",
    borderWidth: 1,
    borderColor: "rgba(245, 205, 139, 0.20)",
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cardIdentity: {
    flex: 1,
    minWidth: 0,
  },
  cardName: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: "900",
  },
  cardMeta: {
    color: "#B9C0D3",
    fontSize: 11,
    marginTop: 2,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 8,
    backgroundColor: "rgba(243, 201, 139, 0.10)",
  },
  statusText: {
    flex: 1,
    color: "#FFE7B8",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
  },
  profileLine: {
    color: "#E9ECF7",
    fontSize: 11,
    fontWeight: "700",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  interestChip: {
    maxWidth: "100%",
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 4,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  interestText: {
    color: "#DCE1F2",
    fontSize: 10,
    fontWeight: "700",
  },
  photoRow: {
    flexDirection: "row",
    gap: 5,
  },
  photoPreview: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  actionRow: {
    flexDirection: "row",
    gap: 6,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(245, 205, 139, 0.30)",
  },
  secondaryButtonText: {
    color: "#F3C98B",
    fontSize: 11,
    fontWeight: "800",
  },
  primaryButton: {
    flex: 1,
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    borderRadius: 10,
    backgroundColor: "#F3C98B",
  },
  primaryButtonText: {
    color: "#24150B",
    fontSize: 11,
    fontWeight: "900",
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
  emptyButton: {
    marginTop: 4,
    minHeight: 38,
    justifyContent: "center",
    borderRadius: 12,
    paddingHorizontal: 14,
    backgroundColor: "#F3C98B",
  },
  emptyButtonText: {
    color: "#24150B",
    fontSize: 13,
    fontWeight: "900",
  },
});
