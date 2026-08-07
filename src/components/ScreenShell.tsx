import React from "react";
import { Image, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";

import ScreenBackground, {
  type ScreenBackgroundVariant,
} from "@/components/ScreenBackground";
import MenuButton from "@/components/MenuButton";
import { openDrawer } from "@/navigation/drawerController";
import {
  type RootStackNavigationProp,
} from "@/navigation/appRoutes";
import { theme } from "@/theme";

type Props = {
  title?: string;
  titleNumberOfLines?: number;
  headerCenter?: React.ReactNode;
  background?: ScreenBackgroundVariant;
  blurRadius?: number;
  showHeader?: boolean;
  showBack?: boolean;
  onBack?: () => void;
  children: React.ReactNode;
};

export default function ScreenShell({
  title,
  titleNumberOfLines = 1,
  headerCenter,
  background = "startLighthouseV6",
  blurRadius,
  showHeader = true,
  showBack,
  onBack,
  children,
}: Props) {
  const navigation = useNavigation<RootStackNavigationProp>();

  const handleBack = () => {
    if (onBack) return onBack();
    if (navigation.canGoBack()) navigation.goBack();
  };

  const handleMenu = () => {
    openDrawer();
  };

  return (
    <ScreenBackground
      variant={background}
      blurRadius={blurRadius}
    >
      <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
        {showHeader ? (
          <View style={styles.header}>
            <View style={styles.headerSide}>
              {showBack ? (
                <TouchableOpacity
                  onPress={handleBack}
                  style={styles.iconButton}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                >
                  <Ionicons name="chevron-back" size={22} color={theme.colors.textWarm} />
                </TouchableOpacity>
              ) : (
                <View style={styles.brandGroup} accessible={false}>
                  <Image
                    source={require("../../assets/brand/amoria_startup_mark_1024.png")}
                    style={styles.brandMark}
                    resizeMode="contain"
                  />
                  <Text style={styles.wordmark}>Amoria</Text>
                </View>
              )}
            </View>

            <View style={styles.titleWrap}>
              {headerCenter ?? (title ? (
                <Text style={styles.title} numberOfLines={titleNumberOfLines}>
                  {title}
                </Text>
              ) : null)}
            </View>

            <View style={styles.headerSide}>
              <MenuButton onPress={handleMenu} />
            </View>
          </View>
        ) : null}
      </SafeAreaView>

      <SafeAreaView style={styles.bodySafe} edges={["left", "right", "bottom"]}>
        <View style={styles.content}>{children}</View>
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  safe: { paddingHorizontal: 16, backgroundColor: "transparent" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 48,
    paddingVertical: 2,
  },
  headerSide: { width: 92, flexDirection: "row", alignItems: "center" },
  titleWrap: { flex: 1, alignItems: "center", paddingHorizontal: 6 },
  title: {
    color: theme.colors.textWarm,
    fontSize: 16,
    fontFamily: Platform.select({ ios: "Georgia", default: "serif" }),
    fontWeight: "600",
    lineHeight: 20,
    textAlign: "center",
    letterSpacing: 0.2,
    textShadowColor: "rgba(0,0,0,0.48)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  iconButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minWidth: 44,
    minHeight: 44,
    backgroundColor: "transparent",
  },
  brandGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  brandMark: {
    width: 22,
    height: 22,
  },
  wordmark: {
    color: "#F3C98B",
    fontFamily: Platform.select({ ios: "Georgia", default: "serif" }),
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600",
    letterSpacing: 0.4,
    textShadowColor: "rgba(0,0,0,0.55)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  bodySafe: { flex: 1, paddingHorizontal: 16, paddingTop: 8, backgroundColor: "transparent" },
  content: { flex: 1, backgroundColor: "transparent" },
});
