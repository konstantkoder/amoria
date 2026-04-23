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
    borderRadius: 999,
    backgroundColor: "rgba(8, 12, 24, 0.96)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.24)",
    shadowColor: "#000000",
    shadowOpacity: 0.28,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  label: { color: "#fff", fontSize: 12, fontWeight: "800", letterSpacing: 0.2 },
});
