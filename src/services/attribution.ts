import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Application from "expo-application";
import { getDeviceId } from "@/services/deviceId";
import * as growthApi from "@/services/api/growthApi";

const KEY = "amoria.pendingAttribution.v1";
export type PendingAttribution = { code: string; sourceCode: string };

export function parseAttribution(value: string | null | undefined): PendingAttribution | null {
  if (!value) return null;
  try {
    const decoded = decodeURIComponent(value);
    const url = decoded.includes("://") ? new URL(decoded) : new URL(`https://amoria.invalid/?${decoded.replace(/^\?/, "")}`);
    const nestedReferrer = url.searchParams.get("referrer");
    if (nestedReferrer && !/^[A-Z0-9]{6}$/i.test(nestedReferrer.trim())) {
      const nested = parseAttribution(nestedReferrer);
      if (nested) return nested;
    }
    const pathCode = url.pathname.match(/\/i\/([A-Z0-9]{6})(?:\/|$)/i)?.[1];
    const code = String(url.searchParams.get("code") ?? url.searchParams.get("referrer") ?? pathCode ?? "").trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) return null;
    const sourceCode = String(url.searchParams.get("source") ?? "personal_invite").trim().slice(0, 40) || "personal_invite";
    return { code, sourceCode };
  } catch { return null; }
}

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
