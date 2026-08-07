import type { NearbyProfileDistanceBucket } from "@/services/api/types";

type Translate = (key: string, params?: Record<string, string>) => string;

export function getNearbyPeopleGridLayout(width: number) {
  const compact = width <= 360;
  const large = width > 430;
  const columns = compact ? 2 : 3;
  const horizontalPadding = compact ? 14 : large ? 16 : 14;
  const columnGap = compact ? 12 : large ? 12 : 10;
  const rowGap = 14;
  const avatarSize = compact ? 108 : large ? 116 : 104;
  const tileHeight = compact ? 116 : large ? 124 : 112;
  const availableWidth = Math.max(
    0,
    width - horizontalPadding * 2 - columnGap * (columns - 1)
  );

  return {
    columns,
    horizontalPadding,
    columnGap,
    rowGap,
    avatarSize,
    tileWidth: Math.floor(availableWidth / columns),
    tileHeight,
  };
}

export function formatNearbyDistanceBucket(
  bucket: NearbyProfileDistanceBucket | null | undefined,
  t: Translate
): string {
  switch (bucket) {
    case "under_1km":
      return t("nearby.distance.under1km");
    case "1_5km":
      return t("nearby.distance.upTo5km");
    case "5_25km":
      return t("nearby.distance.upTo25km");
    case "25_100km":
      return t("nearby.distance.upTo100km");
    case "over_100km":
      return t("nearby.distance.over100km");
    default:
      return "";
  }
}

export function formatNearbyDistanceAccessibility(
  bucket: NearbyProfileDistanceBucket | null | undefined,
  t: Translate
): string {
  switch (bucket) {
    case "under_1km":
      return t("nearby.distanceAccessibility.under1km");
    case "1_5km":
      return t("nearby.distanceAccessibility.upTo5km");
    case "5_25km":
      return t("nearby.distanceAccessibility.upTo25km");
    case "25_100km":
      return t("nearby.distanceAccessibility.upTo100km");
    case "over_100km":
      return t("nearby.distanceAccessibility.over100km");
    default:
      return "";
  }
}

export function buildNearbyPersonMetadata(
  ageLabel: string | null | undefined,
  distanceLabel: string | null | undefined
): string {
  return [ageLabel, distanceLabel]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join(" · ");
}

export function buildNearbyPersonAccessibilityLabel(
  displayName: string,
  ageLabel: string | null | undefined,
  distanceLabel: string | null | undefined
): string {
  return [displayName, ageLabel, distanceLabel]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join(", ");
}
