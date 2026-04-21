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
import { signOut } from "firebase/auth";

import ScreenShell from "@/components/ScreenShell";
import LocationConsentModal from "@/components/LocationConsentModal";
import { useLocale } from "@/contexts/LocaleContext";
import { auth, db } from "@/config/firebaseConfig";
import { loadAdultModeEnabled, setAdultModeEnabled } from "@/services/adultMode";
import {
  loadLocationPrefs,
  setLocationConsent,
  setNearbyEnabled,
  setShareMeOnMap,
  setShowPeopleOnMap,
  type LocationPrefs,
} from "@/services/locationPrivacy";
import { clearPresence } from "@/services/presence";
import { type RootStackNavigationProp } from "@/navigation/appRoutes";

export default function SettingsScreen() {
  const navigation = useNavigation<RootStackNavigationProp<"Settings">>();
  const { t, openLanguagePicker } = useLocale();

  const [prefs, setPrefs] = useState<LocationPrefs>({
    consent: "unknown",
    nearbyEnabled: false,
    showPeopleOnMap: false,
    shareMeOnMap: false,
  });
  const [loadingPrefs, setLoadingPrefs] = useState(true);
  const [adultMode, setAdultMode] = useState(false);
  const [consentVisible, setConsentVisible] = useState(false);
  const [consentAction, setConsentAction] = useState<
    "nearby" | "showPeople" | "shareMe" | null
  >(null);

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
      return;
    }

    if (action === "showPeople") {
      await setShowPeopleOnMap(true);
      updatePrefs({ showPeopleOnMap: true });
      return;
    }

    if (action === "shareMe") {
      const ok = await requestLocationPermission();
      if (!ok) return;
      await setShareMeOnMap(true);
      updatePrefs({ shareMeOnMap: true });
    }
  }, [consentAction, requestLocationPermission, updatePrefs]);

  const handleConsentDecline = useCallback(async () => {
    setConsentVisible(false);
    setConsentAction(null);
    await Promise.all([
      setLocationConsent("declined"),
      setNearbyEnabled(false),
      setShowPeopleOnMap(false),
      setShareMeOnMap(false),
    ]);
    updatePrefs({
      consent: "declined",
      nearbyEnabled: false,
      showPeopleOnMap: false,
      shareMeOnMap: false,
    });
    if (db && auth?.currentUser?.uid) {
      clearPresence(db, auth.currentUser.uid).catch(() => {});
    }
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
      updatePrefs({ nearbyEnabled: false });
      await setShareMeOnMap(false);
      updatePrefs({ shareMeOnMap: false });
      if (db && auth?.currentUser?.uid) {
        clearPresence(db, auth.currentUser.uid).catch(() => {});
      }
    },
    [prefs.consent, requestLocationPermission, updatePrefs]
  );

  const toggleShowPeople = useCallback(
    async (value: boolean) => {
      if (value) {
        if (!prefs.nearbyEnabled) {
          Alert.alert(t("settings.nearbyEnabled"), t("rooms.enableForMap"));
          return;
        }
        if (prefs.consent !== "accepted") {
          setConsentAction("showPeople");
          setConsentVisible(true);
          return;
        }
        await setShowPeopleOnMap(true);
        updatePrefs({ showPeopleOnMap: true });
        return;
      }
      await setShowPeopleOnMap(false);
      updatePrefs({ showPeopleOnMap: false });
    },
    [prefs.nearbyEnabled, prefs.consent, t, updatePrefs]
  );

  const toggleShareMe = useCallback(
    async (value: boolean) => {
      if (value) {
        if (!prefs.nearbyEnabled) {
          Alert.alert(t("settings.nearbyEnabled"), t("rooms.enableForMap"));
          return;
        }
        if (prefs.consent !== "accepted") {
          setConsentAction("shareMe");
          setConsentVisible(true);
          return;
        }
        const ok = await requestLocationPermission();
        if (!ok) return;
        await setShareMeOnMap(true);
        updatePrefs({ shareMeOnMap: true });
        return;
      }
      await setShareMeOnMap(false);
      updatePrefs({ shareMeOnMap: false });
      if (db && auth?.currentUser?.uid) {
        clearPresence(db, auth.currentUser.uid).catch(() => {});
      }
    },
    [prefs.nearbyEnabled, prefs.consent, requestLocationPermission, t, updatePrefs]
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
      if (auth) {
        await signOut(auth);
      }
    } catch (error) {
      Alert.alert(t("common.error"), t("menu.logoutFailed"));
    }
  }, [t]);

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
            <View style={styles.row}>
              <Text style={styles.label}>{t("settings.showPeopleOnMap")}</Text>
              <Switch
                value={prefs.showPeopleOnMap}
                onValueChange={toggleShowPeople}
                disabled={loadingPrefs}
              />
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>{t("settings.shareMeOnMap")}</Text>
              <Switch
                value={prefs.shareMeOnMap}
                onValueChange={toggleShareMe}
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
            <TouchableOpacity
              onPress={() => {
                if (db && auth?.currentUser?.uid) {
                  clearPresence(db, auth.currentUser.uid).catch(() => {});
                }
              }}
              style={styles.linkRow}
            >
              <Ionicons name="trash-outline" size={18} color="#E5E7EB" />
              <Text style={styles.linkText}>{t("settings.clearMyLocation")}</Text>
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
