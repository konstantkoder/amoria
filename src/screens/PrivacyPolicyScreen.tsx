import React from "react";
import { ScrollView, Text, View } from "react-native";

import ScreenShell from "@/components/ScreenShell";
import { useLocale } from "@/contexts/LocaleContext";
import { PRIVACY_TEXT } from "@/content/privacyText";

export default function PrivacyPolicyScreen() {
  const { locale, t } = useLocale();
  const content =
    (PRIVACY_TEXT as Record<string, { updated: string; body: string }>)[
      locale
    ] ?? PRIVACY_TEXT.en;

  return (
    <ScreenShell
      title={t("screen.privacy")}
      background="utilityWarm"
      showBack
    >
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={{ paddingHorizontal: 6, paddingTop: 8, paddingBottom: 24 }}>
          <Text
            style={{
              color: "#E5E7EB",
              fontSize: 13,
              fontWeight: "700",
              marginBottom: 12,
            }}
          >
            {content.updated}
          </Text>
          <Text
            style={{
              color: "#E5E7EB",
              fontSize: 14,
              lineHeight: 20,
            }}
          >
            {content.body}
          </Text>
        </View>
      </ScrollView>
    </ScreenShell>
  );
}
