import React, { useMemo } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import { OpenStreetMapWebView } from "@/components/OpenStreetMapWebView";
import type {
  RoomMapPin,
  RoomPosition,
  RoomsRangePreset,
  RoomsTranslate,
} from "@/components/rooms/types";
import { getRoomMeta, ROOM_KIND_ORDER, type RoomKind } from "@/services/rooms";
import { theme } from "@/theme";

type Props = {
  t: RoomsTranslate;
  loadingPrefs: boolean;
  locationEnabled: boolean;
  posLoading: boolean;
  posRefreshing: boolean;
  pos: RoomPosition | null;
  posError: string | null;
  permissionBlocked: boolean;
  mapPins: RoomMapPin[];
  rangePresets: readonly RoomsRangePreset[];
  rangeIndex: number;
  selectedKind: RoomKind | null;
  joiningKind: RoomKind | null;
  onEnableNearby: () => void;
  onRefreshPosition: () => void;
  onOpenSettings: () => void;
  onShowRangeInfo: () => void;
  onSelectRange: (index: number) => void;
  onGoToTogether: () => void;
  onSelectKind: (kind: RoomKind) => void;
  onJoinSelected: () => void;
  onExpandMap: () => void;
};

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

export default function RoomsChooseStage({
  t,
  loadingPrefs,
  locationEnabled,
  posLoading,
  posRefreshing,
  pos,
  posError,
  permissionBlocked,
  mapPins,
  rangePresets,
  rangeIndex,
  selectedKind,
  joiningKind,
  onEnableNearby,
  onRefreshPosition,
  onOpenSettings,
  onShowRangeInfo,
  onSelectRange,
  onGoToTogether,
  onSelectKind,
  onJoinSelected,
  onExpandMap,
}: Props) {
  const selectedMeta = useMemo(
    () => (selectedKind ? getRoomMeta(selectedKind) : null),
    [selectedKind]
  );
  const joinBase = t("rooms.joinRoom");
  const joinLabel = selectedMeta
    ? joinBase === "rooms.joinRoom"
      ? `${selectedMeta.emoji} ${t(selectedMeta.labelKey)}`
      : `${joinBase} ${selectedMeta.emoji} ${t(selectedMeta.labelKey)}`
    : t("rooms.selectFirst");

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.scrollContent}
    >
      <View style={styles.heroWrap}>
        <View style={styles.heroCard}>
          <Text style={styles.heroKicker}>{t("rooms.heroKicker")}</Text>
          <Text style={styles.heroTitle}>{t("rooms.heroTitle")}</Text>
          <Text style={styles.heroBody}>{t("rooms.heroBody")}</Text>
        </View>

        <SectionTitle>{t("rooms.nearbyRooms")}</SectionTitle>

        <View style={styles.locationCard}>
          <Text style={styles.locationLead}>{t("rooms.noPhotoChat")}</Text>

          {loadingPrefs ? (
            <View style={styles.inlineStatusRow}>
              <ActivityIndicator color={theme.colors.primary} />
              <Text style={styles.mutedText}>{t("rooms.getLocation")}</Text>
            </View>
          ) : !locationEnabled ? (
            <View>
              <Text style={styles.warningText}>{t("rooms.enableForMap")}</Text>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={onEnableNearby}
                style={styles.primaryInlineButton}
              >
                <Text style={styles.primaryInlineButtonText}>
                  {t("settings.nearbyEnabled")}
                </Text>
              </TouchableOpacity>
            </View>
          ) : pos ? (
            <View style={styles.readyWrap}>
              <View style={styles.readyRow}>
                <Ionicons name="location-outline" size={18} color="#E5E7EB" />
                <Text style={styles.readyText}>
                  {t("rooms.locationReady")} (~{Math.round(pos.accuracy ?? 0)} {t("units.m")})
                </Text>
                <View style={styles.readySpacer} />
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={onRefreshPosition}
                  disabled={posRefreshing}
                  style={styles.iconGhostButton}
                >
                  {posRefreshing ? (
                    <ActivityIndicator size="small" color={theme.colors.accent} />
                  ) : (
                    <Ionicons name="refresh" size={18} color={theme.colors.accent} />
                  )}
                </TouchableOpacity>
              </View>
              {posRefreshing ? (
                <View style={styles.inlineStatusRow}>
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                  <Text style={styles.mutedText}>{t("geo.locationUpdating")}</Text>
                </View>
              ) : null}
            </View>
          ) : posLoading ? (
            <View style={styles.inlineStatusRow}>
              <ActivityIndicator color={theme.colors.primary} />
              <Text style={styles.mutedText}>{t("rooms.getLocation")}</Text>
            </View>
          ) : (
            <View>
              <Text style={styles.errorText}>{posError ?? t("geo.noLocationAccess")}</Text>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={permissionBlocked ? onOpenSettings : onRefreshPosition}
                style={styles.primaryInlineButton}
              >
                <Text style={styles.primaryInlineButtonText}>
                  {permissionBlocked ? t("geo.openSettings") : t("geo.enableLocation")}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>

      <View style={styles.sectionWrap}>
        <View style={styles.mapCard}>
          {pos ? (
            <View style={styles.mapFrame}>
              <OpenStreetMapWebView
                style={styles.map}
                center={{ lat: pos.lat, lng: pos.lng }}
                markers={mapPins}
                zoom={14}
                interactive={false}
              />
              <TouchableOpacity activeOpacity={0.85} onPress={onExpandMap} style={styles.expandButton}>
                <Ionicons name="expand-outline" size={16} color="#E5E7EB" />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.mapEmpty}>
              <Text style={styles.mapEmptyTitle}>{t("rooms.mapLoadingTitle")}</Text>
              <Text style={styles.mapEmptyBody}>{t("rooms.mapLoadingBody")}</Text>
            </View>
          )}
        </View>

        <View style={styles.blockWrap}>
          <View style={styles.blockHeader}>
            <Text style={styles.blockTitle}>{t("rooms.range.title")}</Text>
            <Pressable
              onPress={onShowRangeInfo}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.infoButton}
            >
              <Ionicons name="information-circle-outline" size={18} color="#E5E7EB" />
            </Pressable>
          </View>

          <View style={styles.selectorCard}>
            <View style={styles.selectorRail}>
              {rangePresets.map((preset, index) => {
                const selected = index === rangeIndex;
                const label = t(preset.labelKey);

                return (
                  <TouchableOpacity
                    key={preset.id}
                    activeOpacity={0.85}
                    onPress={() => onSelectRange(index)}
                    style={styles.selectorItem}
                  >
                    {selected ? (
                      <LinearGradient
                        colors={[theme.colors.primary, theme.colors.accent]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.selectorItemActive}
                      >
                        <Text style={styles.selectorItemActiveText}>{label}</Text>
                      </LinearGradient>
                    ) : (
                      <View style={styles.selectorItemIdle}>
                        <Text style={styles.selectorItemIdleText}>{label}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>

        <View style={styles.oneToOneCard}>
          <Text style={styles.oneToOneKicker}>{t("rooms.oneToOneKicker")}</Text>
          <Text style={styles.oneToOneTitle}>{t("rooms.oneToOneTitle")}</Text>
          <Text style={styles.oneToOneBody}>{t("rooms.oneToOneBody")}</Text>
          <TouchableOpacity activeOpacity={0.85} onPress={onGoToTogether} style={styles.oneToOneButton}>
            <Text style={styles.oneToOneButtonText}>{t("rooms.goToTogether")}</Text>
          </TouchableOpacity>
        </View>

        <SectionTitle>{t("rooms.choosePlace")}</SectionTitle>

        <View style={styles.placeGrid}>
          {ROOM_KIND_ORDER.map((kind) => {
            const meta = getRoomMeta(kind);
            const selected = kind === selectedKind;
            const disabled = posLoading || joiningKind !== null;

            return (
              <TouchableOpacity
                key={kind}
                activeOpacity={0.85}
                disabled={disabled}
                onPress={() => onSelectKind(kind)}
                style={[
                  styles.placeChip,
                  selected ? styles.placeChipSelected : null,
                ]}
              >
                <Text style={styles.placeEmoji}>{meta.emoji}</Text>
                <Text style={[styles.placeText, selected ? styles.placeTextSelected : null]}>
                  {t(meta.labelKey)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          activeOpacity={0.85}
          disabled={!selectedKind || joiningKind !== null}
          onPress={onJoinSelected}
          style={[
            styles.joinButton,
            !selectedKind ? styles.joinButtonDisabled : styles.joinButtonActive,
          ]}
        >
          {joiningKind ? <ActivityIndicator color="#FFFFFF" /> : null}
          <Text style={[styles.joinButtonText, !selectedKind ? styles.joinButtonTextDisabled : null]}>
            {joinLabel}
          </Text>
        </TouchableOpacity>

        <Text style={styles.placeInfo}>{t("rooms.placeInfo")}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 20,
  },
  heroWrap: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  heroCard: {
    borderRadius: theme.shapes.card,
    padding: 14,
    backgroundColor: "rgba(12, 16, 31, 0.88)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    marginBottom: 12,
  },
  heroKicker: {
    color: theme.colors.accent,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    marginBottom: 6,
  },
  heroTitle: {
    color: theme.colors.text,
    fontSize: 20,
    lineHeight: 25,
    fontWeight: "800",
    marginBottom: 8,
  },
  heroBody: {
    color: theme.colors.subtext,
    fontSize: 13,
    lineHeight: 18,
  },
  sectionTitle: {
    color: "#E5E7EB",
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 8,
  },
  locationCard: {
    borderRadius: 18,
    padding: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    marginBottom: 12,
    gap: 8,
  },
  locationLead: {
    color: "#E5E7EB",
    fontSize: 13,
    lineHeight: 18,
  },
  inlineStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  mutedText: {
    color: "#A3A3A3",
  },
  warningText: {
    color: "#FBBF24",
    fontSize: 13,
    marginBottom: 8,
  },
  errorText: {
    color: "#FCA5A5",
    fontSize: 13,
    marginBottom: 8,
  },
  primaryInlineButton: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: theme.colors.primary,
  },
  primaryInlineButtonText: {
    color: "#FFFFFF",
    fontWeight: "800",
  },
  readyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  readyWrap: {
    gap: 8,
  },
  readyText: {
    color: "#E5E7EB",
    fontSize: 13,
    flexShrink: 1,
  },
  readySpacer: {
    flex: 1,
  },
  iconGhostButton: {
    padding: 6,
  },
  sectionWrap: {
    paddingHorizontal: 16,
  },
  mapCard: {
    borderRadius: 22,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(15,23,42,0.96)",
  },
  mapFrame: {
    height: 214,
    width: "100%",
  },
  map: {
    flex: 1,
  },
  expandButton: {
    position: "absolute",
    right: 10,
    top: 10,
    padding: 8,
    borderRadius: 12,
    backgroundColor: "rgba(15,23,42,0.85)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  mapEmpty: {
    height: 214,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  mapEmptyTitle: {
    color: "#E5E7EB",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 8,
  },
  mapEmptyBody: {
    color: "#A3A3A3",
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
  },
  blockWrap: {
    paddingTop: 14,
  },
  blockHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  blockTitle: {
    color: "#E5E7EB",
    fontSize: 16,
    fontWeight: "800",
  },
  infoButton: {
    marginLeft: 8,
    opacity: 0.9,
  },
  selectorCard: {
    borderRadius: 18,
    padding: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  selectorRail: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 999,
    padding: 4,
    gap: 6,
  },
  selectorItem: {
    flex: 1,
  },
  selectorItemActive: {
    borderRadius: 999,
    paddingVertical: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  selectorItemActiveText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
  },
  selectorItemIdle: {
    borderRadius: 999,
    paddingVertical: 7,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  selectorItemIdleText: {
    color: "#E5E7EB",
    fontSize: 12,
    fontWeight: "700",
    opacity: 0.85,
  },
  oneToOneCard: {
    borderRadius: 18,
    padding: 12,
    backgroundColor: "rgba(255, 78, 138, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(255, 78, 138, 0.18)",
    marginTop: 14,
    marginBottom: 14,
  },
  oneToOneKicker: {
    color: "#FFD3DF",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  oneToOneTitle: {
    color: "#E5E7EB",
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 4,
  },
  oneToOneBody: {
    color: "#A3A3A3",
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 8,
  },
  oneToOneButton: {
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: theme.colors.primary,
  },
  oneToOneButtonText: {
    color: "#FFFFFF",
    fontWeight: "800",
  },
  placeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  placeChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  placeChipSelected: {
    backgroundColor: "rgba(109,40,217,0.25)",
    borderColor: "rgba(167,139,250,0.45)",
  },
  placeEmoji: {
    fontSize: 18,
    marginRight: 6,
  },
  placeText: {
    color: "#E5E7EB",
    fontSize: 12,
    fontWeight: "700",
  },
  placeTextSelected: {
    color: "#F3F4F6",
    fontWeight: "800",
  },
  joinButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 11,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 12,
  },
  joinButtonActive: {
    backgroundColor: theme.colors.primary,
    borderColor: "rgba(167,139,250,0.45)",
  },
  joinButtonDisabled: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: "rgba(255,255,255,0.10)",
  },
  joinButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  joinButtonTextDisabled: {
    color: "#A1A1AA",
  },
  placeInfo: {
    color: "#71717A",
    fontSize: 12,
    lineHeight: 16,
    marginTop: 10,
    marginBottom: 14,
  },
});
