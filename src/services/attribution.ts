import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Application from "expo-application";
import { getDeviceId } from "@/services/deviceId";
import * as growthApi from "@/services/api/growthApi";
import { parseAttribution, type PendingAttribution } from "@/services/attributionParsing";

export { parseAttribution, type PendingAttribution } from "@/services/attributionParsing";

const KEY = "amoria.pendingAttribution.v1";
export async function captureAttribution(value: string | null | undefined) {
  const parsed = parseAttribution(value);
  if (parsed) await AsyncStorage.setItem(KEY, JSON.stringify(parsed));
  return parsed;
}

export async function captureInstallReferrer() {
  try { return captureAttribution(await Application.getInstallReferrerAsync()); }
  catch { return null; }
}

export async function claimPendingAttribution() {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return false;
  const parsed = parseAttribution(JSON.parse(raw)?.code ? `?code=${JSON.parse(raw).code}&source=${JSON.parse(raw).sourceCode}` : null);
  if (!parsed) { await AsyncStorage.removeItem(KEY); return false; }
  const result = await growthApi.claimAttribution({ ...parsed, installId: await getDeviceId() });
  await AsyncStorage.removeItem(KEY);
  return result.claimed;
}
