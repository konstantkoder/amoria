import AsyncStorage from "@react-native-async-storage/async-storage";

const ADULT_OK_KEY = "adult_ok";
const FLIRT_ENABLED_KEY = "flirt_enabled";

export async function getAdultOk(): Promise<boolean> {
  return (await AsyncStorage.getItem(ADULT_OK_KEY)) === "1";
}

export async function setAdultOk(value: boolean): Promise<void> {
  await AsyncStorage.setItem(ADULT_OK_KEY, value ? "1" : "0");
}

export async function getFlirtEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(FLIRT_ENABLED_KEY)) === "1";
}

export async function setFlirtEnabled(value: boolean): Promise<void> {
  await AsyncStorage.setItem(FLIRT_ENABLED_KEY, value ? "1" : "0");
}

const BAD_WORDS = [
  "porn",
  "nude",
  "nsfw",
  "onlyfans",
  "pay for",
  "escort",
  "sugar",
  "prostitute",
];

export function isTextAllowed(text: string): boolean {
  const normalized = (text || "").toLowerCase();
  return !BAD_WORDS.some((word) => normalized.includes(word));
}
