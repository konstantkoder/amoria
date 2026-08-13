const EARTH_RADIUS_KM = 6371;
const HALF_PI = Math.PI / 2;

export const MAX_FINITE_MATCH_RADIUS_KM = 250;

export type GeographicBounds = {
  minLatitude: number;
  maxLatitude: number;
  minLongitude: number;
  maxLongitude: number;
  crossesAntimeridian: boolean;
  allLongitudes: boolean;
};

export function geographicBounds(lat: number, lng: number, radiusKm: number): GeographicBounds {
  const latitudeRadians = toRadians(lat);
  const angularDistance = radiusKm / EARTH_RADIUS_KM;
  const minLatitudeRadians = Math.max(-HALF_PI, latitudeRadians - angularDistance);
  const maxLatitudeRadians = Math.min(HALF_PI, latitudeRadians + angularDistance);
  const minLatitude = toDegrees(minLatitudeRadians);
  const maxLatitude = toDegrees(maxLatitudeRadians);

  if (minLatitudeRadians <= -HALF_PI || maxLatitudeRadians >= HALF_PI) {
    return {
      minLatitude,
      maxLatitude,
      minLongitude: -180,
      maxLongitude: 180,
      crossesAntimeridian: false,
      allLongitudes: true,
    };
  }

  // This is the spherical-circle longitude extremum, not a simple degree
  // subtraction. The latter under-bounds searches at high latitude.
  const longitudeDelta = toDegrees(Math.asin(Math.min(
    1,
    Math.sin(angularDistance) / Math.cos(latitudeRadians),
  )));
  const rawMin = lng - longitudeDelta;
  const rawMax = lng + longitudeDelta;
  return {
    minLatitude,
    maxLatitude,
    minLongitude: normalizeLongitude(rawMin),
    maxLongitude: normalizeLongitude(rawMax),
    crossesAntimeridian: rawMin < -180 || rawMax > 180,
    allLongitudes: longitudeDelta >= 180,
  };
}

function normalizeLongitude(value: number): number {
  return ((value + 180) % 360 + 360) % 360 - 180;
}

export function toRadians(value: number): number {
  return value * (Math.PI / 180);
}

function toDegrees(value: number): number {
  return value * (180 / Math.PI);
}
