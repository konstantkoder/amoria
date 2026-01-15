import React from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useLocale } from "@/contexts/LocaleContext";
import { LANGUAGE_LABELS } from "@/i18n/translations";

type Props = {
  onClose?: () => void;
};

export default function AppDrawerContent({ onClose }: Props) {
  const navigation = useNavigation<any>();
  const { t, locale, openLanguagePicker } = useLocale();
  const languageLabel = LANGUAGE_LABELS[locale];

  const handleClose = React.useCallback(() => {
    onClose?.();
  }, [onClose]);

  const handleOpenLanguagePicker = React.useCallback(() => {
    openLanguagePicker();
    onClose?.();
  }, [openLanguagePicker, onClose]);

  const navigateSafe = React.useCallback(
    (routeName: string) => {
      try {
        navigation.navigate(routeName);
      } catch {
        // ignore navigation errors when route is missing
      } finally {
        onClose?.();
      }
    },
    [navigation, onClose],
  );

  return (
    <View style={styles.container}>
      <View style={styles.panel}>
        <Text style={styles.title}>{t("menu.title")}</Text>
        <Text style={styles.subtitle}>
          {t("menu.languageCurrent", {
            code: locale.toUpperCase(),
            language: languageLabel,
          })}
        </Text>
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
            <Ionicons name="close-outline" size={20} color="#E5E7EB" />
            <Text style={styles.buttonText}>{t("menu.close")}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => navigateSafe("Profile")}
            activeOpacity={0.85}
            style={styles.button}
          >
            <Ionicons name="person-outline" size={20} color="#E5E7EB" />
            <Text style={styles.buttonText}>{t("menu.profile")}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleOpenLanguagePicker}
            activeOpacity={0.85}
            style={styles.button}
          >
            <Ionicons name="language-outline" size={20} color="#E5E7EB" />
            <Text style={styles.buttonText}>{t("menu.language")}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => navigateSafe("Tabs")}
            activeOpacity={0.85}
            style={styles.button}
          >
            <Ionicons name="home-outline" size={20} color="#E5E7EB" />
            <Text style={styles.buttonText}>{t("tabs.feed")}</Text>
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
    backgroundColor: "rgba(0,0,0,0.20)",
    borderRadius: 18,
    padding: 16,
    margin: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    flex: 1,
    alignSelf: "stretch",
    justifyContent: "flex-start",
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
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  buttonText: {
    color: "rgba(255,255,255,0.92)",
    fontSize: 15,
    fontWeight: "700",
    textShadowColor: "rgba(0,0,0,0.75)",
    textShadowRadius: 6,
    textShadowOffset: { width: 0, height: 2 },
  },
});
