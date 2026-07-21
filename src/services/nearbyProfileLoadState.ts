export type NearbyProfileLoadState = "loading" | "loaded" | "error";

export function beginNearbyProfileRefresh(
  current: NearbyProfileLoadState
): NearbyProfileLoadState {
  return current === "loaded" ? "loaded" : "loading";
}

export function completeNearbyProfileRefresh(): NearbyProfileLoadState {
  return "loaded";
}

export function failNearbyProfileRefresh(
  current: NearbyProfileLoadState
): NearbyProfileLoadState {
  return current === "loaded" ? "loaded" : "error";
}

export function canShowNearbyIncompleteProfile(
  state: NearbyProfileLoadState
): boolean {
  return state === "loaded";
}
