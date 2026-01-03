import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "amoria_adult_mode_enabled";

export async function loadAdultModeEnabled(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw === "1") return true;
    if (raw === "0") return false;
    return false;
  } catch {
    return false;
  }
}

export async function setAdultModeEnabled(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    return;
  }
}
