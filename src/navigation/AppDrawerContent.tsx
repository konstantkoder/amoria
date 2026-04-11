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
import { signOut } from "firebase/auth";

type Props = {
  onClose?: () => void;
};

export default function AppDrawerContent({ onClose }: Props) {
  const navigation = useNavigation<any>();
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
    } catch (err: any) {
      console.error("[auth] signOut failed", err);
      Alert.alert(t("common.error"), err?.message ?? t("common.error"));
      onClose?.();
    }
  }, [onClose, t]);

  const navigateSafe = React.useCallback(
    (routeName: string, params?: Record<string, unknown>) => {
      try {
        if (params) {
          navigation.navigate(routeName, params);
        } else {
          navigation.navigate(routeName);
        }
      } catch {
        // ignore navigation errors when route is missing
      } finally {
        onClose?.();
      }
    },
    [navigation, onClose],
  );

  // AMORIA_FIX_MENU_LANGUAGE_BUTTON
  const handleLanguagePress = React.useCallback(() => {
    openLanguagePicker();
    onClose?.();
  }, [openLanguagePicker, onClose]);

  return (
    <View style={styles.container}>
      <View style={styles.panel}>
        <View style={styles.titlePill}>
          <Text style={styles.title}>{t("menu.title")}</Text>
        </View>
        {/* AMORIA_FIX_MENU_LANG_DUPLICATE */}
        <ScrollView
          style={styles.panelScroll}
          contentContainerStyle={[styles.content, styles.panelContent]}
          showsVerticalScrollIndicator={false}
        >
          <TouchableOpacity
            onPress={handleClose}
            activeOpacity={0.85}
            style={styles.button}
          >
            <View style={styles.iconWrap}>
              <Ionicons name="close-outline" size={20} color="#E5E7EB" />
            </View>
            <Text style={styles.buttonText}>{t("menu.close")}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => navigateSafe("Profile")}
            activeOpacity={0.85}
            style={styles.button}
          >
            <View style={styles.iconWrap}>
              <Ionicons name="person-outline" size={20} color="#E5E7EB" />
            </View>
            <Text style={styles.buttonText}>{t("menu.profile")}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => navigateSafe("Settings")}
            activeOpacity={0.85}
            style={styles.button}
          >
            <View style={styles.iconWrap}>
              <Ionicons name="settings-outline" size={20} color="#E5E7EB" />
            </View>
            <Text style={styles.buttonText}>{t("menu.settings")}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            // AMORIA_FIX_MENU_LANGUAGE_BUTTON
            onPress={handleLanguagePress}
            activeOpacity={0.85}
            style={styles.button}
          >
            <View style={styles.iconWrap}>
              <Ionicons name="globe-outline" size={20} color="#E5E7EB" />
            </View>
            <Text style={styles.buttonText}>{t("menu.language")}</Text>
            <View
              style={{
                marginLeft: "auto",
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 999,
                backgroundColor: "rgba(255,255,255,0.10)",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.12)",
              }}
            >
              <Text style={{ color: "#E5E7EB", fontSize: 12, fontWeight: "800" }}>
                {locale.toUpperCase()}
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => navigateSafe("PrivacyPolicy")}
            activeOpacity={0.85}
            style={styles.button}
          >
            <View style={styles.iconWrap}>
              <Ionicons name="document-text-outline" size={20} color="#E5E7EB" />
            </View>
            <Text style={styles.buttonText}>{t("screen.privacy")}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleLogout}
            activeOpacity={0.85}
            style={styles.button}
          >
            <View style={styles.iconWrap}>
              <Ionicons name="log-out-outline" size={20} color="#E5E7EB" />
            </View>
            <Text style={styles.buttonText}>{t("menu.logout")}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => navigateSafe("Tabs", { screen: "Together" })}
            activeOpacity={0.85}
            style={styles.button}
          >
            <View style={styles.iconWrap}>
              <Ionicons name="home-outline" size={20} color="#E5E7EB" />
            </View>
            <Text style={styles.buttonText}>{t("tabs.together")}</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "transparent",
  },
  panel: {
    backgroundColor: "transparent",
    borderRadius: 18,
    padding: 16,
    margin: 12,
    borderWidth: 0,
    borderColor: "transparent",
    flex: 1,
    alignSelf: "stretch",
    justifyContent: "flex-start",
  },
  titlePill: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  title: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 12,
    textShadowColor: "rgba(0,0,0,0.75)",
    textShadowRadius: 6,
    textShadowOffset: { width: 0, height: 2 },
  },
  subtitlePill: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(0,0,0,0.42)",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  subtitle: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 12,
    textShadowColor: "rgba(0,0,0,0.65)",
    textShadowRadius: 6,
    textShadowOffset: { width: 0, height: 1 },
  },
  content: {
    gap: 10,
    paddingBottom: 20,
  },
  panelContent: {
    paddingBottom: 24,
  },
  panelScroll: {
    flex: 1,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginHorizontal: 12,
    marginVertical: 8,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.68)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  iconWrap: {
    marginRight: 10,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
    opacity: 0.95,
    textShadowColor: "rgba(0,0,0,0.85)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
});
