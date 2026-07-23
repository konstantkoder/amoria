import React from "react";
import { Linking, ScrollView, Text, TouchableOpacity, View } from "react-native";

import ScreenShell from "@/components/ScreenShell";
import { useLocale } from "@/contexts/LocaleContext";
import { theme } from "@/theme";

export default function LocationInfoScreen() {
  const { t } = useLocale();

  const bullets = [
    t("locationInfo.nearbyUsesLocation"),
    t("locationInfo.shareMeOptIn"),
    t("locationInfo.approximateOnly"),
  ];

  return (
    <ScreenShell
      title={t("screen.locationInfo")}
      background="utilityWarm"
      showBack
    >
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={{ paddingHorizontal: 6, paddingTop: 8, paddingBottom: 24 }}>
          {bullets.map((line) => (
            <View
              key={line}
              style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 10 }}
            >
              <Text style={{ color: "#E5E7EB", fontSize: 14 }}>•</Text>
              <Text style={{ color: "#E5E7EB", fontSize: 14, lineHeight: 20, flex: 1 }}>
                {line}
              </Text>
            </View>
          ))}

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => Linking.openSettings()}
            style={{
              alignSelf: "flex-start",
              paddingHorizontal: 14,
              paddingVertical: 10,
              borderRadius: 14,
              backgroundColor: theme.buttons.primary.backgroundColor,
              borderWidth: 1,
              borderColor: theme.buttons.primary.borderColor,
              marginTop: 6,
            }}
          >
            <Text style={{ color: theme.buttons.primary.textColor, fontWeight: "800" }}>
              {t("settings.openSystemSettings")}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </ScreenShell>
  );
}
