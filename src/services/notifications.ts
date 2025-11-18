import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";
import { db, auth } from "@/config/firebaseConfig";
import { doc, setDoc } from "firebase/firestore";

// Глобальный обработчик — уведомления тихие, без всплывашек в фоне
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function registerForPushNotificationsAsync() {
  try {
    if (!Device.isDevice) {
      // Expo Go/эмуляторы зачастую не выдают токен — не считаем это ошибкой
      return null;
    }

    const { status: existingStatus } =
      await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      return null;
    }

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const token = (await Notifications.getExpoPushTokenAsync()).data;
    const uid = auth.currentUser?.uid;
    if (uid) {
      await setDoc(
        doc(db, "profiles", uid),
        { expoPushToken: token },
        { merge: true },
      );
    }

    return token;
  } catch (e) {
    console.warn("[notifications] register error:", e);
    return null;
  }
}

type LocalNotificationPayload = { title: string; body?: string };

// Хелпер для локального уведомления (можно вызывать из любого места)
export async function sendLocalNotification(
  payload: LocalNotificationPayload | string,
  body?: string,
) {
  try {
    const content =
      typeof payload === "string" ? { title: payload, body } : payload;
    await Notifications.scheduleNotificationAsync({
      content,
      trigger: null,
    });
  } catch (e) {
    console.warn("[notifications] local send error:", e);
  }
}

type PushTarget = string | string[];

export async function sendPushAsync(
  to: PushTarget,
  title: string,
  body: string,
) {
  const targets = Array.isArray(to) ? to : [to];
  if (!targets.length) return;

  await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(targets.map((token) => ({ to: token, title, body }))),
  });
}
