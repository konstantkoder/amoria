import React from "react";
import { StyleSheet, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocale } from "@/contexts/LocaleContext";

type Props = {
  onPress: () => void;
};

export default function MenuButton({ onPress }: Props) {
  const { t } = useLocale();
  return (
    <TouchableOpacity
      onPress={onPress}
      style={styles.button}
      activeOpacity={0.85}
    >
      <Ionicons name="menu-outline" size={20} color="#fff" />
      <Text style={styles.label}>{t("menu.title")}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(8, 12, 24, 0.46)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  label: { color: "#fff", fontSize: 11, fontWeight: "700" },
});
