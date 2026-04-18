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

export type NearbyAnnouncementsRepository = {
  listAnnouncements(): Promise<NearbyAnnouncement[]>;
  getAnnouncementById(id: string): Promise<NearbyAnnouncement | null>;
  createAnnouncement(
    input: CreateNearbyAnnouncementInput
  ): Promise<NearbyAnnouncement>;
  getAnnouncementResponseState(
    id: string,
    scopeId?: string
  ): Promise<NearbyAnnouncementResponseState>;
  markAnnouncementResponded(
    id: string,
    scopeId?: string
  ): Promise<NearbyAnnouncementResponseState>;
};

type NearbyAnnouncementsStorage = Pick<typeof AsyncStorage, "getItem" | "setItem">;

type CreateAsyncStorageNearbyAnnouncementsRepositoryOptions = {
  storage?: NearbyAnnouncementsStorage;
  announcementsStorageKey?: string;
  responsesStorageKey?: string;
  demoAnnouncements?: NearbyAnnouncement[];
};

export const NEARBY_ANNOUNCEMENTS_STORAGE_KEY = "amoria.nearby.announcements.v1";
export const NEARBY_ANNOUNCEMENT_RESPONSES_STORAGE_KEY =
  "amoria.nearby.announcementResponses.v1";
const DEFAULT_RESPONSE_SCOPE_ID = "device";

export const NEARBY_ANNOUNCEMENT_CATEGORY_ORDER: NearbyAnnouncementCategory[] = [
  "walk",
  "coffee",
  "trip",
  "activity",
  "sport",
  "ride",
];

const DEFAULT_DEMO_ANNOUNCEMENTS: NearbyAnnouncement[] = [
  {
    id: "demo_walk_evening",
    title: "Ищу компанию на вечернюю прогулку по центру",
    description:
      "Свободна после работы и хочу пройтись 40-60 минут без длинной переписки. Если тебе тоже хочется спокойного знакомства вживую, откликайся.",
    category: "walk",
    placeLabel: "Центр",
    proximityLabel: "~1.2 км",
    authorLabel: "Мия",
    createdAt: 1760208000000,
    hasPhoto: true,
  },
  {
    id: "demo_trip_weekend",
    title: "Ищу попутчика за город на выходных",
    description:
      "План простой: озеро, кофе в термосе и без сложной организации. Ищу одного спокойного человека, с кем можно заранее договориться по формату поездки.",
    category: "trip",
    placeLabel: "Варшава",
    proximityLabel: "на эти выходные",
    authorLabel: "Лука",
    createdAt: 1760182800000,
    hasPhoto: true,
  },
  {
    id: "demo_coffee_morning",
    title: "Ищу компанию на кофе до офиса",
    description:
      "Если ты рядом с метро утром, давай возьмём кофе и коротко познакомимся по дороге. Ищу лёгкий формат на 20 минут перед работой.",
    category: "coffee",
    placeLabel: "Mokotow",
    proximityLabel: "~2.4 км",
    authorLabel: "Анна",
    createdAt: 1760157600000,
    hasPhoto: false,
  },
  {
    id: "demo_sport_tennis",
    title: "Ищу партнёра на лёгкий теннис вечером",
    description:
      "Не турнир и не жесткий уровень. Нужен человек, который хочет спокойно вернуться на корт вечером и заранее понимает формат встречи.",
    category: "sport",
    placeLabel: "Żoliborz",
    proximityLabel: "~4.1 км",
    authorLabel: "Макс",
    createdAt: 1760143200000,
    hasPhoto: true,
  },
  {
    id: "demo_activity_exhibition",
    title: "Ищу человека на выставку и разговор после",
    description:
      "Хочу выбрать одну из новых выставок и потом спокойно обсудить впечатления. Ищу человека, которому правда интересен такой формат встречи.",
    category: "activity",
    placeLabel: "Praga",
    proximityLabel: "~3.6 км",
    authorLabel: "Софи",
    createdAt: 1760128800000,
    hasPhoto: false,
  },
  {
    id: "demo_ride_airport",
    title: "Ищу попутчика в аэропорт поздно вечером",
    description:
      "Еду поздно вечером и ищу одного попутчика, чтобы разделить дорогу без хаоса. Если тебе по пути, можно заранее договориться о времени и точке встречи.",
    category: "ride",
    placeLabel: "Okecie",
    proximityLabel: "сегодня ночью",
    authorLabel: "Илья",
    createdAt: 1760114400000,
    hasPhoto: false,
  },
];

function normalizeNearbyAnnouncement(raw: unknown): NearbyAnnouncement | null {
  if (!raw || typeof raw !== "object") return null;

  const data = raw as Partial<NearbyAnnouncement>;
  const id = String(data.id ?? "").trim();
  const title = String(data.title ?? "").trim();
  const description = String(data.description ?? "").trim();
  if (!id || !title || !description) return null;

  const category = NEARBY_ANNOUNCEMENT_CATEGORY_ORDER.includes(
    data.category as NearbyAnnouncementCategory
  )
    ? (data.category as NearbyAnnouncementCategory)
    : "activity";
  const placeLabel = String(data.placeLabel ?? "").trim();
  const proximityLabel = String(data.proximityLabel ?? "").trim();
  const authorLabel = String(data.authorLabel ?? "Amoria").trim() || "Amoria";
  const authorUid = String(data.authorUid ?? "").trim();
  const photoUri = String(data.photoUri ?? "").trim();
  const createdAt = Number(data.createdAt ?? 0);

  return {
    id,
    title,
    description,
    category,
    placeLabel,
    ...(proximityLabel ? { proximityLabel } : {}),
    authorLabel,
    ...(authorUid ? { authorUid } : {}),
    createdAt: Number.isFinite(createdAt) ? createdAt : 0,
    hasPhoto: Boolean(data.hasPhoto || photoUri),
    ...(photoUri ? { photoUri } : {}),
  };
}

function sortNearbyAnnouncements(items: NearbyAnnouncement[]): NearbyAnnouncement[] {
  return [...items].sort((left, right) => {
    const byCreatedAt = right.createdAt - left.createdAt;
    if (byCreatedAt !== 0) return byCreatedAt;
    return left.id.localeCompare(right.id);
  });
}

function mergeNearbyAnnouncementCollections(
  ...collections: NearbyAnnouncement[][]
): NearbyAnnouncement[] {
  const byId = new Map<string, NearbyAnnouncement>();

  for (const collection of collections) {
    for (const item of collection) {
      if (!item?.id || byId.has(item.id)) continue;
      byId.set(item.id, item);
    }
  }

  return sortNearbyAnnouncements(Array.from(byId.values()));
}

function normalizeResponseMap(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object") return {};

  return Object.fromEntries(
    Object.entries(raw).flatMap(([key, value]) => {
      const responseKey = String(key ?? "").trim();
      const respondedAt = Number(value ?? 0);
      if (!responseKey || respondedAt <= 0) return [];
      return [[responseKey, respondedAt]];
    })
  ) as Record<string, number>;
}

function buildAnnouncementResponseKey(id: string, scopeId?: string) {
  const normalizedId = String(id ?? "").trim();
  const normalizedScopeId =
    String(scopeId ?? DEFAULT_RESPONSE_SCOPE_ID).trim() || DEFAULT_RESPONSE_SCOPE_ID;
  return `${normalizedScopeId}::${normalizedId}`;
}

function buildCreatedAnnouncement(
  input: CreateNearbyAnnouncementInput,
  createdAt: number
): NearbyAnnouncement {
  const photoUri = String(input.photoUri ?? "").trim();
  const category = NEARBY_ANNOUNCEMENT_CATEGORY_ORDER.includes(input.category)
    ? input.category
    : "activity";

  return {
    id: `announcement_${createdAt}_${Math.random().toString(16).slice(2)}`,
    title: String(input.title ?? "").trim(),
    description: String(input.description ?? "").trim(),
    category,
    placeLabel: String(input.city ?? "").trim(),
    authorLabel: String(input.authorLabel ?? "").trim() || "Amoria",
    ...(input.authorUid ? { authorUid: String(input.authorUid).trim() } : {}),
    createdAt,
    hasPhoto: Boolean(photoUri),
    ...(photoUri ? { photoUri } : {}),
  };
}

export function createAsyncStorageNearbyAnnouncementsRepository(
  options: CreateAsyncStorageNearbyAnnouncementsRepositoryOptions = {}
): NearbyAnnouncementsRepository {
  const storage = options.storage ?? AsyncStorage;
  const announcementsStorageKey =
    options.announcementsStorageKey ?? NEARBY_ANNOUNCEMENTS_STORAGE_KEY;
  const responsesStorageKey =
    options.responsesStorageKey ?? NEARBY_ANNOUNCEMENT_RESPONSES_STORAGE_KEY;
  const demoAnnouncements = mergeNearbyAnnouncementCollections(
    ...(options.demoAnnouncements ?? DEFAULT_DEMO_ANNOUNCEMENTS).map((item) => {
      const normalized = normalizeNearbyAnnouncement(item);
      return normalized ? [normalized] : [];
    })
  );

  async function readStoredAnnouncements(): Promise<NearbyAnnouncement[]> {
    try {
      const raw = await storage.getItem(announcementsStorageKey);
      if (!raw) return [];

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];

      return sortNearbyAnnouncements(
        parsed
          .map((item) => normalizeNearbyAnnouncement(item))
          .filter((item): item is NearbyAnnouncement => Boolean(item))
      );
    } catch {
      return [];
    }
  }

  async function writeStoredAnnouncements(items: NearbyAnnouncement[]) {
    try {
      await storage.setItem(
        announcementsStorageKey,
        JSON.stringify(sortNearbyAnnouncements(items))
      );
    } catch {}
  }

  async function readResponseMap(): Promise<Record<string, number>> {
    try {
      const raw = await storage.getItem(responsesStorageKey);
      if (!raw) return {};
      return normalizeResponseMap(JSON.parse(raw));
    } catch {
      return {};
    }
  }

  async function writeResponseMap(map: Record<string, number>) {
    try {
      await storage.setItem(responsesStorageKey, JSON.stringify(map));
    } catch {}
  }

  async function listAnnouncements() {
    const storedAnnouncements = await readStoredAnnouncements();
    return mergeNearbyAnnouncementCollections(storedAnnouncements, demoAnnouncements);
  }

  return {
    listAnnouncements,
    async getAnnouncementById(id: string) {
      const announcementId = String(id ?? "").trim();
      if (!announcementId) return null;

      const announcements = await listAnnouncements();
      return announcements.find((item) => item.id === announcementId) ?? null;
    },
    async createAnnouncement(input: CreateNearbyAnnouncementInput) {
      const currentAnnouncements = await readStoredAnnouncements();
      const nextCreatedAt = Math.max(
        Date.now(),
        Number(currentAnnouncements[0]?.createdAt ?? 0) + 1
      );
      const announcement = buildCreatedAnnouncement(input, nextCreatedAt);
      const nextAnnouncements = mergeNearbyAnnouncementCollections(
        [announcement],
        currentAnnouncements
      );

      await writeStoredAnnouncements(nextAnnouncements);
      return announcement;
    },
    async getAnnouncementResponseState(id: string, scopeId?: string) {
      const announcementId = String(id ?? "").trim();
      if (!announcementId) {
        return {
          respondedAt: null,
          hasResponded: false,
        };
      }

      const responseMap = await readResponseMap();
      const respondedAt = Number(
        responseMap[buildAnnouncementResponseKey(announcementId, scopeId)] ?? 0
      );

      return respondedAt > 0
        ? {
            respondedAt,
            hasResponded: true,
          }
        : {
            respondedAt: null,
            hasResponded: false,
          };
    },
    async markAnnouncementResponded(id: string, scopeId?: string) {
      const announcementId = String(id ?? "").trim();
      if (!announcementId) {
        return {
          respondedAt: null,
          hasResponded: false,
        };
      }

      const responseMap = await readResponseMap();
      const respondedAt = Date.now();
      responseMap[buildAnnouncementResponseKey(announcementId, scopeId)] = respondedAt;
      await writeResponseMap(responseMap);

      return {
        respondedAt,
        hasResponded: true,
      };
    },
  };
}

export const nearbyAnnouncementsRepository =
  createAsyncStorageNearbyAnnouncementsRepository();
