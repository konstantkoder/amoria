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
import { useNavigation } from "@react-navigation/native";
import { useLocale } from "@/contexts/LocaleContext";
import { auth } from "@/config/firebaseConfig";
import { type RootStackNavigationProp } from "@/navigation/appRoutes";
import { signOut } from "firebase/auth";
import { theme } from "@/theme";

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

export default function AppDrawerContent({ onClose }: Props) {
  const navigation = useNavigation<RootStackNavigationProp>();
  const { t, locale, openLanguagePicker } = useLocale();

  const handleClose = React.useCallback(() => {
    onClose?.();
  }, [onClose]);

  const handleLogout = React.useCallback(async () => {
    try {
      if (auth) {
        await signOut(auth);
      }
      onClose?.();
    } catch (error) {
      console.error("[auth] signOut failed", error);
      Alert.alert(t("common.error"), t("menu.logoutFailed"));
      onClose?.();
    }
  }, [onClose, t]);

  const handleOpenProfile = React.useCallback(() => {
    onClose?.();
    navigation.navigate("Profile");
  }, [navigation, onClose]);

  const handleOpenSettings = React.useCallback(() => {
    onClose?.();
    navigation.navigate("Settings");
  }, [navigation, onClose]);

  const handleOpenPrivacyPolicy = React.useCallback(() => {
    onClose?.();
    navigation.navigate("PrivacyPolicy");
  }, [navigation, onClose]);

  const handleOpenTogether = React.useCallback(() => {
    onClose?.();
    navigation.navigate("Tabs", { screen: "Together" });
  }, [navigation, onClose]);

  const handleLanguagePress = React.useCallback(() => {
    openLanguagePicker();
    onClose?.();
  }, [openLanguagePicker, onClose]);

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
            <Text style={styles.subtitleStrong}>{t("tabs.together")}</Text>
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
          <TouchableOpacity
            onPress={handleOpenTogether}
            activeOpacity={0.85}
            style={[styles.button, styles.primaryButton]}
          >
            <View style={[styles.iconWrap, styles.primaryIconWrap]}>
              <Ionicons name="home-outline" size={20} color="#FFFFFF" />
            </View>
            <Text style={[styles.buttonText, styles.primaryButtonText]}>
              {t("tabs.together")}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleOpenProfile}
            activeOpacity={0.85}
            style={styles.button}
          >
            <View style={styles.iconWrap}>
              <Ionicons name="person-outline" size={20} color={theme.colors.text} />
            </View>
            <Text style={styles.buttonText}>{t("menu.profile")}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleOpenSettings}
            activeOpacity={0.85}
            style={styles.button}
          >
            <View style={styles.iconWrap}>
              <Ionicons name="settings-outline" size={20} color={theme.colors.text} />
            </View>
            <Text style={styles.buttonText}>{t("menu.settings")}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleLanguagePress}
            activeOpacity={0.85}
            style={styles.button}
          >
            <View style={styles.iconWrap}>
              <Ionicons name="globe-outline" size={20} color={theme.colors.text} />
            </View>
            <Text style={styles.buttonText}>{t("menu.language")}</Text>
            <View style={styles.localeBadge}>
              <Text style={styles.localeBadgeText}>
                {locale.toUpperCase()}
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleOpenPrivacyPolicy}
            activeOpacity={0.85}
            style={styles.button}
          >
            <View style={styles.iconWrap}>
              <Ionicons name="document-text-outline" size={20} color={theme.colors.text} />
            </View>
            <Text style={styles.buttonText}>{t("screen.privacy")}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleLogout}
            activeOpacity={0.85}
            style={[styles.button, styles.dangerButton]}
          >
            <View style={[styles.iconWrap, styles.dangerIconWrap]}>
              <Ionicons name="log-out-outline" size={20} color="#FFD7DF" />
            </View>
            <Text style={styles.buttonText}>{t("menu.logout")}</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "rgba(2, 4, 12, 0.72)",
  },
  panel: {
    backgroundColor: "rgba(5, 9, 18, 0.995)",
    borderRadius: 26,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
    marginHorizontal: 10,
    marginTop: 10,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    flex: 1,
    alignSelf: "stretch",
    justifyContent: "flex-start",
    shadowColor: "#000000",
    shadowOpacity: 0.56,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 20 },
    elevation: 22,
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
    color: "rgba(255,255,255,0.58)",
    fontSize: 11,
    fontWeight: "700",
    paddingHorizontal: 2,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  subtitleStrong: {
    color: "#F3F4F6",
    fontSize: 12,
    fontWeight: "800",
    paddingHorizontal: 2,
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
    gap: 12,
    paddingBottom: 20,
  },
  panelContent: {
    paddingTop: 2,
    paddingBottom: 24,
  },
  panelScroll: {
    flex: 1,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 15,
    paddingVertical: 14,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    shadowColor: "#000000",
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  primaryButton: {
    backgroundColor: "rgba(255, 78, 138, 0.28)",
    borderColor: "rgba(255, 78, 138, 0.36)",
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
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  primaryIconWrap: {
    backgroundColor: "rgba(255,255,255,0.14)",
    borderColor: "rgba(255,255,255,0.2)",
  },
  dangerIconWrap: {
    backgroundColor: "rgba(255, 77, 103, 0.12)",
    borderColor: "rgba(255, 77, 103, 0.22)",
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
  primaryButtonText: {
    color: "#FFF5FA",
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
