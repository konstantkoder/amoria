import type { TogetherEventDto } from "@/services/api/types";

export type TogetherPaletteSelection = {
  id: string;
  fromUserId: string;
  color: string;
  label: string;
  note?: string;
  createdAt: string;
};

type PalettePayload = {
  color?: unknown;
  label?: unknown;
  note?: unknown;
};

const DEFAULT_COLOR = "#F97393";

export function buildTogetherPaletteFromEvents(
  events: TogetherEventDto[]
): TogetherPaletteSelection[] {
  const latestByUserId = new Map<string, TogetherPaletteSelection>();

  for (const event of events) {
    const selection = paletteSelectionFromEvent(event);
    if (!selection) continue;
    latestByUserId.set(selection.fromUserId, selection);
  }

  return Array.from(latestByUserId.values()).sort((left, right) => {
    const byCreatedAt = Date.parse(left.createdAt) - Date.parse(right.createdAt);
    if (Number.isFinite(byCreatedAt) && byCreatedAt !== 0) {
      return byCreatedAt;
    }

    return left.id.localeCompare(right.id);
  });
}

export function paletteSelectionFromEvent(
  event: TogetherEventDto
): TogetherPaletteSelection | null {
  if (event.type !== "palette") return null;
  const fromUserId = String(event.fromUserId ?? "").trim();
  if (!fromUserId) return null;

  const payload =
    event.payload && typeof event.payload === "object"
      ? (event.payload as PalettePayload)
      : {};
  const label = String(payload.label ?? "").trim();

  return {
    id: String(event.clientEventId || event.id || "").trim(),
    fromUserId,
    color: normalizeHexColor(payload.color),
    label: label || "mood",
    ...(typeof payload.note === "string" && payload.note.trim()
      ? { note: payload.note.trim().slice(0, 160) }
      : {}),
    createdAt: event.createdAt,
  };
}

function normalizeHexColor(value: unknown): string {
  const color = String(value ?? "").trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toUpperCase() : DEFAULT_COLOR;
}
