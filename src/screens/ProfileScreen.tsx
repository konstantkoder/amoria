// NOTE: Modified version of ProfileScreen. This update sets a dedicated
// profile background and tweaks overlay/blur to keep the image bright while
// preserving text readability.

import React, { useEffect } from "react";
import { View, Text, Button, Alert, TouchableOpacity } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { doc, setDoc } from "firebase/firestore";
import { db } from "@/config/firebaseConfig";
import ScreenBackground from "@/components/ScreenBackground";
import { useLocale } from "@/contexts/LocaleContext";
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
  const { t } = useLocale();
  useEffect(() => {
    registerForPushNotificationsAsync().catch(() => {});
  }, []);
  return (
    <ScreenBackground
      variant="profile"
      overlayOpacity={0.18}
      blurRadius={0}
    >
      <View style={{ flex: 1, padding: 24 }}>
        <Text style={{ fontSize: 22, fontWeight: "700", marginBottom: 12 }}>
          {t("screen.profile")}
        </Text>
        <Button
          title={t("profile.edit")}
          onPress={() => navigation.navigate("EditProfile")}
        />
        <View style={{ height: 8 }} />
        <Button
          title={t("profile.photos")}
          onPress={() => navigation.navigate("PhotoManager")}
        />
        <View style={{ height: 8 }} />
        <Button
          title={t("profile.flirt18")}
          onPress={() => navigation.navigate("FlirtSettings")}
        />
        {/* DEV: тест локальных уведомлений */}
        {__DEV__ && (
          <View style={{ marginTop: 16 }}>
            <Button
              title={t("profile.testNotif")}
              onPress={() =>
                sendLocalNotification({
                  title: t("profile.notifTitle"),
                  body: t("profile.notifBody"),
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
                  { name: "Alex", age: 27, bio: "Travel, coffee, vinyl." },
                  { name: "Mira", age: 24, bio: "Yoga and movies in the evening." },
                  { name: "Dan", age: 29, bio: "Hiking, running, ramen 😅." },
                  { name: "Ira", age: 25, bio: "I make music and love punk rock." },
                  { name: "Leo", age: 31, bio: "Photographer, looking for easy conversations." },
                  { name: "Nika", age: 26, bio: "Crossfit and books." },
                  { name: "Oleg", age: 28, bio: "Tech geek by nature." },
                  { name: "Tanya", age: 23, bio: "Looking for friends to hike with." },
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
                Alert.alert(t("profile.seedDoneTitle"), t("profile.seedDoneBody"));
              } catch (e: any) {
                Alert.alert(
                  t("common.error"),
                  e?.message ?? t("profile.seedFailedBody"),
                );
              }
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "800" }}>
              {t("profile.seed")}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </ScreenBackground>
  );
}
