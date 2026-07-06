import React from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useNavigationState } from "@react-navigation/native";
import { useAuth } from "@/contexts/AuthContext";
import { useLocale } from "@/contexts/LocaleContext";
import { type RootStackNavigationProp } from "@/navigation/appRoutes";
import { theme } from "@/theme";

const DRAWER_ACTIVE_TINT = "#F3C98B";
const DRAWER_ACTIVE_BACKGROUND = "rgba(185, 130, 114, 0.23)";
const DRAWER_ACTIVE_BORDER = "rgba(245, 205, 139, 0.42)";

type Props = {
  onClose?: () => void;
};

function copyOrFallback(
  t: (key: string, params?: Record<string, string>) => string,
  key: string,
  fallback: string
) {
  const value = t(key);
  return value === key ? fallback : value;
}

type DrawerSection =
  | "profile"
  | "settings"
  | "language"
  | "privacy";

type RouteSnapshot = {
  name?: string;
  state?: {
    index?: number;
    routes?: RouteSnapshot[];
  };
};

function activeSectionFromRoute(route?: RouteSnapshot): DrawerSection | null {
  if (!route?.name) return null;

  if (route.name === "Tabs") {
    return null;
  }

  if (route.name === "Profile" || route.name === "UserProfile") return "profile";
  if (route.name === "Settings" || route.name === "LocationInfo") return "settings";
  if (route.name === "PrivacyPolicy") return "privacy";
  return null;
}

export default function AppDrawerContent({ onClose }: Props) {
  const navigation = useNavigation<RootStackNavigationProp>();
  const auth = useAuth();
  const { t, locale, openLanguagePicker } = useLocale();
  const activeSection = useNavigationState((state) =>
    activeSectionFromRoute(state.routes[state.index] as RouteSnapshot | undefined)
  );

  const handleClose = React.useCallback(() => {
    onClose?.();
  }, [onClose]);

  const handleLogout = React.useCallback(async () => {
    let hasError = false;

    try {
      await auth.logout();
    } catch (error) {
      hasError = true;
      console.error("[auth] backend logout failed", error);
    } finally {
      onClose?.();
    }

    if (hasError) {
      Alert.alert(t("common.error"), t("menu.logoutFailed"));
    }
  }, [auth, onClose, t]);

  const handleOpenProfile = React.useCallback(() => {
    onClose?.();
    navigation.navigate("Profile", { screen: "ProfileMain" });
  }, [navigation, onClose]);

  const handleOpenSettings = React.useCallback(() => {
    onClose?.();
    navigation.navigate("Settings");
  }, [navigation, onClose]);

  const handleOpenPrivacyPolicy = React.useCallback(() => {
    onClose?.();
    navigation.navigate("PrivacyPolicy");
  }, [navigation, onClose]);

  const handleLanguagePress = React.useCallback(() => {
    openLanguagePicker();
    onClose?.();
  }, [openLanguagePicker, onClose]);

  const renderButton = React.useCallback(
    ({
      section,
      icon,
      iconNode,
      label,
      onPress,
      tone = "default",
      trailing,
    }: {
      section?: DrawerSection;
      icon?: keyof typeof Ionicons.glyphMap;
      iconNode?: (active: boolean) => React.ReactNode;
      label: string;
      onPress: () => void;
      tone?: "default" | "danger";
      trailing?: React.ReactNode;
    }) => {
      const active = Boolean(section && activeSection === section);
      return (
        <TouchableOpacity
          onPress={onPress}
          activeOpacity={0.85}
          style={[
            styles.button,
            active ? styles.activeButton : null,
            tone === "danger" ? styles.dangerButton : null,
          ]}
        >
          <View
            style={[
              styles.iconWrap,
              active ? styles.activeIconWrap : null,
              tone === "danger" ? styles.dangerIconWrap : null,
            ]}
          >
            {iconNode ? (
              iconNode(active)
            ) : icon ? (
              <Ionicons
                name={icon}
                size={20}
                color={tone === "danger" ? "#FFD7DF" : active ? DRAWER_ACTIVE_TINT : "#FFFFFF"}
              />
            ) : null}
          </View>
          <Text style={[styles.buttonText, active ? styles.activeButtonText : null]}>
            {label}
          </Text>
          {active ? <View style={styles.activeDot} /> : null}
          {trailing}
        </TouchableOpacity>
      );
    },
    [activeSection]
  );

  return (
    <View style={styles.container}>
      <View style={styles.panel}>
        <View style={styles.headerRow}>
          <View style={styles.titleWrap}>
            <View style={styles.titlePill}>
              <Text style={styles.title}>{t("menu.title")}</Text>
            </View>
            <Text style={styles.subtitle}>
              {copyOrFallback(t, "menu.subtitle", "Быстрый доступ")}
            </Text>
          </View>
          <TouchableOpacity
            onPress={handleClose}
            activeOpacity={0.85}
            style={styles.closeButton}
          >
            <Ionicons name="close-outline" size={18} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
        <ScrollView
          style={styles.panelScroll}
          contentContainerStyle={[styles.content, styles.panelContent]}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.sectionLabel}>
            {copyOrFallback(t, "menu.sectionAccount", "Аккаунт")}
          </Text>
          {renderButton({
            section: "profile",
            icon: "person-outline",
            label: t("menu.profile"),
            onPress: handleOpenProfile,
          })}
          {renderButton({
            section: "settings",
            icon: "settings-outline",
            label: t("menu.settings"),
            onPress: handleOpenSettings,
          })}
          {renderButton({
            section: "language",
            icon: "globe-outline",
            label: t("menu.language"),
            onPress: handleLanguagePress,
            trailing: (
              <View style={styles.localeBadge}>
                <Text style={styles.localeBadgeText}>{locale.toUpperCase()}</Text>
              </View>
            ),
          })}
          {renderButton({
            section: "privacy",
            icon: "document-text-outline",
            label: copyOrFallback(t, "menu.privacy", "Политика"),
            onPress: handleOpenPrivacyPolicy,
          })}
          {renderButton({
            icon: "log-out-outline",
            label: t("menu.logout"),
            onPress: handleLogout,
            tone: "danger",
          })}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "rgba(10, 16, 31, 0.28)",
  },
  panel: {
    backgroundColor: "rgba(20, 28, 45, 0.78)",
    borderRadius: 26,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
    marginHorizontal: 10,
    marginTop: 10,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.24)",
    flex: 1,
    alignSelf: "stretch",
    justifyContent: "flex-start",
    shadowColor: "#000000",
    shadowOpacity: 0.32,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 14 },
    elevation: 16,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
  },
  titleWrap: {
    flex: 1,
    gap: 5,
  },
  titlePill: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  title: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "800",
  },
  subtitle: {
    color: "rgba(255,255,255,0.68)",
    fontSize: 11,
    fontWeight: "700",
    paddingHorizontal: 2,
    letterSpacing: 0,
    textTransform: "uppercase",
  },
  closeButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  content: {
    gap: 9,
    paddingBottom: 20,
  },
  panelContent: {
    paddingTop: 2,
    paddingBottom: 24,
  },
  panelScroll: {
    flex: 1,
  },
  sectionLabel: {
    color: "rgba(255,255,255,0.62)",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0,
    textTransform: "uppercase",
    paddingHorizontal: 4,
    marginTop: 4,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: "rgba(12, 18, 32, 0.82)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    shadowColor: "#000000",
    shadowOpacity: 0.10,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  activeButton: {
    backgroundColor: DRAWER_ACTIVE_BACKGROUND,
    borderColor: DRAWER_ACTIVE_BORDER,
    shadowColor: DRAWER_ACTIVE_TINT,
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 6,
  },
  dangerButton: {
    backgroundColor: "rgba(255, 77, 103, 0.10)",
    borderColor: "rgba(255, 77, 103, 0.22)",
  },
  iconWrap: {
    width: 36,
    height: 36,
    marginRight: 10,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  activeIconWrap: {
    backgroundColor: "rgba(185, 130, 114, 0.16)",
    borderColor: "rgba(245, 205, 139, 0.36)",
  },
  dangerIconWrap: {
    backgroundColor: "rgba(255, 77, 103, 0.12)",
    borderColor: "rgba(255, 77, 103, 0.22)",
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
    flexShrink: 1,
  },
  activeButtonText: {
    color: DRAWER_ACTIVE_TINT,
  },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: "auto",
    backgroundColor: DRAWER_ACTIVE_TINT,
  },
  localeBadge: {
    marginLeft: "auto",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: theme.shapes.pill,
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },
  localeBadgeText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },
});
