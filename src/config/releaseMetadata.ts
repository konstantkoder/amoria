import appConfig from "../../app.json";

export type ReleaseMetadata = {
  appVersion?: string;
  buildNumber?: string;
  releaseChannel?: string;
  gitSha?: string;
  releaseVersion?: string;
};

type ExpoAppConfig = {
  expo?: {
    version?: string;
    ios?: { buildNumber?: string };
    android?: { versionCode?: number | string };
  };
};

export function getReleaseMetadata(): ReleaseMetadata {
  const appVersion = readAppVersion();
  const buildNumber = readBuildNumber();
  const releaseChannel = readPublicEnv("EXPO_PUBLIC_RELEASE_CHANNEL");
  const gitSha = readPublicEnv("EXPO_PUBLIC_GIT_SHA");
  const explicitReleaseVersion = readPublicEnv("EXPO_PUBLIC_RELEASE_VERSION");
  const fallbackReleaseVersion = [appVersion, buildNumber].filter(Boolean).join("+");
  const releaseVersion = explicitReleaseVersion || gitSha || fallbackReleaseVersion || undefined;

  return compact({
    appVersion,
    buildNumber,
    releaseChannel,
    gitSha,
    releaseVersion,
  });
}

function readAppVersion(): string | undefined {
  const version = String((appConfig as ExpoAppConfig).expo?.version ?? "").trim();
  return version || undefined;
}

function readBuildNumber(): string | undefined {
  const expoConfig = (appConfig as ExpoAppConfig).expo;
  const iosBuildNumber = String(expoConfig?.ios?.buildNumber ?? "").trim();
  if (iosBuildNumber) return iosBuildNumber;

  const androidVersionCode = expoConfig?.android?.versionCode;
  return androidVersionCode ? String(androidVersionCode) : undefined;
}

function readPublicEnv(key: string): string | undefined {
  const value = String(process.env[key] ?? "").trim();
  return value || undefined;
}

function compact(input: ReleaseMetadata): ReleaseMetadata {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => Boolean(value))
  ) as ReleaseMetadata;
}
