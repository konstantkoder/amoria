// FILE: src/screens/InboxScreen.tsx
import React from "react";
import { View, Text } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { theme } from "@/theme";
import ScreenBackground from "@/components/ScreenBackground";

export default function InboxScreen() {
  const insets = useSafeAreaInsets();

  return (
    <ScreenBackground>
      <SafeAreaView
        style={{ flex: 1, backgroundColor: "transparent" }}
      >
        <View
          style={{
            flex: 1,
            paddingHorizontal: 16,
            paddingTop: 8,
            paddingBottom: insets.bottom + 8,
          }}
        >
          <Text
            style={{
              color: "#E5E7EB",
              fontSize: 18,
              fontWeight: "800",
              marginBottom: 8,
            }}
          >
            Чаты
          </Text>

          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons
              name="chatbubbles-outline"
              size={40}
              color={theme.colors.primary}
            />
            <Text
              style={{
                color: "#9CA3AF",
                fontSize: 13,
                textAlign: "center",
                marginTop: 8,
              }}
            >
              Здесь будут собраны все твои переписки.\n
              Позже мы свяжём этот экран с матчами и сообщениями из ленты,
              анкет и “Сейчас”.
            </Text>
          </View>
        </View>
      </SafeAreaView>
    </ScreenBackground>
  );
}

