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
        <View style={styles.titlePill}>
          <Text style={styles.title}>{t("menu.title")}</Text>
        </View>
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
              <Ionicons name="close-outline" size={20} color={theme.colors.text} />
            </View>
            <Text style={styles.buttonText}>{t("menu.close")}</Text>
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
            style={styles.button}
          >
            <View style={styles.iconWrap}>
              <Ionicons name="log-out-outline" size={20} color={theme.colors.text} />
            </View>
            <Text style={styles.buttonText}>{t("menu.logout")}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleOpenTogether}
            activeOpacity={0.85}
            style={styles.button}
          >
            <View style={styles.iconWrap}>
              <Ionicons name="home-outline" size={20} color={theme.colors.text} />
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
    backgroundColor: "rgba(6, 9, 18, 0.18)",
  },
  panel: {
    backgroundColor: "rgba(8, 11, 22, 0.94)",
    borderRadius: 26,
    paddingHorizontal: 14,
    paddingTop: 16,
    paddingBottom: 12,
    margin: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    flex: 1,
    alignSelf: "stretch",
    justifyContent: "flex-start",
    shadowColor: "#000000",
    shadowOpacity: 0.35,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 14,
  },
  titlePill: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 9,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  title: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: "800",
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
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
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
    borderColor: "rgba(255,255,255,0.10)",
  },
  buttonText: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: "800",
  },
  localeBadge: {
    marginLeft: "auto",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: theme.shapes.pill,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  localeBadgeText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: "800",
  },
});
