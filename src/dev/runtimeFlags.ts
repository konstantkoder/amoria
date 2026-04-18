import Constants, { ExecutionEnvironment } from "expo-constants";

function normalizeBuildProfile(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

export function getQaBuildProfile() {
  return normalizeBuildProfile(Constants.expoConfig?.extra?.qaBuildProfile);
}

export function isTogetherQaDemoEnabled() {
  const buildProfile = getQaBuildProfile();

  return (
    __DEV__ ||
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient ||
    buildProfile === "development" ||
    buildProfile === "preview"
  );
}
