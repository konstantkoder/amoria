export type PendingAttribution = { code: string; sourceCode: string };

export function parseAttribution(value: string | null | undefined): PendingAttribution | null {
  if (!value) return null;
  try {
    const decoded = decodeURIComponent(value);
    const url = decoded.includes("://") ? new URL(decoded) : new URL(`https://amoria.invalid/?${decoded.replace(/^\?/, "")}`);
    const nestedReferrer = url.searchParams.get("referrer");
    if (nestedReferrer && !/^[A-Z0-9]{6}$/i.test(nestedReferrer.trim())) {
      const nested = parseAttribution(nestedReferrer);
      if (nested) return nested;
    }
    const pathCode = url.pathname.match(/\/i\/([A-Z0-9]{6})(?:\/|$)/i)?.[1];
    const code = String(url.searchParams.get("code") ?? url.searchParams.get("referrer") ?? pathCode ?? "").trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) return null;
    const sourceCode = String(url.searchParams.get("source") ?? "personal_invite").trim().slice(0, 40) || "personal_invite";
    return { code, sourceCode };
  } catch { return null; }
}
