export type TranslateFn = (key: string, params?: Record<string, string>) => string;

const DEFAULT_PREFIXES = ["geo.", "rooms.", "ads."];

export function translateMaybeKey(
  value: string | null | undefined,
  t: TranslateFn,
  extraPrefixes: string[] = [],
) {
  if (typeof value !== "string" || !value) return value ?? "";
  const prefixes = DEFAULT_PREFIXES.concat(extraPrefixes);
  for (const prefix of prefixes) {
    if (value.startsWith(prefix)) {
      return t(value);
    }
  }
  return value;
}
