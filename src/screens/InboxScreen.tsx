// NOTE: Modified copy of the original InboxScreen. The key difference is
// switching the background variant from the default smokey forest to the
// neon city. We also allow overlay and blur customization to brighten the
// chat tab while keeping the content legible. The rest of the screen
// logic remains identical to the upstream version.

import React, { useEffect, useState } from "react";
import { View, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { theme } from "@/theme";
import ScreenShell from "@/components/ScreenShell";
import { getLikes } from "@/services/likes";

export default function InboxScreen() {
  const insets = useSafeAreaInsets();
  const [likesCount, setLikesCount] = useState(0);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const ids = await getLikes();
        if (alive) setLikesCount(ids.length);
      } catch {
        // ignore errors fetching likes
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  return (
    <ScreenShell
      title="Чаты"
      // Use the neon city backdrop for chats as well to maintain a
      // consistent vibrant feel across the app. Adjust overlay and blur for
      // clarity.
      background="nightCity"
      overlayOpacity={0.3}
      blurRadius={2}
      debugTint={false}
    >
      <View
        style={{
          flex: 1,
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: insets.bottom + 8,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "baseline",
            justifyContent: "space-between",
            marginBottom: 8,
          }}
        >
          <Text
            style={{
              color: "#E5E7EB",
              fontSize: 18,
              fontWeight: "800",
            }}
          >
            Чаты
          </Text>
          <Text style={{ color: "#9CA3AF", fontSize: 12 }}>
            Лайкнутые: {likesCount}
          </Text>
        </View>
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
            Здесь будут собраны все твои переписки.{"\n"}
            Позже мы свяжём этот экран с матчами и сообщениями из ленты, анкет и “Сейчас”.
          </Text>
        </View>
      </View>
    </ScreenShell>
  );
}