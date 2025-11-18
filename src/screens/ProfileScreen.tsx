import React, { useEffect } from "react";
import { View, Text, Button, Alert, TouchableOpacity } from "react-native";
import { ensureAuth, deleteUserCompletely } from "@/services/firebase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { doc, setDoc } from "firebase/firestore";
import { db } from "@/config/firebaseConfig";
import { theme } from "@/theme/theme";
import {
  registerForPushNotificationsAsync,
  sendLocalNotification,
} from "@/services/notifications";

export default function ProfileScreen({ navigation }: any) {
  useEffect(() => {
    registerForPushNotificationsAsync().catch(() => {});
  }, []);

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
      <Button title="Удалить аккаунт" color="#d11" onPress={deleteAccount} />
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
