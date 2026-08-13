import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { getDeviceId } from "@/services/deviceId";
import * as notificationsApi from "@/services/api/notificationsApi";

const CHANNEL_ID = "amoria_updates";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: false,
    shouldShowList: false,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

function projectId(): string {
  const value = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (typeof value !== "string" || !value.trim()) throw new Error("EAS projectId is not configured");
  return value.trim();
}

async function ensureAndroidChannel() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: "Amoria updates",
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#E6B976",
  });
}

async function registerCurrentToken(devicePushToken?: Notifications.DevicePushToken): Promise<boolean> {
  if (!Device.isDevice || (Platform.OS !== "android" && Platform.OS !== "ios")) return false;
  await ensureAndroidChannel();
  const token = await Notifications.getExpoPushTokenAsync({ projectId: projectId(), devicePushToken });
  await notificationsApi.registerPushToken({
    token: token.data,
    platform: Platform.OS,
    deviceId: await getDeviceId(),
  });
  return true;
}

export async function requestAndRegisterPush(): Promise<"registered" | "denied" | "device_required"> {
  if (!Device.isDevice || (Platform.OS !== "android" && Platform.OS !== "ios")) return "device_required";
  let permission = await Notifications.getPermissionsAsync();
  if (permission.status !== "granted") permission = await Notifications.requestPermissionsAsync();
  if (permission.status !== "granted") return "denied";
  await registerCurrentToken();
  return "registered";
}

export async function syncPushTokenIfGranted(): Promise<void> {
  if (!Device.isDevice) return;
  const permission = await Notifications.getPermissionsAsync();
  if (permission.status === "granted") await registerCurrentToken();
}

export async function unlinkPushToken(): Promise<void> {
  await notificationsApi.unregisterPushToken();
}

export function subscribePushTokenChanges(): { remove: () => void } {
  return Notifications.addPushTokenListener((token) => {
    void registerCurrentToken(token).catch(() => undefined);
  });
}

export { Notifications };
