import React from "react";
import { Text, ScrollView, Button } from "react-native";
import { theme } from "@/theme";
import { useLocale } from "@/contexts/LocaleContext";

export default function LegalScreen({ navigation }: any) {
  const { t } = useLocale();
  return (
    <ScrollView
      style={{
        flex: 1,
        backgroundColor: theme.colors.background,
        padding: 16,
      }}
    >
      <Text style={{ fontSize: 24, fontWeight: "700", marginBottom: 12 }}>
        {t("legal.privacy.title")}
      </Text>
      <Text style={{ marginBottom: 12 }}>{t("legal.privacy.body")}</Text>
      <Button title={t("common.back")} onPress={() => navigation.goBack()} />
    </ScrollView>
  );
}
