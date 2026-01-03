import React, { useEffect, useState } from "react";
import {
  Alert,
  ScrollView,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { theme } from "@/theme";
import {
  getAdultOk,
  setAdultOk,
  getFlirtEnabled,
  setFlirtEnabled,
} from "@/services/moderation";
import { setAdultConsent, setFlirtEnabledRemote } from "@/services/firebase";

export default function FlirtSettingsScreen() {
  const [adult, setAdult] = useState(false);
  const [flirt, setFlirt] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const adultOk = await getAdultOk();
      const flirtFlag = await getFlirtEnabled();
      if (!mounted) return;
      setAdult(adultOk);
      setFlirt(flirtFlag);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const save = async () => {
    try {
      setBusy(true);
      await setAdultOk(adult);
      const allowFlirt = adult && flirt;
      await setFlirtEnabled(allowFlirt);
      await setAdultConsent(adult);
      await setFlirtEnabledRemote(allowFlirt);
      Alert.alert("Готово", "Настройки сохранены");
    } catch (e: any) {
      Alert.alert("Ошибка", e?.message ?? "Не удалось обновить настройки");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
    >
      <Text
        style={{
          fontSize: 22,
          fontWeight: "800",
          color: theme.colors.text,
          marginBottom: 8,
        }}
      >
        Флирт 18+
      </Text>
      <Text style={{ color: "#333", marginBottom: 12 }}>
        Этот режим доступен только пользователям 18+. Контент в этом разделе
        должен соответствовать правилам сообщества.
      </Text>
      <View
        style={{
          backgroundColor: "#fff",
          borderRadius: 16,
          padding: 14,
          marginBottom: 12,
        }}
      >
        <Text style={{ fontWeight: "700", marginBottom: 8 }}>
          Подтверждение возраста
        </Text>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text>Мне 18 лет и больше</Text>
          <Switch value={adult} onValueChange={setAdult} />
        </View>
      </View>
      <View
        style={{
          backgroundColor: "#fff",
          borderRadius: 16,
          padding: 14,
          marginBottom: 12,
          opacity: adult ? 1 : 0.5,
        }}
      >
        <Text style={{ fontWeight: "700", marginBottom: 8 }}>
          Включить «Флирт 18+»
        </Text>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text>
            Показывать меня и показывать мне только участников с флагом «Флирт»
          </Text>
          <Switch
            value={flirt && adult}
            onValueChange={setFlirt}
            disabled={!adult}
          />
        </View>
      </View>
      <View style={{ backgroundColor: "#fff", borderRadius: 16, padding: 14 }}>
        <Text style={{ fontWeight: "700", marginBottom: 8 }}>Правила</Text>
        <Text style={{ color: "#333" }}>
          • Никаких NSFW-изображений, агрессии, хейта и попыток монетизации
          общения.{"\n"}• Жалоба/блок — мгновенно, повторные нарушения →
          удаление аккаунта.
        </Text>
      </View>
      <TouchableOpacity
        disabled={busy}
        onPress={save}
        style={{
          marginTop: 16,
          backgroundColor: theme.colors.primary,
          borderRadius: 12,
          padding: 14,
          opacity: busy ? 0.6 : 1,
        }}
      >
        <Text style={{ color: "#fff", textAlign: "center", fontWeight: "800" }}>
          {busy ? "Сохранение…" : "Сохранить"}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
