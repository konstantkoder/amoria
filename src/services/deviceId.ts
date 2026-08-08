import AsyncStorage from "@react-native-async-storage/async-storage";

const DEVICE_ID_KEY = "amoria.installId.v1";
let deviceIdPromise: Promise<string> | null = null;

function fallbackUuid(): string {
  let seed = Date.now();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (token) => {
    const random = (seed + Math.random() * 16) % 16 | 0;
    seed = Math.floor(seed / 16);
    return (token === "x" ? random : (random & 0x3) | 0x8).toString(16);
  });
}

function createInstallId(): string {
  const runtimeCrypto = globalThis.crypto as { randomUUID?: () => string } | undefined;
  return runtimeCrypto?.randomUUID?.() ?? fallbackUuid();
}

async function loadOrCreateDeviceId(): Promise<string> {
  const stored = String(await AsyncStorage.getItem(DEVICE_ID_KEY) ?? "").trim();
  if (stored) return stored;
  const created = createInstallId();
  await AsyncStorage.setItem(DEVICE_ID_KEY, created);
  return created;
}

export function getDeviceId(): Promise<string> {
  deviceIdPromise ??= loadOrCreateDeviceId().catch((error) => {
    deviceIdPromise = null;
    throw error;
  });
  return deviceIdPromise;
}
