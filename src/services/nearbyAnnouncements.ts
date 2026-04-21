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
  authorUid: string;
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
  if (!authorUid) return null;
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
    authorUid,
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
    authorUid: String(input.authorUid).trim(),
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
    return readStoredAnnouncements();
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
