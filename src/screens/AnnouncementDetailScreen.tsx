import React from "react";
import {
  Alert,
  BackHandler,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type AlertButton,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";

import ScreenShell from "@/components/ScreenShell";
import CoreStateCard from "@/components/CoreStateCard";
import UserAvatar from "@/components/UserAvatar";
import { useAuth } from "@/contexts/AuthContext";
import { useLocale } from "@/contexts/LocaleContext";
import {
  type AnnouncementDetailRouteProp,
  type RootStackNavigationProp,
} from "@/navigation/appRoutes";
import { goBackOrOpenAnnouncements } from "@/navigation/nearbyNavigation";
import * as announcementsApi from "@/services/api/announcementsApi";
import {
  mapAnnouncementDtoToNearbyAnnouncement,
  type NearbyAnnouncement,
} from "@/services/announcementsModel";
import * as safetyApi from "@/services/api/safetyApi";
import type { SafetyReportReason } from "@/services/api/safetyApi";
import { theme } from "@/theme";
import { formatAgoLong } from "@/utils/timeAgo";
import { makeAndroidSafeReportReasonButtons } from "@/utils/safetyReportReasonAlert";

type AnnouncementResponseMode = "own" | "direct_dm" | "unavailable";

type AnnouncementResponsePresentation = {
  title: string;
  body: string;
  actionLabel: string;
  busyLabel: string;
  buttonVariant: "primary" | "secondary";
};

function copyOrFallback(
  t: (key: string, params?: Record<string, string>) => string,
  key: string
) {
  return t(key);
}

function resolveAnnouncementResponseMode(params: {
  announcement: NearbyAnnouncement | null;
  currentUid: string;
  override?: AnnouncementResponseMode | null;
}): AnnouncementResponseMode {
  if (params.override) {
    return params.override;
  }

  const authorUid = String(params.announcement?.authorUid ?? "").trim();
  if (
    params.announcement?.isMine ||
    (authorUid && params.currentUid && authorUid === params.currentUid)
  ) {
    return "own";
  }
  if (authorUid && params.currentUid) {
    return "direct_dm";
  }
  return "unavailable";
}

function buildAnnouncementResponsePresentation(
  t: (key: string, params?: Record<string, string>) => string,
  mode: AnnouncementResponseMode,
  hasResponded: boolean
): AnnouncementResponsePresentation {
  switch (mode) {
    case "own":
      return {
        title: copyOrFallback(t, "nearby.detail.ownTitle"),
        body: copyOrFallback(
          t, "nearby.detail.ownBody"
        ),
        actionLabel: copyOrFallback(t, "common.close"),
        busyLabel: copyOrFallback(t, "common.close"),
        buttonVariant: "secondary",
      };
    case "direct_dm":
      return {
        title: copyOrFallback(
          t, hasResponded ? "nearby.detail.chatReadyTitle" : "nearby.detail.chatTitle"
        ),
        body: copyOrFallback(
          t, hasResponded ? "nearby.detail.chatReadyBody" : "nearby.detail.chatBody"
        ),
        actionLabel: hasResponded
          ? copyOrFallback(t, "nearby.detail.openChat")
          : copyOrFallback(t, "nearby.detail.messageAuthor"),
        busyLabel: copyOrFallback(t, "nearby.detail.openingChat"),
        buttonVariant: "primary",
      };
    case "unavailable":
      return {
        title: copyOrFallback(
          t, "nearby.detail.unavailableTitle"
        ),
        body: copyOrFallback(
          t, "nearby.detail.unavailableBody"
        ),
        actionLabel: copyOrFallback(t, "nearby.detail.backToList"),
        busyLabel: copyOrFallback(t, "nearby.detail.backToList"),
        buttonVariant: "secondary",
      };
  }
}

function buildReportReasonButtons(
  t: (key: string, params?: Record<string, string>) => string,
  onSelect: (reason: SafetyReportReason) => void
): AlertButton[] {
  return makeAndroidSafeReportReasonButtons([
    {
      text: copyOrFallback(t, "safety.reason.spam"),
      onPress: () => onSelect("spam"),
    },
    {
      text: copyOrFallback(t, "safety.reason.harassment"),
      onPress: () => onSelect("harassment"),
    },
    {
      text: copyOrFallback(
        t, "safety.reason.sexualServices"
      ),
      onPress: () => onSelect("sexual_services"),
    },
    {
      text: copyOrFallback(t, "safety.reason.scam"),
      onPress: () => onSelect("scam"),
    },
    {
      text: copyOrFallback(t, "safety.reason.other"),
      onPress: () => onSelect("other"),
    },
    {
      text: copyOrFallback(t, "common.cancel"),
      style: "cancel",
    },
  ],
  copyOrFallback(t, "safety.reportTitle"),
  copyOrFallback(t, "safety.reportBody"),
  copyOrFallback(t, "safety.moreReasons"));
}

function getAnnouncementUnavailableCopy(
  t: (key: string, params?: Record<string, string>) => string,
  status: NearbyAnnouncement["status"]
) {
  if (status === "closed") {
    return {
      title: copyOrFallback(t, "nearby.detail.closedTitle"),
      body: copyOrFallback(
        t, "nearby.detail.closedBody"
      ),
    };
  }
  if (status === "deleted") {
    return {
      title: copyOrFallback(t, "nearby.detail.deletedTitle"),
      body: copyOrFallback(
        t, "nearby.detail.deletedBody"
      ),
    };
  }
  if (status === "under_review") {
    return {
      title: copyOrFallback(t, "nearby.detail.underReviewTitle"),
      body: copyOrFallback(
        t, "nearby.detail.underReviewBody"
      ),
    };
  }
  return null;
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

export default function AnnouncementDetailScreen() {
  const navigation = useNavigation<RootStackNavigationProp<"AnnouncementDetail">>();
  const route = useRoute<AnnouncementDetailRouteProp>();
  const { user: authUser } = useAuth();
  const { t } = useLocale();
  const announcementId = route.params.announcementId.trim();
  const initialAnnouncement: NearbyAnnouncement | null =
    route.params.initialAnnouncement ?? null;
  const currentUid = authUser?.id ?? "";
  const responseInFlightRef = React.useRef(false);
  const safetyInFlightRef = React.useRef(false);
  const [announcement, setAnnouncement] = React.useState<NearbyAnnouncement | null>(
    initialAnnouncement
  );
  const [loading, setLoading] = React.useState(!initialAnnouncement);
  const [hasRespondedOverride, setHasRespondedOverride] = React.useState<boolean | null>(
    null
  );
  const [responding, setResponding] = React.useState(false);
  const [closing, setClosing] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [responseError, setResponseError] = React.useState<string | null>(null);
  const [responseModeOverride, setResponseModeOverride] =
    React.useState<AnnouncementResponseMode | null>(null);
  const [authorBlocked, setAuthorBlocked] = React.useState(false);
  const [authorAvatarUrl, setAuthorAvatarUrl] = React.useState(
    initialAnnouncement?.authorAvatarUrl ?? ""
  );
  const [authorDisplayName, setAuthorDisplayName] = React.useState(
    initialAnnouncement?.authorName?.trim() || initialAnnouncement?.authorLabel?.trim() || ""
  );
  const [safetyBusy, setSafetyBusy] = React.useState(false);
  const [reloadKey, setReloadKey] = React.useState(0);

  useFocusEffect(
    React.useCallback(() => {
      let alive = true;
      if (!announcementId) {
        setAnnouncement(null);
        setHasRespondedOverride(null);
        setAuthorBlocked(false);
        setLoading(false);
        return () => {
          alive = false;
        };
      }

      setLoading(true);
      setLoadError(null);
      setResponseError(null);
      setResponseModeOverride(null);
      setHasRespondedOverride(null);
      void Promise.all([
        announcementsApi.getAnnouncement(announcementId),
        currentUid ? safetyApi.listBlockedUserIds().catch(() => []) : Promise.resolve([]),
      ])
        .then(([nextAnnouncementDto, blockedIds]) => {
          if (!alive) return;
          const nextAnnouncement =
            mapAnnouncementDtoToNearbyAnnouncement(nextAnnouncementDto);
          setAnnouncement(nextAnnouncement);
          setAuthorAvatarUrl(nextAnnouncement?.authorAvatarUrl ?? "");
          setAuthorDisplayName(
            nextAnnouncement?.authorName?.trim() || nextAnnouncement?.authorLabel?.trim() || ""
          );
          setAuthorBlocked(
            Boolean(
              nextAnnouncement?.authorUid &&
                blockedIds.includes(String(nextAnnouncement.authorUid))
            )
          );
        })
        .catch((error) => {
          if (!alive) return;
          setAnnouncement(null);
          setHasRespondedOverride(null);
          setAuthorAvatarUrl("");
          setAuthorDisplayName("");
          setAuthorBlocked(false);

          setLoadError(
            copyOrFallback(
              t, "nearby.detail.loadErrorBody"
            )
          );
        })
        .finally(() => {
          if (!alive) return;
          setLoading(false);
        });

      return () => {
        alive = false;
      };
    }, [announcementId, currentUid, reloadKey, t])
  );

  const handleBack = React.useCallback(() => {
    goBackOrOpenAnnouncements(navigation);
  }, [navigation]);

  useFocusEffect(
    React.useCallback(() => {
      const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
        handleBack();
        return true;
      });
      return () => subscription.remove();
    }, [handleBack])
  );

  const categoryLabels = React.useMemo(
    () => ({
      walk: copyOrFallback(t, "nearby.announcements.category.walk"),
      trip: copyOrFallback(t, "nearby.announcements.category.trip"),
      coffee: copyOrFallback(t, "nearby.announcements.category.coffee"),
      activity: copyOrFallback(t, "nearby.announcements.category.activity"),
      sport: copyOrFallback(t, "nearby.announcements.category.sport"),
      ride: copyOrFallback(t, "nearby.announcements.category.ride"),
    }),
    [t]
  );

  const fallbackPlaceLabel = copyOrFallback(
    t, "nearby.placeFallback"
  );
  const announcementAuthorUid = String(announcement?.authorUid ?? "").trim();
  const hasResponded = hasRespondedOverride ?? Boolean(announcement?.hasResponded);
  const responseMode = React.useMemo(
    () =>
      resolveAnnouncementResponseMode({
        announcement,
        currentUid,
        override: responseModeOverride,
      }),
    [announcement, currentUid, responseModeOverride]
  );
  const amoriaUserLabel = copyOrFallback(t, "profile.amoriaUser");
  const rawAnnouncementAuthorLabel =
    authorDisplayName || announcement?.authorName?.trim() || announcement?.authorLabel?.trim() || amoriaUserLabel;
  const announcementAuthorLabel =
    rawAnnouncementAuthorLabel === "profile.amoriaUser"
      ? amoriaUserLabel
      : rawAnnouncementAuthorLabel;

  const responsePresentation = React.useMemo(
    () => buildAnnouncementResponsePresentation(t, responseMode, hasResponded),
    [hasResponded, responseMode, t]
  );
  const responseBusy = responding || closing;

  React.useEffect(() => {
    setAuthorAvatarUrl(announcement?.authorAvatarUrl ?? "");
    setAuthorDisplayName(
      announcement?.authorName?.trim() || announcement?.authorLabel?.trim() || ""
    );
  }, [announcement]);

  const handleCloseAnnouncement = React.useCallback(async () => {
    if (!announcement || closing || responseInFlightRef.current) return;

    responseInFlightRef.current = true;
    setClosing(true);
    setResponseError(null);
    try {
      const closedDto = await announcementsApi.closeAnnouncement(announcementId);
      const closedAnnouncement = mapAnnouncementDtoToNearbyAnnouncement(closedDto);
      setAnnouncement(
        closedAnnouncement ?? {
          ...announcement,
          status: "closed",
          updatedAt: Date.now(),
        }
      );
    } catch {
      setResponseError(
        copyOrFallback(
          t, "common.tryAgainLater"
        )
      );
    } finally {
      responseInFlightRef.current = false;
      setClosing(false);
    }
  }, [announcement, announcementId, closing, t]);

  const handleRespond = React.useCallback(async () => {
    if (responding || responseInFlightRef.current) return;

    switch (responseMode) {
      case "own":
        handleBack();
        return;
      case "unavailable":
        handleBack();
        return;
      case "direct_dm":
        if (!announcement || !currentUid || !announcementAuthorUid) {
          setResponseModeOverride("unavailable");
          return;
        }

        responseInFlightRef.current = true;
        setResponding(true);
        setResponseError(null);
        try {
          const response = await announcementsApi.respondAndOpenChat(announcementId);
          const threadId = String(response.threadId ?? "").trim();
          if (!threadId) {
            throw new Error("announcements.threadMissing");
          }
          setHasRespondedOverride(true);

          navigation.navigate("DMChat", {
            threadId,
            peerId: announcement.authorUid,
            peerName: announcementAuthorLabel,
            backTarget: "inbox",
            sourceContext: {
              source: "announcement",
              sourceSessionId: announcementId,
            },
          });
        } catch {
          setResponseError(
            copyOrFallback(
              t, "nearby.detail.responseErrorBody"
            )
          );
        } finally {
          responseInFlightRef.current = false;
          setResponding(false);
        }
    }
  }, [
    announcement,
    announcementAuthorLabel,
    announcementAuthorUid,
    currentUid,
    handleBack,
    announcementId,
    navigation,
    responding,
    responseMode,
    t,
  ]);

  const reportAnnouncement = React.useCallback(
    async (reason: SafetyReportReason) => {
      if (!announcement || !currentUid || safetyBusy || safetyInFlightRef.current) {
        if (!currentUid) {
          Alert.alert(
            copyOrFallback(t, "safety.signInRequiredTitle"),
            copyOrFallback(
              t, "safety.signInRequiredBody"
            )
          );
        }
        return;
      }

      safetyInFlightRef.current = true;
      setSafetyBusy(true);
      try {
        await safetyApi.report({
          targetType: "announcement",
          targetId: announcement.id,
          targetOwnerUserId: announcementAuthorUid,
          reason,
        });
        Alert.alert(
          copyOrFallback(t, "safety.reportSentTitle"),
          copyOrFallback(
            t, "safety.reportSentBody"
          )
        );
      } catch {
        Alert.alert(
          copyOrFallback(t, "safety.reportErrorTitle"),
          copyOrFallback(
            t, "safety.reportErrorBody"
          )
        );
      } finally {
        safetyInFlightRef.current = false;
        setSafetyBusy(false);
      }
    },
    [announcement, announcementAuthorUid, currentUid, safetyBusy, t]
  );

  const handleReportAnnouncement = React.useCallback(() => {
    if (!announcement) return;
    Alert.alert(
      copyOrFallback(t, "safety.reportTitle"),
      copyOrFallback(t, "safety.reportBody"),
      buildReportReasonButtons(t, (reason) => void reportAnnouncement(reason))
    );
  }, [announcement, reportAnnouncement, t]);

  const handleBlockAuthor = React.useCallback(() => {
    if (!currentUid) {
      Alert.alert(
        copyOrFallback(t, "safety.signInRequiredTitle"),
        copyOrFallback(
          t, "safety.signInRequiredBody"
        )
      );
      return;
    }
    if (!announcementAuthorUid || announcementAuthorUid === currentUid) return;
    Alert.alert(
      copyOrFallback(t, "safety.blockTitle"),
      copyOrFallback(
        t, "safety.blockBody"
      ),
      [
        {
          text: copyOrFallback(t, "common.cancel"),
          style: "cancel",
        },
        {
          text: copyOrFallback(t, "safety.blockConfirm"),
          style: "destructive",
          onPress: () => {
            if (safetyInFlightRef.current) return;
            safetyInFlightRef.current = true;
            setSafetyBusy(true);
            void safetyApi.blockUser(announcementAuthorUid)
              .then(() => {
                setAuthorBlocked(true);
                setReloadKey((prev) => prev + 1);
                Alert.alert(
                  copyOrFallback(t, "safety.userBlockedTitle"),
                  copyOrFallback(
                    t, "safety.userBlockedBody"
                  )
                );
              })
              .catch(() => {
                Alert.alert(
                  copyOrFallback(t, "safety.blockErrorTitle"),
                  copyOrFallback(
                    t, "safety.blockErrorBody"
                  )
                );
              })
              .finally(() => {
                safetyInFlightRef.current = false;
                setSafetyBusy(false);
              });
          },
        },
      ]
    );
  }, [announcementAuthorUid, currentUid, t]);

  const screenTitle = copyOrFallback(t, "nearby.detail.title");
  const announcementPhotoUrl = String(
    announcement?.photoUrl?.startsWith("http")
      ? announcement.photoUrl
      : announcement?.photoUri?.startsWith("http")
        ? announcement.photoUri
        : ""
  );
  const unavailableAnnouncementCopy = announcement
    ? getAnnouncementUnavailableCopy(t, announcement.status)
    : null;

  if (!loading && loadError) {
    return (
      <ScreenShell title={screenTitle} background="nearbyHarborV6" showBack onBack={handleBack}>
        <View style={styles.centerState}>
          <CoreStateCard
            icon="cloud-offline-outline"
            title={copyOrFallback(
              t, "nearby.detail.loadErrorTitle"
            )}
            body={loadError}
            primaryAction={{
              label: copyOrFallback(t, "nearby.detail.backToList"),
              onPress: handleBack,
            }}
          />
        </View>
      </ScreenShell>
    );
  }

  if (!loading && !announcement) {
    return (
      <ScreenShell title={screenTitle} background="nearbyHarborV6" showBack onBack={handleBack}>
        <View style={styles.centerState}>
          <CoreStateCard
            icon="document-text-outline"
            title={copyOrFallback(t, "nearby.detail.missingTitle")}
            body={copyOrFallback(
              t, "nearby.detail.missingBody"
            )}
            primaryAction={{
              label: copyOrFallback(t, "nearby.detail.backToList"),
              onPress: handleBack,
            }}
          />
        </View>
      </ScreenShell>
    );
  }

  if (!loading && announcement && authorBlocked && announcementAuthorUid !== currentUid) {
    return (
      <ScreenShell title={screenTitle} background="nearbyHarborV6" showBack onBack={handleBack}>
        <View style={styles.centerState}>
          <CoreStateCard
            icon="eye-off-outline"
            title={copyOrFallback(t, "safety.blockedContentTitle")}
            body={copyOrFallback(
              t, "safety.blockedAnnouncementBody"
            )}
            primaryAction={{
              label: copyOrFallback(t, "nearby.detail.backToList"),
              onPress: handleBack,
            }}
          />
        </View>
      </ScreenShell>
    );
  }

  if (!loading && announcement && unavailableAnnouncementCopy) {
    return (
      <ScreenShell title={screenTitle} background="nearbyHarborV6" showBack onBack={handleBack}>
        <View style={styles.centerState}>
          <CoreStateCard
            icon="shield-checkmark-outline"
            title={unavailableAnnouncementCopy.title}
            body={unavailableAnnouncementCopy.body}
            primaryAction={{
              label: copyOrFallback(t, "nearby.detail.backToList"),
              onPress: handleBack,
            }}
          />
        </View>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell title={screenTitle} background="nearbyHarborV6" showBack onBack={handleBack}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {announcement ? (
          <>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryKicker}>
                {copyOrFallback(t, "nearby.create.kicker")}
              </Text>
              <View style={styles.summaryMetaRow}>
                <View style={styles.categoryPill}>
                  <Text style={styles.categoryPillText}>
                    {categoryLabels[announcement.category]}
                  </Text>
                </View>
                <View style={styles.metaPill}>
                  <Ionicons name="location-outline" size={14} color={theme.colors.subtext} />
                  <Text style={styles.metaPillText}>
                    {announcement.placeLabel || fallbackPlaceLabel}
                  </Text>
                </View>
                {announcement.proximityLabel ? (
                  <View style={styles.metaPill}>
                    <Ionicons name="navigate-outline" size={14} color={theme.colors.subtext} />
                    <Text style={styles.metaPillText}>{announcement.proximityLabel}</Text>
                  </View>
                ) : null}
              </View>

              <Text style={styles.summaryTitle}>{announcement.title}</Text>

              <View style={styles.summaryFooter}>
                <UserAvatar
                  avatarUrl={authorAvatarUrl}
                  label={announcementAuthorLabel}
                  size={34}
                />
                <View style={styles.summaryAuthorCopy}>
                  <Text style={styles.summaryAuthor}>{announcementAuthorLabel}</Text>
                  <Text style={styles.summaryTime}>{formatAgoLong(announcement.createdAt, t)}</Text>
                </View>
              </View>
            </View>

            <View style={styles.mediaCard}>
              <View
                style={[
                  styles.mediaTile,
                  announcement.hasPhoto ? styles.mediaTileActive : styles.mediaTileIdle,
                ]}
              >
                {announcementPhotoUrl ? (
                  <Image source={{ uri: announcementPhotoUrl }} style={styles.mediaImage} />
                ) : (
                  <Ionicons
                    name="document-text-outline"
                    size={24}
                    color={announcement.hasPhoto ? theme.colors.textAccent : theme.colors.subtext}
                  />
                )}
              </View>
              <View style={styles.mediaCopy}>
                <Text style={styles.sectionLabel}>
                  {copyOrFallback(t, "nearby.detail.photoLabel")}
                </Text>
                <Text style={styles.mediaTitle}>
                  {announcement.hasPhoto || announcementPhotoUrl
                    ? copyOrFallback(t, "nearby.detail.photoYes")
                    : copyOrFallback(t, "nearby.detail.photoNo")}
                </Text>
                <Text style={styles.mediaBody}>
                  {announcement.hasPhoto || announcementPhotoUrl
                    ? copyOrFallback(
                        t, "nearby.detail.photoWithBody"
                      )
                    : copyOrFallback(
                        t, "nearby.detail.photoWithoutBody"
                      )}
                </Text>
              </View>
            </View>

            <View style={styles.detailsCard}>
              <Text style={styles.sectionLabel}>
                {copyOrFallback(t, "nearby.detail.metaTitle")}
              </Text>
              <View style={styles.detailStack}>
                <DetailRow
                  label={copyOrFallback(t, "nearby.detail.categoryLabel")}
                  value={categoryLabels[announcement.category]}
                />
                <DetailRow
                  label={copyOrFallback(t, "nearby.detail.placeLabel")}
                  value={announcement.placeLabel || fallbackPlaceLabel}
                />
                {announcement.proximityLabel ? (
                  <DetailRow
                    label={copyOrFallback(t, "nearby.detail.distanceLabel")}
                    value={announcement.proximityLabel}
                  />
                ) : null}
                <DetailRow
                  label={copyOrFallback(t, "nearby.detail.authorLabel")}
                  value={announcementAuthorLabel}
                />
              </View>

              <View style={styles.detailsDivider} />

              <View style={styles.descriptionBlock}>
                <Text style={styles.descriptionLabel}>
                  {copyOrFallback(t, "nearby.detail.descriptionTitle")}
                </Text>
                <Text style={styles.descriptionText}>{announcement.description}</Text>
              </View>
            </View>

            <View style={styles.responseCard}>
              <Text style={styles.responseTitle}>{responsePresentation.title}</Text>
              <Text style={styles.responseBody}>{responsePresentation.body}</Text>
              {responseError ? (
                <Text style={styles.responseErrorText}>{responseError}</Text>
              ) : null}

              <Pressable
                onPress={() =>
                  responseMode === "own"
                    ? void handleCloseAnnouncement()
                    : void handleRespond()
                }
                disabled={responseBusy}
                style={[
                  responsePresentation.buttonVariant === "secondary"
                    ? styles.secondaryButton
                    : styles.primaryButton,
                  responseBusy ? styles.primaryButtonDisabled : null,
                ]}
              >
                <Text
                  style={
                    responsePresentation.buttonVariant === "secondary"
                      ? styles.secondaryButtonText
                      : styles.primaryButtonText
                  }
                >
                  {responseBusy
                    ? responsePresentation.busyLabel
                    : responsePresentation.actionLabel}
                </Text>
              </Pressable>
            </View>

            <View style={styles.safetyCard}>
              <Text style={styles.safetyTitle}>
                {copyOrFallback(t, "safety.announcementSafetyTitle")}
              </Text>
              <Text style={styles.safetyBody}>
                {copyOrFallback(
                  t, "safety.announcementSafetyBody"
                )}
              </Text>
              <View style={styles.safetyActions}>
                <Pressable
                  onPress={handleReportAnnouncement}
                  disabled={safetyBusy}
                  style={[styles.safetyButton, safetyBusy ? styles.safetyButtonDisabled : null]}
                >
                  <Text style={styles.safetyButtonText}>
                    {copyOrFallback(t, "safety.report")}
                  </Text>
                </Pressable>
                {announcementAuthorUid && announcementAuthorUid !== currentUid ? (
                  <Pressable
                    onPress={handleBlockAuthor}
                    disabled={safetyBusy}
                    style={[styles.safetyButton, safetyBusy ? styles.safetyButtonDisabled : null]}
                  >
                    <Text style={styles.safetyButtonText}>
                      {copyOrFallback(t, "safety.blockAuthor")}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          </>
        ) : (
          <View style={styles.centerState}>
            <CoreStateCard
              loading
              icon="document-text-outline"
              title={copyOrFallback(
                t, "nearby.detail.loadingTitle"
              )}
              body={copyOrFallback(
                t, "nearby.detail.loadingBody"
              )}
            />
          </View>
        )}
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 14,
    paddingBottom: 32,
    gap: 14,
  },
  summaryCard: {
    padding: 18,
    backgroundColor: "transparent",
    borderWidth: 0,
    gap: 12,
  },
  summaryKicker: {
    color: theme.colors.textAccent,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.9,
    textTransform: "uppercase",
  },
  summaryMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  categoryPill: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 9,
    paddingVertical: 5,
    backgroundColor: theme.colors.chipActiveBg,
    borderWidth: 1,
    borderColor: theme.colors.chipActiveBorder,
  },
  categoryPillText: {
    color: theme.colors.textAccent,
    fontSize: 11,
    fontWeight: "800",
  },
  metaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 9,
    paddingVertical: 5,
    backgroundColor: theme.colors.pillBg,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  metaPillText: {
    color: theme.colors.subtext,
    fontSize: 11,
    fontWeight: "700",
  },
  summaryTitle: {
    color: theme.colors.text,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "800",
  },
  summaryFooter: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 9,
  },
  summaryAuthorCopy: {
    flex: 1,
    gap: 2,
  },
  summaryAuthor: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  summaryTime: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  mediaCard: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 12,
    padding: 16,
    backgroundColor: "transparent",
    borderWidth: 0,
  },
  mediaTile: {
    width: 96,
    minHeight: 96,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    padding: 9,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  mediaTileActive: {
    backgroundColor: "rgba(255,122,60,0.08)",
    borderColor: "rgba(255,122,60,0.18)",
  },
  mediaTileIdle: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderColor: theme.colors.borderSubtle,
  },
  mediaImage: {
    width: "100%",
    height: 78,
    borderRadius: 16,
  },
  mediaCopy: {
    flex: 1,
    gap: 5,
  },
  sectionLabel: {
    color: theme.colors.textAccent,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  mediaTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: "800",
  },
  mediaBody: {
    color: theme.colors.subtext,
    fontSize: 12,
    lineHeight: 18,
  },
  detailsCard: {
    padding: 18,
    backgroundColor: "transparent",
    borderWidth: 0,
    gap: 14,
  },
  detailStack: {
    gap: 10,
  },
  detailRow: {
    gap: 3,
  },
  detailLabel: {
    color: theme.colors.muted,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  detailValue: {
    color: theme.colors.text,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "700",
  },
  detailsDivider: {
    height: 1,
    backgroundColor: theme.colors.borderSubtle,
  },
  descriptionBlock: {
    gap: 8,
  },
  descriptionLabel: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: "800",
  },
  descriptionText: {
    color: theme.colors.text,
    fontSize: 14,
    lineHeight: 22,
  },
  responseCard: {
    padding: 18,
    backgroundColor: "transparent",
    borderWidth: 0,
    gap: 10,
  },
  responseTitle: {
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: "800",
  },
  responseBody: {
    color: theme.colors.subtext,
    fontSize: 13,
    lineHeight: 20,
  },
  responseErrorText: {
    color: "#FCA5A5",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
  },
  safetyCard: {
    padding: 16,
    backgroundColor: "transparent",
    borderWidth: 0,
    gap: 10,
  },
  safetyTitle: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: "800",
  },
  safetyBody: {
    color: theme.colors.subtext,
    fontSize: 12,
    lineHeight: 18,
  },
  safetyActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  safetyButton: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 13,
    paddingVertical: 9,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  safetyButtonDisabled: {
    opacity: 0.55,
  },
  safetyButtonText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: "800",
  },
  primaryButton: {
    alignSelf: "stretch",
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 16,
    paddingVertical: 11,
    backgroundColor: theme.buttons.primary.backgroundColor,
    borderWidth: 1,
    borderColor: theme.buttons.primary.borderColor,
    alignItems: "center",
  },
  primaryButtonDisabled: {
    opacity: 0.65,
  },
  primaryButtonText: {
    color: theme.buttons.primary.textColor,
    fontSize: 14,
    fontWeight: "800",
  },
  secondaryButton: {
    alignSelf: "stretch",
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 16,
    paddingVertical: 11,
    backgroundColor: theme.colors.pillBg,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
  centerState: {
    flex: 1,
    justifyContent: "center",
    paddingVertical: 40,
    paddingHorizontal: 8,
  },
});
