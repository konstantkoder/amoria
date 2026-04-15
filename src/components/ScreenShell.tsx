import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";

import ScreenBackground, {
  type ScreenBackgroundVariant,
} from "@/components/ScreenBackground";
import MenuButton from "@/components/MenuButton";
import { openDrawer } from "@/navigation/drawerController";
import { type RootStackNavigationProp } from "@/navigation/appRoutes";

type Props = {
  title?: string;
  background?: ScreenBackgroundVariant;
  overlayOpacity?: number;
  blurRadius?: number;
  showHeader?: boolean;
  showBack?: boolean;
  onBack?: () => void;
  children: React.ReactNode;
};

export default function ScreenShell({
  title,
  background = "default",
  overlayOpacity,
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
      overlayOpacity={overlayOpacity}
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
                >
                  <Ionicons name="chevron-back" size={22} color="#fff" />
                </TouchableOpacity>
              ) : null}
            </View>

            <View style={styles.titleWrap}>
              {title ? (
                <Text style={styles.title} numberOfLines={1}>
                  {title}
                </Text>
              ) : null}
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
  safe: { paddingHorizontal: 12, backgroundColor: "transparent" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 46,
    paddingVertical: 6,
  },
  headerSide: { width: 86, flexDirection: "row", alignItems: "center" },
  titleWrap: { flex: 1, alignItems: "center", paddingHorizontal: 6 },
  title: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0.2,
    textShadowColor: "rgba(0,0,0,0.35)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  iconButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minWidth: 40,
    minHeight: 38,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(8, 12, 24, 0.46)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  bodySafe: { flex: 1, paddingHorizontal: 12, backgroundColor: "transparent" },
  content: { flex: 1, backgroundColor: "transparent" },
});
