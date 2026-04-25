import React from "react";
import { StyleSheet, Text, View } from "react-native";

import ScreenShell from "@/components/ScreenShell";
import NearbyNowSection from "@/components/nearby/NearbyNowSection";
import { useLocale } from "@/contexts/LocaleContext";
import { theme } from "@/theme";

function copyOrFallback(
  t: (key: string, params?: Record<string, string>) => string,
  key: string,
  fallback: string
) {
  const value = t(key);
  return value === key ? fallback : value;
}

export default function NearbyHubScreen() {
  const { t } = useLocale();
  const title = copyOrFallback(t, "tabs.nearby", "Nearby");
  const quickIntents = React.useMemo(
    () => [
      copyOrFallback(t, "nearby.quickIntent.coffee", "Who wants coffee?"),
      copyOrFallback(t, "nearby.quickIntent.walk", "Who wants to walk?"),
      copyOrFallback(t, "nearby.quickIntent.bike", "Who wants to ride a bike?"),
    ],
    [t]
  );

  return (
    <ScreenShell title={title} background="now" overlayOpacity={0.18} blurRadius={0}>
      <View style={styles.screen}>
        <View style={styles.heroCard}>
          <Text style={styles.heroKicker}>
            {copyOrFallback(t, "nearby.heroKicker", "Nearby")}
          </Text>
          <Text style={styles.heroTitle}>
            {copyOrFallback(t, "nearby.heroTitle", "People and quick intent nearby")}
          </Text>
          <Text style={styles.heroBody}>
            {copyOrFallback(
              t,
              "nearby.heroBody",
              "A live pulse by location: who is nearby right now and what they want for the next moment."
            )}
          </Text>
          <View style={styles.intentRow}>
            {quickIntents.map((item) => (
              <View key={item} style={styles.intentPill}>
                <Text style={styles.intentText}>{item}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.panelArea}>
          <NearbyNowSection />
        </View>
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 2,
    paddingBottom: 6,
  },
  heroCard: {
    borderRadius: theme.shapes.card,
    padding: 16,
    backgroundColor: "rgba(10, 21, 24, 0.92)",
    borderWidth: 1,
    borderColor: "rgba(70,224,200,0.16)",
    gap: 10,
  },
  heroKicker: {
    color: "#A9FFF0",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  heroTitle: {
    color: theme.colors.text,
    fontSize: 18,
    lineHeight: 23,
    fontWeight: "800",
  },
  heroBody: {
    color: theme.colors.subtext,
    fontSize: 13,
    lineHeight: 18,
  },
  intentRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  intentPill: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "rgba(70,224,200,0.10)",
    borderWidth: 1,
    borderColor: "rgba(70,224,200,0.18)",
  },
  intentText: {
    color: "#D7FFF6",
    fontSize: 11,
    fontWeight: "800",
  },
  panelArea: {
    flex: 1,
    minHeight: 0,
    marginTop: 8,
  },
});
