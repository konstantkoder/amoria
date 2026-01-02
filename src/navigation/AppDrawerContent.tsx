import React, { useEffect, useState } from "react";
import {
  Alert,
  Image,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  DrawerContentComponentProps,
  DrawerContentScrollView,
} from "@react-navigation/drawer";
import { Ionicons } from "@expo/vector-icons";

import ScreenBackground from "@/components/ScreenBackground";
import { theme } from "@/theme";
import { loadAdultModeEnabled, setAdultModeEnabled } from "@/services/adultMode";
import { getUserProfile } from "@/services/user";
import { auth } from "@/config/firebaseConfig";
import { deleteUserCompletely, ensureAuth } from "@/services/firebase";
import { useLocale } from "@/contexts/LocaleContext";

type ActionButtonProps = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  danger?: boolean;
};

function ActionButton({ icon, label, onPress, danger }: ActionButtonProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[styles.actionButton, danger ? styles.actionButtonDanger : null]}
    >
      <Ionicons
        name={icon}
        size={18}
        color={danger ? theme.colors.danger : "#E5E7EB"}
      />
      <Text style={[styles.actionText, danger ? styles.actionTextDanger : null]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export default function AppDrawerContent({
  navigation,
  ...rest
}: DrawerContentComponentProps) {
  const [profileName, setProfileName] = useState("Профиль");
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [adultModeEnabled, setAdultModeEnabledState] = useState(false);
  const [adultModeLoading, setAdultModeLoading] = useState(true);
  const { locale, setLocale } = useLocale();

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const profile = await getUserProfile();
        if (!alive) return;
        const name =
          profile?.displayName ??
          auth?.currentUser?.displayName ??
          "Профиль";
        const photo =
          profile?.photos?.[0] ?? auth?.currentUser?.photoURL ?? null;
        setProfileName(name);
        setAvatarUri(photo || null);
      } catch {
        if (!alive) return;
        setProfileName(auth?.currentUser?.displayName ?? "Профиль");
        setAvatarUri(auth?.currentUser?.photoURL ?? null);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const enabled = await loadAdultModeEnabled();
      if (alive) {
        setAdultModeEnabledState(enabled);
        setAdultModeLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const setLanguageChoice = (next: "ru" | "en") => {
    setLocale(next);
  };

  const handleToggleAdultMode = () => {
    if (adultModeLoading) return;

    if (!adultModeEnabled) {
      Alert.alert(
        "18+ режим",
        "В 18+ режиме появляются цели casual/sex и более откровенные анкеты. Подтверждая, вы заявляете, что вам 18 лет и вы согласны видеть такой контент.",
        [
          { text: "Отмена", style: "cancel" },
          {
            text: "Включить",
            style: "destructive",
            onPress: async () => {
              setAdultModeEnabledState(true);
              await setAdultModeEnabled(true);
            },
          },
        ],
      );
    } else {
      Alert.alert(
        "Выключить 18+ режим?",
        "Взрослые цели (casual/sex) будут скрыты, часть анкет пропадёт из выдачи.",
        [
          { text: "Отмена", style: "cancel" },
          {
            text: "Выключить",
            style: "default",
            onPress: async () => {
              setAdultModeEnabledState(false);
              await setAdultModeEnabled(false);
            },
          },
        ],
      );
    }
  };

  const openProfile = () => {
    navigation.navigate("Profile" as never);
    navigation.closeDrawer();
  };

  const navigateRoot = (routeName: string, params?: Record<string, any>) => {
    const root = navigation.getParent();
    if (root) {
      root.navigate(routeName as never, params as never);
    } else {
      navigation.navigate(routeName as never, params as never);
    }
    navigation.closeDrawer();
  };

  const handleDeleteAccount = () => {
    Alert.alert("Удалить аккаунт?", "Это действие нельзя отменить.", [
      { text: "Отмена", style: "cancel" },
      {
        text: "Удалить",
        style: "destructive",
        onPress: async () => {
          const uid = await ensureAuth();
          await deleteUserCompletely(uid);
          await AsyncStorage.removeItem("onboarded");
          Alert.alert("Удалено", "Ваш аккаунт удалён.");
          navigation.closeDrawer();
        },
      },
    ]);
  };

  const rootState = navigation.getParent()?.getState?.();
  const canSendMessage = rootState?.routeNames?.includes("DM");
  const canOpenLegal = rootState?.routeNames?.includes("Legal");

  return (
    <ScreenBackground variant="menu">
      <DrawerContentScrollView
        {...rest}
        contentContainerStyle={styles.container}
        style={styles.scroll}
      >
        <View style={styles.profileCard}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Ionicons name="person" size={26} color="#fff" />
            </View>
          )}
          <View style={styles.profileMeta}>
            <Text style={styles.profileName}>{profileName}</Text>
            <TouchableOpacity
              onPress={openProfile}
              activeOpacity={0.85}
              style={styles.profileButton}
            >
              <Text style={styles.profileButtonText}>Открыть профиль</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Настройки</Text>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>18+ режим</Text>
            <Switch
              value={adultModeEnabled}
              onValueChange={handleToggleAdultMode}
              disabled={adultModeLoading}
            />
          </View>
          <View style={styles.rowColumn}>
            <Text style={styles.rowLabel}>Язык</Text>
            <View style={styles.languageRow}>
              <TouchableOpacity
                onPress={() => setLanguageChoice("ru")}
                style={[
                  styles.languageButton,
                  locale === "ru" ? styles.languageButtonActive : null,
                ]}
              >
                <Text
                  style={[
                    styles.languageText,
                    locale === "ru" ? styles.languageTextActive : null,
                  ]}
                >
                  Русский
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setLanguageChoice("en")}
                style={[
                  styles.languageButton,
                  locale === "en" ? styles.languageButtonActive : null,
                ]}
              >
                <Text
                  style={[
                    styles.languageText,
                    locale === "en" ? styles.languageTextActive : null,
                  ]}
                >
                  English
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Действия</Text>
          {canOpenLegal ? (
            <ActionButton
              icon="document-text-outline"
              label="Политика конфиденциальности"
              onPress={() => navigateRoot("Legal")}
            />
          ) : null}
          {canSendMessage ? (
            <ActionButton
              icon="chatbubble-ellipses-outline"
              label="Отправить сообщение"
              onPress={() =>
                navigateRoot("DM", { peerId: "demo-peer", peerName: "Demo" })
              }
            />
          ) : null}
          <ActionButton
            icon="trash-outline"
            label="Удалить аккаунт"
            onPress={handleDeleteAccount}
            danger
          />
        </View>
      </DrawerContentScrollView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  container: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    paddingTop: 8,
  },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.35)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    marginBottom: 16,
  },
  avatar: { width: 54, height: 54, borderRadius: 27 },
  avatarPlaceholder: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  profileMeta: { flex: 1, marginLeft: 12 },
  profileName: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 8,
  },
  profileButton: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  profileButtonText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  section: {
    padding: 14,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.28)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    marginBottom: 16,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.3,
    textTransform: "uppercase",
    marginBottom: 12,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowColumn: { gap: 8 },
  rowLabel: { color: "#E5E7EB", fontSize: 14, fontWeight: "600" },
  languageRow: { flexDirection: "row", gap: 10 },
  languageButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  languageButtonActive: {
    backgroundColor: "rgba(255,255,255,0.18)",
    borderColor: "rgba(255,255,255,0.3)",
  },
  languageText: {
    color: "#E5E7EB",
    textAlign: "center",
    fontSize: 12,
    fontWeight: "700",
  },
  languageTextActive: { color: "#fff" },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
  },
  actionButtonDanger: { marginTop: 8 },
  actionText: { color: "#E5E7EB", fontSize: 14, fontWeight: "600" },
  actionTextDanger: { color: theme.colors.danger },
});
