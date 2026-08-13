import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import * as Location from "expo-location";

import ScreenShell from "@/components/ScreenShell";
import LocationConsentModal from "@/components/LocationConsentModal";
import { useAuth } from "@/contexts/AuthContext";
import { useLocale } from "@/contexts/LocaleContext";
import {
  clearLegacyMapPresencePrefs,
  loadLocationPrefs,
  setLocationConsent,
  setNearbyEnabled,
  type LocationPrefs,
} from "@/services/locationPrivacy";
import { type RootStackNavigationProp } from "@/navigation/appRoutes";

function copyOrFallback(
  t: (key: string, params?: Record<string, string>) => string,
  key: string,
  fallback: string
) {
  const value = t(key);
  return value === key ? fallback : value;
}

export default function SettingsScreen() {
  const navigation = useNavigation<RootStackNavigationProp<"Settings">>();
  const auth = useAuth();
  const { t, openLanguagePicker } = useLocale();

  const [prefs, setPrefs] = useState<LocationPrefs>({
    consent: "unknown",
    nearbyEnabled: false,
  });
  const [loadingPrefs, setLoadingPrefs] = useState(true);
  const [consentVisible, setConsentVisible] = useState(false);
  const [consentAction, setConsentAction] = useState<"nearby" | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const prefsValue = await loadLocationPrefs();
      if (!alive) return;
      setPrefs(prefsValue);
      setLoadingPrefs(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const updatePrefs = useCallback((patch: Partial<LocationPrefs>) => {
    setPrefs((prev) => ({ ...prev, ...patch }));
  }, []);

  const requestLocationPermission = useCallback(async () => {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== "granted") {
      const blocked = perm.canAskAgain === false;
      Alert.alert(
        t("geo.permissionTitle"),
        blocked ? t("geo.permissionBlockedHelp") : t("geo.permissionRequired"),
        blocked
          ? [
              { text: t("geo.openSettings"), onPress: () => Linking.openSettings() },
              { text: t("common.ok") },
            ]
          : [{ text: t("common.ok") }]
      );
      return false;
    }
    return true;
  }, [t]);

  const handleConsentAccept = useCallback(async () => {
    const action = consentAction;
    setConsentVisible(false);
    setConsentAction(null);
    await setLocationConsent("accepted");
    updatePrefs({ consent: "accepted" });

    if (action === "nearby") {
      await setNearbyEnabled(true);
      updatePrefs({ nearbyEnabled: true });
      await requestLocationPermission();
    }
  }, [consentAction, requestLocationPermission, updatePrefs]);

  const handleConsentDecline = useCallback(async () => {
    setConsentVisible(false);
    setConsentAction(null);
    await Promise.all([
      setLocationConsent("declined"),
      setNearbyEnabled(false),
      clearLegacyMapPresencePrefs(),
    ]);
    updatePrefs({
      consent: "declined",
      nearbyEnabled: false,
    });
  }, [updatePrefs]);

  const toggleNearby = useCallback(
    async (value: boolean) => {
      if (value) {
        if (prefs.consent !== "accepted") {
          setConsentAction("nearby");
          setConsentVisible(true);
          return;
        }
        await setNearbyEnabled(true);
        updatePrefs({ nearbyEnabled: true });
        await requestLocationPermission();
        return;
      }
      await setNearbyEnabled(false);
      await clearLegacyMapPresencePrefs();
      updatePrefs({ nearbyEnabled: false });
    },
    [prefs.consent, requestLocationPermission, updatePrefs]
  );

  const handleOpenPrivacyPolicy = useCallback(() => {
    navigation.navigate("PrivacyPolicy");
  }, [navigation]);

  const handleOpenLocationInfo = useCallback(() => {
    navigation.navigate("LocationInfo");
  }, [navigation]);

  const handleLogout = useCallback(async () => {
    try {
      await auth.logout();
    } catch (error) {
      console.error("[auth] backend logout failed", error);
      Alert.alert(t("common.error"), t("menu.logoutFailed"));
    }
  }, [auth, t]);

  return (
    <ScreenShell title={t("screen.settings")} background="profileArchGardenV6">
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          <Text style={styles.sectionTitle}>
            {copyOrFallback(
              t,
              "settings.sectionPrivacySecurity",
              "Приватность и безопасность"
            )}
          </Text>
          <View style={styles.card}>
            <TouchableOpacity
              onPress={handleOpenPrivacyPolicy}
              style={styles.linkRow}
            >
              <Ionicons name="document-text-outline" size={18} color="#E5E7EB" />
              <Text style={styles.linkText}>{t("screen.privacy")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleOpenLocationInfo}
              style={styles.linkRow}
            >
              <Ionicons name="location-outline" size={18} color="#E5E7EB" />
              <Text style={styles.linkText}>{t("screen.locationInfo")}</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionTitle}>
            {copyOrFallback(t, "settings.sectionGeolocation", "Геолокация")}
          </Text>
          <Text style={styles.sectionBody}>
            {copyOrFallback(
              t,
              "settings.geolocationBody",
              "Геолокация используется для подбора и функций рядом. Мы не показываем точные координаты другим людям. Будущий «Рядом» сможет безопасно переиспользовать этот доступ после отдельного редизайна."
            )}
          </Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={styles.rowCopy}>
                <Text style={styles.label}>
                  {copyOrFallback(
                    t,
                    "settings.nearbyLocationPreview",
                    "Доступ к геолокации"
                  )}
                </Text>
                <Text style={styles.rowHelp}>
                  {copyOrFallback(
                    t,
                    "settings.nearbyLocationPreviewBody",
                    "Управляет геолокацией для подбора и функций рядом. Можно выключить отдельно от Together."
                  )}
                </Text>
              </View>
              <Switch
                value={prefs.nearbyEnabled}
                onValueChange={toggleNearby}
                disabled={loadingPrefs}
              />
            </View>
          </View>

          <Text style={styles.sectionTitle}>
            {copyOrFallback(t, "settings.sectionApp", "Приложение")}
          </Text>
          <View style={styles.card}>
            <TouchableOpacity
              onPress={() => navigation.navigate("Notifications")}
              style={styles.linkRow}
            >
              <Ionicons name="notifications-outline" size={18} color="#E5E7EB" />
              <Text style={styles.linkText}>{t("notifications.title")}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={openLanguagePicker} style={styles.linkRow}>
              <Ionicons name="language-outline" size={18} color="#E5E7EB" />
              <Text style={styles.linkText}>{t("menu.language")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => Linking.openSettings()}
              style={styles.linkRow}
            >
              <Ionicons name="settings-outline" size={18} color="#E5E7EB" />
              <Text style={styles.linkText}>{t("settings.openSystemSettings")}</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionTitle}>
            {copyOrFallback(t, "settings.sectionAccount", "Аккаунт")}
          </Text>
          <View style={styles.card}>
            <TouchableOpacity onPress={handleLogout} style={styles.linkRow}>
              <Ionicons name="log-out-outline" size={18} color="#FFD7DF" />
              <Text style={[styles.linkText, styles.logoutText]}>{t("menu.logout")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => navigation.navigate("AccountDeletion")}
              style={styles.linkRow}
            >
              <Ionicons name="trash-outline" size={18} color="#FF9CAD" />
              <Text style={[styles.linkText, styles.deleteText]}>{t("accountDeletion.title")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      <LocationConsentModal
        visible={consentVisible}
        onAccept={handleConsentAccept}
        onDecline={handleConsentDecline}
        onOpenPrivacy={handleOpenPrivacyPolicy}
      />
    </ScreenShell>
  );
}

const styles = {
  content: {
    paddingHorizontal: 6,
    paddingTop: 8,
    paddingBottom: 24,
  },
  sectionTitle: {
    color: "#E5E7EB",
    fontSize: 15,
    fontWeight: "800" as const,
    marginBottom: 8,
    marginTop: 18,
  },
  sectionBody: {
    color: "rgba(229,231,235,0.72)",
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 10,
  },
  card: {
    backgroundColor: "transparent",
    borderWidth: 0,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 12,
  },
  row: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(230,185,118,0.12)",
  },
  rowCopy: {
    flex: 1,
    gap: 4,
  },
  label: {
    color: "#E5E7EB",
    fontSize: 14,
    fontWeight: "700" as const,
  },
  rowHelp: {
    color: "rgba(229,231,235,0.64)",
    fontSize: 12,
    lineHeight: 17,
  },
  linkRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
    paddingVertical: 10,
  },
  linkText: {
    color: "#E5E7EB",
    fontSize: 14,
    fontWeight: "700" as const,
  },
  logoutText: {
    color: "#FFD7DF",
  },
  deleteText: {
    color: "#FF9CAD",
  },
};
