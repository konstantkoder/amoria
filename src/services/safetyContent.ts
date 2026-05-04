const UNSAFE_ANNOUNCEMENT_PATTERNS = [
  /\bescort\b/i,
  /\beskort\b/i,
  /\bprostitut(?:e|ion)?\b/i,
  /\bpaid\s+(?:sex|sexual|intimacy|escort)\b/i,
  /\bsex\s+for\s+money\b/i,
  /\bsexual\s+services\b/i,
  /\bcompensated\s+(?:date|dating|meeting)\b/i,
  /\bsugar\s+daddy\b/i,
  /\bsugar\s+baby\b/i,
  /эскорт/i,
  /проституц/i,
  /секс\s+за\s+деньг/i,
  /интим\s+за\s+деньг/i,
  /платн\w*\s+(?:секс|интим)/i,
  /интимн\w*\s+услуг/i,
  /сексуальн\w*\s+услуг/i,
  /prostituc/i,
  /seks\s+za\s+novac/i,
  /pla[cć]eni\s+seks/i,
  /seksualne\s+usluge/i,
];

function normalizeSafetyText(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ")
    .trim();
}

export function containsUnsafeAnnouncementContent(...values: string[]) {
  const text = normalizeSafetyText(values.join(" "));
  if (!text) return false;
  return UNSAFE_ANNOUNCEMENT_PATTERNS.some((pattern) => pattern.test(text));
}
