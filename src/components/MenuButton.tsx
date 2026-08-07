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
    minHeight: 42,
    paddingHorizontal: 13,
    paddingVertical: 7,
    backgroundColor: "transparent",
    borderWidth: 0,
  },
  label: { color: "#fff", fontSize: 12, fontWeight: "800", letterSpacing: 0.2 },
});
