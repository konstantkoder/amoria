import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";

import ScreenBackground, {
  type ScreenBackgroundVariant,
} from "@/components/ScreenBackground";
import MenuButton from "@/components/MenuButton";

type Props = {
  title?: string;
  background?: ScreenBackgroundVariant;
  showBack?: boolean;
  onBack?: () => void;
  children: React.ReactNode;
};

export default function ScreenShell({
  title,
  background = "default",
  showBack,
  onBack,
  children,
}: Props) {
  const navigation = useNavigation<any>();

  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }
    if (navigation.canGoBack()) {
      navigation.goBack();
    }
  };

  const handleMenu = () => {
    navigation.navigate("Profile" as never);
  };

  return (
    <ScreenBackground variant={background}>
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
