import React from "react";
import { Linking, ScrollView, Text, TouchableOpacity, View } from "react-native";

import ScreenShell from "@/components/ScreenShell";
import { useLocale } from "@/contexts/LocaleContext";
import { PRIVACY_TEXT } from "@/content/privacyText";
import { getApiBaseUrl } from "@/config/apiConfig";
import { theme } from "@/theme";

export default function PrivacyPolicyScreen() {
  const { locale, t } = useLocale();
  const content =
    (PRIVACY_TEXT as Record<string, { updated: string; body: string }>)[
      locale
    ] ?? PRIVACY_TEXT.en;

  return (
    <ScreenShell
      title={t("screen.privacy")}
      background="profileArchGardenV6"
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
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => Linking.openURL(`${getApiBaseUrl()}/privacy`)}
            style={{ alignSelf: "flex-start", marginTop: 18, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, backgroundColor: theme.buttons.primary.backgroundColor }}
          >
            <Text style={{ color: theme.buttons.primary.textColor, fontWeight: "800" }}>
              {t("privacy.openPublicPage")}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </ScreenShell>
  );
}
