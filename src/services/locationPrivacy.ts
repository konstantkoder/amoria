import AsyncStorage from "@react-native-async-storage/async-storage";

const CONSENT_KEY = "amoria_location_consent_v1";
const NEARBY_KEY = "amoria_nearby_enabled";
const SHOW_PEOPLE_KEY = "amoria_map_show_people";
const SHARE_ME_KEY = "amoria_map_share_me";

export type LocationPrefs = {
  consent: "accepted" | "declined" | "unknown";
  nearbyEnabled: boolean;
};

export type LegacyMapPresencePrefs = {
  showPeopleOnMap: boolean;
  shareMeOnMap: boolean;
};

export type LocationPrefsWithLegacyMapPresence = LocationPrefs &
  LegacyMapPresencePrefs;

const DEFAULT_LOCATION_PREFS: LocationPrefs = {
  consent: "unknown",
  nearbyEnabled: false,
};

const DEFAULT_LEGACY_MAP_PRESENCE_PREFS: LegacyMapPresencePrefs = {
  showPeopleOnMap: false,
  shareMeOnMap: false,
};

let cachedLocationPrefs: LocationPrefs = DEFAULT_LOCATION_PREFS;
let cachedLegacyMapPresencePrefs: LegacyMapPresencePrefs =
  DEFAULT_LEGACY_MAP_PRESENCE_PREFS;

function parseBool(value: string | null): boolean {
  return value === "1";
}

function parseConsent(value: string | null): LocationPrefs["consent"] {
  if (value === "1") return "accepted";
  if (value === "0") return "declined";
  return "unknown";
}

export async function loadLocationPrefs(): Promise<LocationPrefs> {
  try {
    const entries = await AsyncStorage.multiGet([CONSENT_KEY, NEARBY_KEY]);
    const map = new Map(entries);
    const nextPrefs = {
      consent: parseConsent(map.get(CONSENT_KEY) ?? null),
      nearbyEnabled: parseBool(map.get(NEARBY_KEY) ?? null),
    };
    cachedLocationPrefs = nextPrefs;
    return nextPrefs;
  } catch {
    return cachedLocationPrefs;
  }
}

export async function loadLegacyMapPresencePrefs(): Promise<LegacyMapPresencePrefs> {
  try {
    const entries = await AsyncStorage.multiGet([SHOW_PEOPLE_KEY, SHARE_ME_KEY]);
    const map = new Map(entries);
    const nextPrefs = {
      showPeopleOnMap: parseBool(map.get(SHOW_PEOPLE_KEY) ?? null),
      shareMeOnMap: parseBool(map.get(SHARE_ME_KEY) ?? null),
    };
    cachedLegacyMapPresencePrefs = nextPrefs;
    return nextPrefs;
  } catch {
    return cachedLegacyMapPresencePrefs;
  }
}

export async function loadLocationPrefsWithLegacyMapPresence(): Promise<LocationPrefsWithLegacyMapPresence> {
  const [prefs, legacyMapPresencePrefs] = await Promise.all([
    loadLocationPrefs(),
    loadLegacyMapPresencePrefs(),
  ]);
  return {
    ...prefs,
    ...legacyMapPresencePrefs,
  };
}

export async function setNearbyEnabled(value: boolean): Promise<void> {
  cachedLocationPrefs = { ...cachedLocationPrefs, nearbyEnabled: value };
  try {
    await AsyncStorage.setItem(NEARBY_KEY, value ? "1" : "0");
  } catch {
    return;
  }
}

export async function setShowPeopleOnMap(value: boolean): Promise<void> {
  cachedLegacyMapPresencePrefs = {
    ...cachedLegacyMapPresencePrefs,
    showPeopleOnMap: value,
  };
  try {
    await AsyncStorage.setItem(SHOW_PEOPLE_KEY, value ? "1" : "0");
  } catch {
    return;
  }
}

export async function setShareMeOnMap(value: boolean): Promise<void> {
  cachedLegacyMapPresencePrefs = {
    ...cachedLegacyMapPresencePrefs,
    shareMeOnMap: value,
  };
  try {
    await AsyncStorage.setItem(SHARE_ME_KEY, value ? "1" : "0");
  } catch {
    return;
  }
}

export async function clearLegacyMapPresencePrefs(): Promise<void> {
  cachedLegacyMapPresencePrefs = DEFAULT_LEGACY_MAP_PRESENCE_PREFS;
  try {
    await AsyncStorage.multiRemove([SHOW_PEOPLE_KEY, SHARE_ME_KEY]);
  } catch {
    return;
  }
}

export async function setLocationConsent(
  value: "accepted" | "declined"
): Promise<void> {
  cachedLocationPrefs = { ...cachedLocationPrefs, consent: value };
  try {
    await AsyncStorage.setItem(CONSENT_KEY, value === "accepted" ? "1" : "0");
  } catch {
    return;
  }
}

export async function clearLocationConsent(): Promise<void> {
  cachedLocationPrefs = { ...cachedLocationPrefs, consent: "unknown" };
  try {
    await AsyncStorage.removeItem(CONSENT_KEY);
  } catch {
    return;
  }
}

export function resetLocationPrivacyCache(): void {
  cachedLocationPrefs = DEFAULT_LOCATION_PREFS;
  cachedLegacyMapPresencePrefs = DEFAULT_LEGACY_MAP_PRESENCE_PREFS;
}
