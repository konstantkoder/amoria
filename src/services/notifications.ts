import * as Notifications from "expo-notifications";
// expo-notifications удалены из Expo Go (SDK 53) для удалённых пушей,
// поэтому оставляем только локальные уведомления и заглушку регистрации.

// Глобальный обработчик — уведомления тихие, без всплывашек в фоне
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerForPushNotificationsAsync() {
  return null;
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
  } catch {
    return;
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
