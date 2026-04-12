import AsyncStorage from "@react-native-async-storage/async-storage";

export type NearbyAnnouncementCategory =
  | "walk"
  | "trip"
  | "coffee"
  | "activity"
  | "sport"
  | "ride";

export type NearbyAnnouncement = {
  id: string;
  title: string;
  description: string;
  category: NearbyAnnouncementCategory;
  placeLabel: string;
  proximityLabel?: string;
  authorLabel: string;
  authorUid?: string;
  createdAt: number;
  hasPhoto: boolean;
  photoUri?: string;
};

export type CreateNearbyAnnouncementInput = {
  title: string;
  description: string;
  category: NearbyAnnouncementCategory;
  city?: string;
  authorLabel: string;
  authorUid?: string;
  photoUri?: string;
};

export type NearbyAnnouncementResponseState = {
  respondedAt: number | null;
  hasResponded: boolean;
};

const STORAGE_KEY = "amoria.nearby.announcements.v1";
const RESPONSE_STORAGE_KEY = "amoria.nearby.announcementResponses.v1";

export const NEARBY_ANNOUNCEMENT_CATEGORY_ORDER: NearbyAnnouncementCategory[] = [
  "walk",
  "coffee",
  "trip",
  "activity",
  "sport",
  "ride",
];

const DEMO_ANNOUNCEMENTS: NearbyAnnouncement[] = [
  {
    id: "demo_walk_evening",
    title: "Прогулка по вечернему центру",
    description:
      "Ищу человека на спокойную прогулку после работы. Хочется пройтись, поговорить и не делать из этого сложный план.",
    category: "walk",
    placeLabel: "Центр",
    proximityLabel: "~1.2 км",
    authorLabel: "Мия",
    createdAt: 1760208000000,
    hasPhoto: true,
  },
  {
    id: "demo_trip_weekend",
    title: "Кто хочет сорваться за город в выходные?",
    description:
      "Собираю мягкий план на субботу: озеро, кофе в термосе и дорога без перегруза. Можно сесть в одну машину или встретиться на месте.",
    category: "trip",
    placeLabel: "Варшава",
    proximityLabel: "на эти выходные",
    authorLabel: "Лука",
    createdAt: 1760182800000,
    hasPhoto: true,
  },
  {
    id: "demo_coffee_morning",
    title: "Кофе утром до офиса",
    description:
      "Если ты рядом с метро и тоже не хочешь начинать день в тишине, давай возьмём кофе и пройдёмся вместе 20 минут.",
    category: "coffee",
    placeLabel: "Mokotow",
    proximityLabel: "~2.4 км",
    authorLabel: "Анна",
    createdAt: 1760157600000,
    hasPhoto: false,
  },
  {
    id: "demo_sport_tennis",
    title: "Партнёр на лёгкий теннис",
    description:
      "Не турнирный темп, а просто живое движение вечером. Если давно хотел вернуться на корт без давления, это тот самый вариант.",
    category: "sport",
    placeLabel: "Żoliborz",
    proximityLabel: "~4.1 км",
    authorLabel: "Макс",
    createdAt: 1760143200000,
    hasPhoto: true,
  },
  {
    id: "demo_activity_exhibition",
    title: "Пойти на выставку и потом обсудить",
    description:
      "Хочу выбрать одну из новых выставок и не расходиться сразу после входа. Нужен человек, которому правда интересно делиться впечатлением.",
    category: "activity",
    placeLabel: "Praga",
    proximityLabel: "~3.6 км",
    authorLabel: "Софи",
    createdAt: 1760128800000,
    hasPhoto: false,
  },
  {
    id: "demo_ride_airport",
    title: "Компания в поездку в аэропорт",
    description:
      "Еду ночью в аэропорт, не против разделить дорогу и разговор. Если тебе по пути, можно доехать спокойнее и дешевле.",
    category: "ride",
    placeLabel: "Okecie",
    proximityLabel: "сегодня ночью",
    authorLabel: "Илья",
    createdAt: 1760114400000,
    hasPhoto: false,
  },
];

function asNearbyAnnouncement(raw: unknown): NearbyAnnouncement | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Partial<NearbyAnnouncement>;
  if (!data.id || !data.title || !data.description || !data.category) return null;

  return {
    id: String(data.id),
    title: String(data.title),
    description: String(data.description),
    category: NEARBY_ANNOUNCEMENT_CATEGORY_ORDER.includes(
      data.category as NearbyAnnouncementCategory
    )
      ? (data.category as NearbyAnnouncementCategory)
      : "activity",
    placeLabel: String(data.placeLabel ?? "").trim(),
    ...(data.proximityLabel ? { proximityLabel: String(data.proximityLabel) } : {}),
    authorLabel: String(data.authorLabel ?? "Amoria"),
    ...(data.authorUid ? { authorUid: String(data.authorUid) } : {}),
    createdAt: Number(data.createdAt ?? 0),
    hasPhoto: Boolean(data.hasPhoto || data.photoUri),
    ...(data.photoUri ? { photoUri: String(data.photoUri) } : {}),
  };
}

async function readStoredAnnouncements() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => asNearbyAnnouncement(item))
      .filter((item): item is NearbyAnnouncement => Boolean(item));
  } catch {
    return [];
  }
}

async function writeStoredAnnouncements(items: NearbyAnnouncement[]) {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {}
}

async function readAnnouncementResponses() {
  try {
    const raw = await AsyncStorage.getItem(RESPONSE_STORAGE_KEY);
    if (!raw) return {} as Record<string, number>;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {} as Record<string, number>;
    return Object.fromEntries(
      Object.entries(parsed).map(([key, value]) => [String(key), Number(value ?? 0)])
    ) as Record<string, number>;
  } catch {
    return {} as Record<string, number>;
  }
}

async function writeAnnouncementResponses(map: Record<string, number>) {
  try {
    await AsyncStorage.setItem(RESPONSE_STORAGE_KEY, JSON.stringify(map));
  } catch {}
}

function getAnnouncementResponseKey(id: string, scopeId?: string) {
  return `${String(scopeId ?? "device").trim() || "device"}::${String(id ?? "").trim()}`;
}

export function getDemoNearbyAnnouncements(): NearbyAnnouncement[] {
  return [...DEMO_ANNOUNCEMENTS].sort((a, b) => b.createdAt - a.createdAt);
}

export async function loadStoredNearbyAnnouncements(): Promise<NearbyAnnouncement[]> {
  const stored = await readStoredAnnouncements();
  return stored.sort((a, b) => b.createdAt - a.createdAt);
}

export async function loadNearbyAnnouncements(): Promise<NearbyAnnouncement[]> {
  const stored = await loadStoredNearbyAnnouncements();
  return [...stored, ...getDemoNearbyAnnouncements()].sort((a, b) => b.createdAt - a.createdAt);
}

export async function loadNearbyAnnouncementById(id: string): Promise<NearbyAnnouncement | null> {
  if (!id) return null;
  const items = await loadNearbyAnnouncements();
  return items.find((item) => item.id === id) ?? null;
}

export async function createNearbyAnnouncement(
  input: CreateNearbyAnnouncementInput
): Promise<NearbyAnnouncement> {
  const announcement: NearbyAnnouncement = {
    id: `announcement_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    title: String(input.title ?? "").trim(),
    description: String(input.description ?? "").trim(),
    category: input.category,
    placeLabel: String(input.city ?? "").trim(),
    authorLabel: String(input.authorLabel ?? "").trim() || "Amoria",
    ...(input.authorUid ? { authorUid: String(input.authorUid).trim() } : {}),
    createdAt: Date.now(),
    hasPhoto: Boolean(input.photoUri),
    ...(input.photoUri ? { photoUri: input.photoUri } : {}),
  };

  const current = await readStoredAnnouncements();
  await writeStoredAnnouncements([announcement, ...current]);
  return announcement;
}

async function loadNearbyAnnouncementResponseAt(id: string, scopeId?: string) {
  if (!id) return null;
  const map = await readAnnouncementResponses();
  const value = Number(map[getAnnouncementResponseKey(id, scopeId)] ?? 0);
  return value > 0 ? value : null;
}

export async function loadNearbyAnnouncementResponseState(
  id: string,
  scopeId?: string
): Promise<NearbyAnnouncementResponseState> {
  const respondedAt = await loadNearbyAnnouncementResponseAt(id, scopeId);
  return {
    respondedAt,
    hasResponded: Boolean(respondedAt),
  };
}

export async function markNearbyAnnouncementResponded(
  id: string,
  scopeId?: string
): Promise<NearbyAnnouncementResponseState> {
  if (!id) {
    return {
      respondedAt: null,
      hasResponded: false,
    };
  }
  const map = await readAnnouncementResponses();
  const value = Date.now();
  map[getAnnouncementResponseKey(id, scopeId)] = value;
  await writeAnnouncementResponses(map);
  return {
    respondedAt: value,
    hasResponded: true,
  } satisfies NearbyAnnouncementResponseState;
}
