import * as Location from "expo-location";

import type { TogetherQueueLocationInput } from "@/services/api/types";

export type TogetherRadiusKm = 5 | 25 | 100 | 250 | null;

export const DEFAULT_TOGETHER_RADIUS_KM: TogetherRadiusKm = 25;
export const TOGETHER_RADIUS_OPTIONS: TogetherRadiusKm[] = [5, 25, 100, 250, null];

export type TogetherLocationResult =
  | {
      ok: true;
      location: TogetherQueueLocationInput;
      permissionStatus: string;
    }
  | {
      ok: false;
      reason: "permissionDenied" | "locationReadFailed";
      permissionStatus: string;
      error?: unknown;
    };

export function parseTogetherRadiusPreference(value: string | null): TogetherRadiusKm | undefined {
  if (value === "anywhere") return null;
  if (value === "5") return 5;
  if (value === "25") return 25;
  if (value === "100") return 100;
  if (value === "250") return 250;
  return undefined;
}

export function serializeTogetherRadiusPreference(radiusKm: TogetherRadiusKm): string {
  return radiusKm === null ? "anywhere" : String(radiusKm);
}

export function hasTogetherQueueCoordinates(
  location?: TogetherQueueLocationInput | null
): location is TogetherQueueLocationInput {
  return (
    Number.isFinite(location?.latitude) &&
    Number.isFinite(location?.longitude)
  );
}

export async function requestTogetherQueueLocation(
  radiusKm: TogetherRadiusKm
): Promise<TogetherLocationResult> {
  let permissionStatus = "unknown";

  try {
    const currentPermission = await Location.getForegroundPermissionsAsync();
    permissionStatus = currentPermission.status;
    const permission = currentPermission.granted
      ? currentPermission
      : await Location.requestForegroundPermissionsAsync();
    permissionStatus = permission.status;

    if (!permission.granted) {
      return {
        ok: false,
        reason: "permissionDenied",
        permissionStatus,
      };
    }
  } catch (error) {
    return {
      ok: false,
      reason: "locationReadFailed",
      permissionStatus,
      error,
    };
  }

  try {
    const lastKnown = await Location.getLastKnownPositionAsync();
    const position = lastKnown ?? await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    const latitude = position.coords.latitude;
    const longitude = position.coords.longitude;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new Error("Invalid Together location coordinates");
    }

    return {
      ok: true,
      permissionStatus,
      location: {
        latitude,
        longitude,
        radiusKm,
      },
    };
  } catch (error) {
    return {
      ok: false,
      reason: "locationReadFailed",
      permissionStatus,
      error,
    };
  }
}
