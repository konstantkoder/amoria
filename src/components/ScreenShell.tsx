import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { DrawerActions, useNavigation } from "@react-navigation/native";

import ScreenBackground, {
  type ScreenBackgroundVariant,
} from "@/components/ScreenBackground";
import MenuButton from "@/components/MenuButton";

type Props = {
  title?: string;
  background?: ScreenBackgroundVariant;
  overlayOpacity?: number;
  blurRadius?: number;
  debugTint?: boolean;
  showBack?: boolean;
  onBack?: () => void;
  children: React.ReactNode;
};

export default function ScreenShell({
  title,
  background = "default",
  overlayOpacity,
  blurRadius,
  debugTint = false,
  showBack,
  onBack,
  children,
}: Props) {
  const navigation = useNavigation<any>();

  const handleBack = () => {
    if (onBack) return onBack();
    if (navigation.canGoBack()) navigation.goBack();
  };

  const handleMenu = () => {
    const parent = navigation.getParent?.();
    if (parent && typeof (parent as any).openDrawer === "function") {
      (parent as any).openDrawer();
      return;
    }
    if (typeof (navigation as any).openDrawer === "function") {
      (navigation as any).openDrawer();
      return;
    }
    navigation.dispatch(DrawerActions.openDrawer());
  };

  return (
    <ScreenBackground
      variant={background}
      overlayOpacity={overlayOpacity}
      blurRadius={blurRadius}
      debugTint={debugTint}
    >
      <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
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
      </SafeAreaView>

      <SafeAreaView style={styles.bodySafe} edges={["left", "right", "bottom"]}>
        <View style={styles.content}>{children}</View>
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  safe: { paddingHorizontal: 12 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
  },
  headerSide: { width: 90, flexDirection: "row", alignItems: "center" },
  titleWrap: { flex: 1, alignItems: "center" },
  title: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  iconButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.25)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  bodySafe: { flex: 1, paddingHorizontal: 12 },
  content: { flex: 1 },
});
