type TranslateFn = (key: string, params?: Record<string, string>) => string;

function safeDiffMs(ts: number) {
  if (!ts) return null;
  const diff = Date.now() - ts;
  return diff < 0 ? 0 : diff;
}

export function formatAgoLong(ts: number, t: TranslateFn) {
  const diff = safeDiffMs(ts);
  if (diff == null) return "";
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return t("time.justNow");
  const min = Math.floor(sec / 60);
  if (min < 60) return t("time.minShort", { count: String(min) });
  const h = Math.floor(min / 60);
  if (h < 24) return t("time.hourShort", { count: String(h) });
  const d = Math.floor(h / 24);
  return t("time.dayShort", { count: String(d) });
}

export function formatAgoShort(ts: number, t: TranslateFn) {
  const diff = safeDiffMs(ts);
  if (diff == null) return "";
  if (diff < 15_000) return t("time.nowShort");
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return t("time.secShort", { count: String(sec) });
  const min = Math.floor(sec / 60);
  if (min < 60) return t("time.minShort", { count: String(min) });
  const h = Math.floor(min / 60);
  if (h < 24) return t("time.hourShort", { count: String(h) });
  const d = Math.floor(h / 24);
  return t("time.dayShort", { count: String(d) });
}
