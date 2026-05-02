import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Linking,
  ScrollView,
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
import { loadAdultModeEnabled, setAdultModeEnabled } from "@/services/adultMode";
import {
  clearLegacyMapPresencePrefs,
  loadLocationPrefs,
  setLocationConsent,
  setNearbyEnabled,
  type LocationPrefs,
} from "@/services/locationPrivacy";
import { type RootStackNavigationProp } from "@/navigation/appRoutes";

export default function SettingsScreen() {
  const navigation = useNavigation<RootStackNavigationProp<"Settings">>();
  const auth = useAuth();
  const { t, openLanguagePicker } = useLocale();

  const [prefs, setPrefs] = useState<LocationPrefs>({
    consent: "unknown",
    nearbyEnabled: false,
  });
  const [loadingPrefs, setLoadingPrefs] = useState(true);
  const [adultMode, setAdultMode] = useState(false);
  const [consentVisible, setConsentVisible] = useState(false);
  const [consentAction, setConsentAction] = useState<"nearby" | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [prefsValue, adultValue] = await Promise.all([
        loadLocationPrefs(),
        loadAdultModeEnabled(),
      ]);
      if (!alive) return;
      setPrefs(prefsValue);
      setAdultMode(adultValue);
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

  const handleAdultToggle = useCallback(async (value: boolean) => {
    setAdultMode(value);
    await setAdultModeEnabled(value);
  }, []);

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
    <ScreenShell title={t("screen.settings")} background="profile">
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={{ paddingHorizontal: 6, paddingTop: 8, paddingBottom: 24 }}>
          <Text style={styles.sectionTitle}>{t("screen.locationInfo")}</Text>

          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.label}>{t("settings.nearbyEnabled")}</Text>
              <Switch
                value={prefs.nearbyEnabled}
                onValueChange={toggleNearby}
                disabled={loadingPrefs}
              />
            </View>
          </View>

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
            <TouchableOpacity
              onPress={() => Linking.openSettings()}
              style={styles.linkRow}
            >
              <Ionicons name="settings-outline" size={18} color="#E5E7EB" />
              <Text style={styles.linkText}>{t("settings.openSystemSettings")}</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionTitle}>{t("menu.language")}</Text>
          <View style={styles.card}>
            <TouchableOpacity onPress={openLanguagePicker} style={styles.linkRow}>
              <Ionicons name="language-outline" size={18} color="#E5E7EB" />
              <Text style={styles.linkText}>{t("menu.language")}</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionTitle}>{t("common.adultShort")}</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.label}>{t("settings.adultMode")}</Text>
              <Switch value={adultMode} onValueChange={handleAdultToggle} />
            </View>
          </View>

          <Text style={styles.sectionTitle}>{t("menu.profile")}</Text>
          <View style={styles.card}>
            <TouchableOpacity onPress={handleLogout} style={styles.linkRow}>
              <Ionicons name="log-out-outline" size={18} color="#E5E7EB" />
              <Text style={styles.linkText}>{t("menu.logout")}</Text>
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
  sectionTitle: {
    color: "#E5E7EB",
    fontSize: 14,
    fontWeight: "800" as const,
    marginBottom: 10,
    marginTop: 18,
  },
  card: {
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 12,
  },
  row: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingVertical: 10,
  },
  label: {
    color: "#E5E7EB",
    fontSize: 14,
    fontWeight: "700" as const,
    flex: 1,
    paddingRight: 12,
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
};
