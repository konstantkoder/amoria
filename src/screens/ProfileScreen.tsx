import React, { useEffect } from "react";
import { View, Text, Button, Alert, TouchableOpacity } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { doc, setDoc } from "firebase/firestore";
import { db } from "@/config/firebaseConfig";
import ScreenBackground from "@/components/ScreenBackground";
import {
  registerForPushNotificationsAsync,
  sendLocalNotification,
} from "@/services/notifications";
import type { ProfileStackParamList } from "@/navigation/AppNavigator";

type ProfileNav = NativeStackNavigationProp<
  ProfileStackParamList & Record<string, object | undefined>,
  "ProfileMain"
>;

export default function ProfileScreen() {
  const navigation = useNavigation<ProfileNav>();

  useEffect(() => {
    registerForPushNotificationsAsync().catch(() => {});
  }, []);
  return (
    <ScreenBackground variant="menu">
      <View style={{ flex: 1, padding: 24 }}>
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
    </ScreenBackground>
  );
}
