export type MaybeStrArray = string[] | null | undefined;

export function overlap(a: MaybeStrArray, b: MaybeStrArray): number {
  if (!a?.length || !b?.length) return 0;
  const A = new Set(a.map((s) => s.toLowerCase().trim()).filter(Boolean));
  const B = new Set(b.map((s) => s.toLowerCase().trim()).filter(Boolean));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const v of A) if (B.has(v)) inter++;
  const union = new Set([...A, ...B]).size || 1;
  return Math.round((inter / union) * 100);
}

export function topShared(
  a: MaybeStrArray,
  b: MaybeStrArray,
  limit = 3,
): string[] {
  if (!a?.length || !b?.length) return [];
  const B = new Set(b.map((s) => s.toLowerCase().trim()).filter(Boolean));
  const shared = a
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => B.has(s.toLowerCase()));
  return shared.slice(0, limit);
}
