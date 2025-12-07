import React, { useEffect, useState } from "react";
import { View, Text, Button, Alert, TouchableOpacity, Switch } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ensureAuth, deleteUserCompletely } from "@/services/firebase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { doc, setDoc } from "firebase/firestore";
import { db } from "@/config/firebaseConfig";
import { theme } from "@/theme";
import {
  registerForPushNotificationsAsync,
  sendLocalNotification,
} from "@/services/notifications";
import {
  loadAdultModeEnabled,
  setAdultModeEnabled,
} from "@/services/adultMode";
import type { ProfileStackParamList } from "@/navigation/AppNavigator";

type ProfileNav = NativeStackNavigationProp<
  ProfileStackParamList & Record<string, object | undefined>,
  "ProfileMain"
>;

export default function ProfileScreen() {
  const navigation = useNavigation<ProfileNav>();
  const [adultModeEnabled, setAdultModeEnabledState] = useState(false);
  const [adultModeLoading, setAdultModeLoading] = useState(true);

  useEffect(() => {
    registerForPushNotificationsAsync().catch(() => {});
  }, []);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      const enabled = await loadAdultModeEnabled();
      if (isMounted) {
        setAdultModeEnabledState(enabled);
        setAdultModeLoading(false);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleToggleAdultMode = () => {
    if (adultModeLoading) return;

    if (!adultModeEnabled) {
      // включаем 18+ — сначала предупреждение
      Alert.alert(
        "18+ режим",
        "В 18+ режиме появляются цели casual/sex и более откровенные анкеты. Подтверждая, вы заявляете, что вам 18 лет и вы согласны видеть такой контент.",
        [
          { text: "Отмена", style: "cancel" },
          {
            text: "Включить",
            style: "destructive",
            onPress: async () => {
              setAdultModeEnabledState(true);
              await setAdultModeEnabled(true);
            },
          },
        ]
      );
    } else {
      // выключаем 18+
      Alert.alert(
        "Выключить 18+ режим?",
        "Взрослые цели (casual/sex) будут скрыты, часть анкет пропадёт из выдачи.",
        [
          { text: "Отмена", style: "cancel" },
          {
            text: "Выключить",
            style: "default",
            onPress: async () => {
              setAdultModeEnabledState(false);
              await setAdultModeEnabled(false);
            },
          },
        ]
      );
    }
  };

  async function deleteAccount() {
    const uid = await ensureAuth();
    await deleteUserCompletely(uid);
    await AsyncStorage.removeItem("onboarded");
    Alert.alert("Удалено", "Ваш аккаунт удалён.");
    navigation.reset({ index: 0, routes: [{ name: "Onboarding" }] });
  }
  return (
    <View style={{ flex: 1, padding: 24, backgroundColor: theme.colors.bg }}>
      <Text style={{ fontSize: 22, fontWeight: "700", marginBottom: 12 }}>
        Профиль
      </Text>
      <Button
        title="Редактировать профиль"
        onPress={() => navigation.navigate("EditProfile")}
      />
      <View style={{ height: 8 }} />
      <Button
        title="Мои фото"
        onPress={() => navigation.navigate("PhotoManager")}
      />
      <View style={{ height: 8 }} />
      <Button
        title="Флирт 18+"
        onPress={() => navigation.navigate("FlirtSettings")}
      />
      <View style={{ height: 8 }} />
      <Button
        title="Политика конфиденциальности"
        onPress={() => navigation.navigate("Legal")}
      />
      <View style={{ height: 16 }} />
      <TouchableOpacity
        onPress={() =>
          navigation.navigate("DM", { peerId: "demo-peer", peerName: "Demo" })
        }
        style={{
          backgroundColor: theme.colors.primary,
          paddingVertical: 14,
          borderRadius: 12,
          marginBottom: 12,
        }}
      >
        <Text style={{ color: "#fff", textAlign: "center", fontWeight: "800" }}>
          ОТПРАВИТЬ СООБЩЕНИЕ
        </Text>
      </TouchableOpacity>
      <Button title="Удалить аккаунт" color="#d11" onPress={deleteAccount} />
      <View
        style={{
          marginTop: 24,
          padding: 16,
          borderRadius: 16,
          backgroundColor: theme.colors.card,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text
              style={{
                color: theme.colors.text,
                fontSize: 16,
                fontWeight: "700",
                marginBottom: 4,
              }}
            >
              18+ режим
            </Text>
            <Text
              style={{
                color: theme.colors.subtext ?? "#A1A1AA",
                fontSize: 13,
              }}
            >
              Показывать цели casual/sex и более откровенные анкеты. Доступно
              только для пользователей 18+.
            </Text>
          </View>

          <Switch
            value={adultModeEnabled}
            onValueChange={handleToggleAdultMode}
            disabled={adultModeLoading}
          />
        </View>
      </View>
      {/* DEV: тест локальных уведомлений */}
      {__DEV__ && (
        <View style={{ marginTop: 16 }}>
          <Button
            title="Тест уведомления"
            onPress={() =>
              sendLocalNotification({
                title: "Проверка",
                body: "Это локальное уведомление работает ✅",
              })
            }
          />
        </View>
      )}
      {__DEV__ && (
        <TouchableOpacity
          style={{
            backgroundColor: "#10b981",
            paddingHorizontal: 18,
            paddingVertical: 12,
            borderRadius: 10,
            marginTop: 24,
            alignItems: "center",
          }}
          onPress={async () => {
            try {
              const base = [
                { name: "Alex", age: 27, bio: "Путешествия, кофе, винил" },
                { name: "Mira", age: 24, bio: "Йога и кино по вечерам" },
                { name: "Dan", age: 29, bio: "Хайкинг, бег, борщ 😅" },
                { name: "Ira", age: 25, bio: "Пишу музыку и люблю панк-рок" },
                { name: "Leo", age: 31, bio: "Фотограф, ищу приятные беседы" },
                { name: "Nika", age: 26, bio: "Кроссфит и книги" },
                { name: "Oleg", age: 28, bio: "Гик по жизни" },
                { name: "Tanya", age: 23, bio: "Ищу друзей для походов" },
              ];
              await Promise.all(
                base.map((u, idx) =>
                  setDoc(
                    doc(db, "profiles", `demo_${idx}`),
                    {
                      ...u,
                      intents: ["dating"],
                      lat: 45.815,
                      lng: 15.982,
                    },
                    { merge: true },
                  ),
                ),
              );
              Alert.alert("Готово", "Засидили 8 демо-анкет");
            } catch (e: any) {
              Alert.alert(
                "Ошибка",
                e?.message ?? "Не удалось засидить демо-аккаунты",
              );
            }
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "800" }}>
            Seed demo users
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
