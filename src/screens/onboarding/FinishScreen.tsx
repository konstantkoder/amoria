import React, { useState } from "react";
import { View, Text, ActivityIndicator, TouchableOpacity } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

export default function FinishScreen({ navigation }: any) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFinish() {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      // гарантируем, что флаг действительно записан
      await AsyncStorage.setItem("onboarded", "1");
      // переключаем родительский стек, где MainTabs уже зарегистрирован
      navigation.getParent()?.navigate("MainTabs");
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <Text style={{ fontSize: 26, fontWeight: "800", marginBottom: 8 }}>
        Финальный шаг
      </Text>
      <Text style={{ textAlign: "center", marginBottom: 16 }}>
        Сохраняем профиль и переходим к «Табы → Люди рядом».
      </Text>
      {busy ? (
        <ActivityIndicator />
      ) : (
        <TouchableOpacity
          onPress={onFinish}
          style={{
            backgroundColor: "#1E90FF",
            paddingHorizontal: 24,
            paddingVertical: 12,
            borderRadius: 10,
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "700" }}>ЗАВЕРШИТЬ</Text>
        </TouchableOpacity>
      )}
      {!!error && (
        <Text style={{ color: "red", marginTop: 12, textAlign: "center" }}>
          {error}
        </Text>
      )}
    </View>
  );
}
