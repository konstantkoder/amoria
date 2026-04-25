import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
  type Firestore,
} from "firebase/firestore";
import {
  getDownloadURL,
  ref as storageRef,
  uploadBytes,
  type FirebaseStorage,
} from "firebase/storage";

import { auth, db, firebaseConfig, storage } from "@/config/firebaseConfig";

export type NearbyAnnouncementCategory =
  | "walk"
  | "trip"
  | "coffee"
  | "activity"
  | "sport"
  | "ride";

export type NearbyAnnouncementStatus = "active" | "closed" | "deleted" | "under_review";

export type NearbyAnnouncement = {
  id: string;
  title: string;
  description: string;
  category: NearbyAnnouncementCategory;
  placeLabel: string;
  proximityLabel?: string;
  authorLabel: string;
  authorName?: string;
  authorUid: string;
  createdAt: number;
  updatedAt: number;
  status: NearbyAnnouncementStatus;
  responseCount: number;
  lastResponseAt?: number;
  hasPhoto: boolean;
  photoUrl?: string;
  photoUri?: string;
};

export type CreateNearbyAnnouncementInput = {
  title: string;
  description: string;
  category: NearbyAnnouncementCategory;
  placeLabel?: string;
  authorLabel: string;
  authorUid: string;
  photoUri?: string;
};

export type RespondToNearbyAnnouncementInput = {
  uid: string;
  dmThreadId?: string;
};

export type NearbyAnnouncementResponseState = {
  respondedAt: number | null;
  hasResponded: boolean;
  dmThreadId?: string;
};

export type NearbyAnnouncementsRepository = {
  listAnnouncements(): Promise<NearbyAnnouncement[]>;
  getAnnouncementById(id: string): Promise<NearbyAnnouncement | null>;
  createAnnouncement(
    input: CreateNearbyAnnouncementInput
  ): Promise<NearbyAnnouncement>;
  getAnnouncementResponseState(
    id: string,
    uid?: string
  ): Promise<NearbyAnnouncementResponseState>;
  respondToAnnouncement(
    id: string,
    input: RespondToNearbyAnnouncementInput
  ): Promise<NearbyAnnouncementResponseState>;
  markAnnouncementResponded(
    id: string,
    uid?: string,
    options?: { dmThreadId?: string }
  ): Promise<NearbyAnnouncementResponseState>;
};

export const NEARBY_ANNOUNCEMENT_CATEGORY_ORDER: NearbyAnnouncementCategory[] = [
  "walk",
  "coffee",
  "trip",
  "activity",
  "sport",
  "ride",
];

const ANNOUNCEMENTS_COLLECTION = "announcements";
const RESPONSES_COLLECTION = "responses";

function requireAnnouncementsDb(database: Firestore | null): Firestore {
  if (!database) {
    throw new Error("announcements.firestoreUnavailable");
  }
  return database;
}

function isCategory(value: unknown): value is NearbyAnnouncementCategory {
  return NEARBY_ANNOUNCEMENT_CATEGORY_ORDER.includes(
    value as NearbyAnnouncementCategory
  );
}

function normalizeStatus(value: unknown): NearbyAnnouncementStatus {
  if (value === "closed" || value === "deleted" || value === "under_review") return value;
  return "active";
}

function readMillis(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.getTime();
  if (value && typeof value === "object" && "toMillis" in value) {
    const millis = Number((value as { toMillis: () => number }).toMillis());
    return Number.isFinite(millis) ? millis : 0;
  }
  return 0;
}

function normalizeNearbyAnnouncement(
  id: string,
  raw: unknown
): NearbyAnnouncement | null {
  if (!raw || typeof raw !== "object") return null;

  const data = raw as Partial<NearbyAnnouncement>;
  const title = String(data.title ?? "").trim();
  const description = String(data.description ?? "").trim();
  const authorUid = String(data.authorUid ?? "").trim();
  if (!id || !title || !description || !authorUid) return null;

  const category = isCategory(data.category) ? data.category : "activity";
  const placeLabel = String(data.placeLabel ?? "").trim();
  const proximityLabel = String(data.proximityLabel ?? "").trim();
  const authorName = String(data.authorName ?? data.authorLabel ?? "").trim();
  const authorLabel = String(data.authorLabel ?? authorName ?? "Amoria").trim() || "Amoria";
  const createdAt = readMillis(data.createdAt);
  const updatedAt = readMillis(data.updatedAt) || createdAt;
  const lastResponseAt = readMillis(data.lastResponseAt);
  const photoUrl = String(data.photoUrl ?? data.photoUri ?? "").trim();
  const responseCount = Math.max(Number(data.responseCount ?? 0), 0);

  return {
    id,
    title,
    description,
    category,
    placeLabel,
    ...(proximityLabel ? { proximityLabel } : {}),
    authorLabel,
    ...(authorName ? { authorName } : {}),
    authorUid,
    createdAt,
    updatedAt,
    status: normalizeStatus(data.status),
    responseCount: Number.isFinite(responseCount) ? responseCount : 0,
    ...(lastResponseAt ? { lastResponseAt } : {}),
    hasPhoto: Boolean(data.hasPhoto || photoUrl),
    ...(photoUrl ? { photoUrl, photoUri: photoUrl } : {}),
  };
}

function sortNearbyAnnouncements(items: NearbyAnnouncement[]): NearbyAnnouncement[] {
  return [...items].sort((left, right) => {
    const byCreatedAt = right.createdAt - left.createdAt;
    if (byCreatedAt !== 0) return byCreatedAt;
    return left.id.localeCompare(right.id);
  });
}

function inferAnnouncementPhotoContentType(uri: string) {
  const lower = uri.toLowerCase();
  if (lower.includes(".png")) return "image/png";
  if (lower.includes(".webp")) return "image/webp";
  return "image/jpeg";
}

function inferAnnouncementPhotoExtension(contentType: string) {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "jpg";
}

async function uploadAnnouncementPhoto(params: {
  currentStorage: FirebaseStorage | null;
  uid: string;
  announcementId: string;
  photoUri: string;
}) {
  const { announcementId, currentStorage, photoUri, uid } = params;
  const storageBucket = String(firebaseConfig.storageBucket ?? "").trim();
  if (!currentStorage || !storageBucket) {
    throw new Error("announcements.photoUploadUnavailable");
  }

  const response = await fetch(photoUri);
  if (!response.ok) {
    throw new Error("announcements.photoReadFailed");
  }

  const blob = await response.blob();
  const contentType = inferAnnouncementPhotoContentType(photoUri);
  const extension = inferAnnouncementPhotoExtension(contentType);
  const coverRef = storageRef(
    currentStorage,
    `${ANNOUNCEMENTS_COLLECTION}/${uid}/${announcementId}/cover.${extension}`
  );

  await uploadBytes(coverRef, blob, { contentType });
  return getDownloadURL(coverRef);
}

export function createFirestoreNearbyAnnouncementsRepository(options: {
  database?: Firestore | null;
  currentStorage?: FirebaseStorage | null;
} = {}): NearbyAnnouncementsRepository {
  const database = options.database ?? db;
  const currentStorage = options.currentStorage ?? storage;

  function announcementDoc(id: string) {
    return doc(requireAnnouncementsDb(database), ANNOUNCEMENTS_COLLECTION, id);
  }

  function responsesCollection(id: string) {
    return collection(announcementDoc(id), RESPONSES_COLLECTION);
  }

  const repository: NearbyAnnouncementsRepository = {
    async listAnnouncements() {
      const currentDb = requireAnnouncementsDb(database);
      const announcementsQuery = query(
        collection(currentDb, ANNOUNCEMENTS_COLLECTION),
        where("status", "==", "active")
      );
      const snapshot = await getDocs(announcementsQuery);
      return sortNearbyAnnouncements(
        snapshot.docs
          .map((item) => normalizeNearbyAnnouncement(item.id, item.data()))
          .filter((item): item is NearbyAnnouncement => Boolean(item))
      );
    },

    async getAnnouncementById(id: string) {
      const announcementId = String(id ?? "").trim();
      if (!announcementId) return null;

      const snapshot = await getDoc(announcementDoc(announcementId));
      if (!snapshot.exists()) return null;

      return normalizeNearbyAnnouncement(snapshot.id, snapshot.data());
    },

    async createAnnouncement(input: CreateNearbyAnnouncementInput) {
      const currentDb = requireAnnouncementsDb(database);
      const currentUser = auth?.currentUser;
      const currentUid = String(currentUser?.uid ?? input.authorUid ?? "").trim();
      if (!currentUid || currentUid !== String(input.authorUid ?? "").trim()) {
        throw new Error("announcements.authRequired");
      }

      const title = String(input.title ?? "").trim();
      const description = String(input.description ?? "").trim();
      if (!title || !description) {
        throw new Error("announcements.contentRequired");
      }

      const category = isCategory(input.category) ? input.category : "activity";
      const authorLabel = String(input.authorLabel ?? "").trim() || "Amoria";
      const placeLabel = String(input.placeLabel ?? "").trim();
      const announcementRef = doc(collection(currentDb, ANNOUNCEMENTS_COLLECTION));
      const now = Date.now();
      const localPhotoUri = String(input.photoUri ?? "").trim();
      const photoUrl = localPhotoUri
        ? await uploadAnnouncementPhoto({
            currentStorage,
            uid: currentUid,
            announcementId: announcementRef.id,
            photoUri: localPhotoUri,
          })
        : "";

      const announcement: NearbyAnnouncement = {
        id: announcementRef.id,
        title,
        description,
        category,
        placeLabel,
        authorLabel,
        authorName: authorLabel,
        authorUid: currentUid,
        createdAt: now,
        updatedAt: now,
        status: "active",
        responseCount: 0,
        hasPhoto: Boolean(photoUrl),
        ...(photoUrl ? { photoUrl, photoUri: photoUrl } : {}),
      };

      await setDoc(announcementRef, {
        id: announcement.id,
        title,
        description,
        category,
        placeLabel,
        authorLabel,
        authorName: authorLabel,
        authorUid: currentUid,
        createdAt: now,
        updatedAt: now,
        createdAtServer: serverTimestamp(),
        updatedAtServer: serverTimestamp(),
        status: "active",
        responseCount: 0,
        hasPhoto: Boolean(photoUrl),
        ...(photoUrl ? { photoUrl } : {}),
      });

      return announcement;
    },

    async getAnnouncementResponseState(id: string, uid?: string) {
      const announcementId = String(id ?? "").trim();
      const responseUid = String(uid ?? "").trim();
      if (!announcementId || !responseUid) {
        return {
          respondedAt: null,
          hasResponded: false,
        };
      }

      const responseRef = doc(responsesCollection(announcementId), responseUid);
      const snapshot = await getDoc(responseRef);
      if (!snapshot.exists()) {
        return {
          respondedAt: null,
          hasResponded: false,
        };
      }

      const data = snapshot.data() as {
        createdAt?: unknown;
        dmThreadId?: unknown;
      };
      const respondedAt = readMillis(data.createdAt);
      const dmThreadId = String(data.dmThreadId ?? "").trim();
      return {
        respondedAt: respondedAt || null,
        hasResponded: Boolean(respondedAt),
        ...(dmThreadId ? { dmThreadId } : {}),
      };
    },

    async respondToAnnouncement(id: string, input: RespondToNearbyAnnouncementInput) {
      const announcementId = String(id ?? "").trim();
      const responseUid = String(input.uid ?? "").trim();
      if (!announcementId || !responseUid) {
        throw new Error("announcements.authRequired");
      }

      const announcementRef = announcementDoc(announcementId);
      const responseRef = doc(responsesCollection(announcementId), responseUid);
      const dmThreadId = String(input.dmThreadId ?? "").trim();

      return runTransaction(requireAnnouncementsDb(database), async (tx) => {
        const [announcementSnapshot, responseSnapshot] = await Promise.all([
          tx.get(announcementRef),
          tx.get(responseRef),
        ]);
        if (!announcementSnapshot.exists()) {
          throw new Error("announcements.notFound");
        }

        const announcement = normalizeNearbyAnnouncement(
          announcementSnapshot.id,
          announcementSnapshot.data()
        );
        if (!announcement || announcement.status !== "active") {
          throw new Error("announcements.notFound");
        }
        if (announcement.authorUid === responseUid) {
          throw new Error("announcements.cannotRespondToOwn");
        }

        if (responseSnapshot.exists()) {
          const data = responseSnapshot.data() as {
            createdAt?: unknown;
            dmThreadId?: unknown;
          };
          const respondedAt = readMillis(data.createdAt);
          const existingDmThreadId = String(data.dmThreadId ?? "").trim();
          if (dmThreadId && !existingDmThreadId) {
            tx.set(responseRef, { dmThreadId }, { merge: true });
          }
          return {
            respondedAt: respondedAt || Date.now(),
            hasResponded: true,
            ...(existingDmThreadId || dmThreadId
              ? { dmThreadId: existingDmThreadId || dmThreadId }
              : {}),
          };
        }

        const now = Date.now();
        tx.set(responseRef, {
          uid: responseUid,
          status: "sent",
          createdAt: now,
          createdAtServer: serverTimestamp(),
          ...(dmThreadId ? { dmThreadId } : {}),
        });
        tx.set(
          announcementRef,
          {
            responseCount: announcement.responseCount + 1,
            lastResponseAt: now,
            updatedAt: now,
            updatedAtServer: serverTimestamp(),
          },
          { merge: true }
        );

        return {
          respondedAt: now,
          hasResponded: true,
          ...(dmThreadId ? { dmThreadId } : {}),
        };
      });
    },

    async markAnnouncementResponded(id: string, uid?: string, options?: { dmThreadId?: string }) {
      return repository.respondToAnnouncement(id, {
        uid: String(uid ?? ""),
        ...(options?.dmThreadId ? { dmThreadId: options.dmThreadId } : {}),
      });
    },
  };

  return repository;
}

export const nearbyAnnouncementsRepository =
  createFirestoreNearbyAnnouncementsRepository();
