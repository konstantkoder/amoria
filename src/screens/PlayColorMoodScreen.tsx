import React from "react";
import { StyleSheet, View } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";

import CoreStateCard from "@/components/CoreStateCard";
import ScreenShell from "@/components/ScreenShell";
import { useLocale } from "@/contexts/LocaleContext";
import {
  type PlayColorMoodRouteProp,
  type RootStackNavigationProp,
} from "@/navigation/appRoutes";

export default function PlayColorMoodScreen() {
  const navigation = useNavigation<RootStackNavigationProp<"PlayColorMood">>();
  const route = useRoute<PlayColorMoodRouteProp>();
  const { t } = useLocale();
  const tt = React.useCallback(
    (key: string, fallback: string, params?: Record<string, string>) => {
      const value = t(key, params);
      return value === key ? fallback : value;
    },
    [t]
  );
  const sessionId = route.params.sessionId.trim();

  const goToCanvas = React.useCallback(() => {
    if (sessionId) {
      navigation.replace("PlayCanvas", { sessionId });
      return;
    }
    navigation.navigate("PlayMatch", { activity: "draw" });
  }, [navigation, sessionId]);

  return (
    <ScreenShell
      title={tt("play.colorMood.title", "Палитра настроения")}
      background="togetherMain"
      showBack
      onBack={goToCanvas}
    >
      <View style={styles.centerState}>
        <CoreStateCard
          icon="color-palette-outline"
          title={tt("play.colorMood.backendOnlyTitle", "Палитра переезжает на backend")}
          body={tt(
            "play.colorMood.backendOnlyBody",
            "Сейчас Together использует backend-сессии для общего рисунка. Этот сценарий вернётся после отдельной миграции."
          )}
          primaryAction={{
            label: tt("play.canvas.openCanvas", "Открыть холст"),
            onPress: goToCanvas,
          }}
          secondaryAction={{
            label: tt("common.backToTogether", "Вернуться во Вместе"),
            onPress: () => navigation.navigate("Tabs", { screen: "Together" }),
          }}
        />
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  centerState: {
    flex: 1,
    padding: 18,
    alignItems: "center",
    justifyContent: "center",
  },
});
