import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { useLocale } from "@/contexts/LocaleContext";

export default function FounderBadge({ number, large = false }: { number?: number | null; large?: boolean }) {
  const { t, locale } = useLocale();
  if (!number) return null;
  const localizedNumber = new Intl.NumberFormat(locale, { useGrouping: false }).format(number);
  const size = large ? 84 : 22;
  return (
    <View style={[styles.row, large ? styles.large : null]} accessibilityLabel={t("founder.badgeA11y", { number: localizedNumber })}>
      <Image
        source={large
          ? require("@/assets/founder/amoria_founder_badge_A_master_1024.png")
          : require("@/assets/founder/amoria_founder_badge_A_small_64.png")}
        style={{ width: size, height: size }}
        resizeMode="contain"
      />
      <Text style={[styles.number, large ? styles.largeNumber : null]}>{t("founder.badgeNumber", { number: localizedNumber })}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start" },
  large: { flexDirection: "column", alignItems: "center", alignSelf: "center", gap: 8 },
  number: { color: "#F3C98B", fontSize: 12, fontWeight: "800" },
  largeNumber: { fontSize: 18 },
});
