export type ArchiveLoadState = "idle" | "loading" | "loaded" | "error";

export function beginArchiveLoad(previous: ArchiveLoadState): ArchiveLoadState {
  return previous === "loaded" ? "loaded" : "loading";
}

export function completeArchiveLoad(): ArchiveLoadState {
  return "loaded";
}

export function failArchiveLoad(previous: ArchiveLoadState): ArchiveLoadState {
  return previous === "loaded" ? "loaded" : "error";
}
