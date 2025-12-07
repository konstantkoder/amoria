import React from "react";
import { ScrollView, Text } from "react-native";
import { theme } from "@/theme";
export default function TermsScreen() {
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.bg, padding: 16 }}
    >
      <Text style={{ fontSize: 24, fontWeight: "700", marginBottom: 12 }}>
        Условия использования
      </Text>
      <Text>
        - Будьте уважительны. Нет спаму, домогательствам и NSFW-контенту.
      </Text>
      <Text>
        - Публикуйте только свой контент. Соблюдайте законы и авторские права.
      </Text>
      <Text>- Мы можем заблокировать аккаунт за нарушения.</Text>
      <Text style={{ marginTop: 12, opacity: 0.7 }}>Версия: 0.2.0</Text>
    </ScrollView>
  );
}
