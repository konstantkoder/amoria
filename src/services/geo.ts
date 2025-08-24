import * as Location from 'expo-location';
import { geohashForLocation, geohashQueryBounds } from 'geofire-common';

export async function askLocationPermission() {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') throw new Error('Permission denied');
}

export async function getCurrentPosition() {
  const pos = await Location.getCurrentPositionAsync({});
  return { lat: pos.coords.latitude, lng: pos.coords.longitude };
}

export function makeGeo(lat: number, lng: number) {
  return { lat, lng, geohash: geohashForLocation([lat, lng]) };
}

export function buildGeoBounds(lat: number, lng: number, radiusMeters = 10000) {
  return geohashQueryBounds([lat, lng], radiusMeters);
}
