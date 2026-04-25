import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  type Firestore,
} from "firebase/firestore";

import { auth, db } from "@/config/firebaseConfig";

export type SafetyReportTargetType =
  | "announcement"
  | "user"
  | "dmThread"
  | "message"
  | "nearbyPost";

export type SafetyReportReason =
  | "spam"
  | "harassment"
  | "sexual_services"
  | "scam"
  | "other";

export type SafetyReportStatus = "open" | "reviewed" | "dismissed" | "actioned";

export type CreateSafetyReportInput = {
  targetType: SafetyReportTargetType;
  targetId: string;
  targetOwnerUid?: string;
  reason: SafetyReportReason;
  details?: string;
};

const REPORTS_COLLECTION = "reports";
const USERS_COLLECTION = "users";
const BLOCKED_USERS_COLLECTION = "blockedUsers";

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

function requireSafetyDb(database: Firestore | null = db): Firestore {
  if (!database) {
    throw new Error("safety.firestoreUnavailable");
  }
  return database;
}

function requireCurrentUid(uid?: string) {
  const currentUid = String(uid ?? auth?.currentUser?.uid ?? "").trim();
  if (!currentUid) {
    throw new Error("safety.authRequired");
  }
  return currentUid;
}

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

export async function createReport(
  input: CreateSafetyReportInput,
  options: { database?: Firestore | null; reporterUid?: string } = {}
) {
  const currentDb = requireSafetyDb(options.database ?? db);
  const reporterUid = requireCurrentUid(options.reporterUid);
  const targetId = String(input.targetId ?? "").trim();
  if (!targetId) {
    throw new Error("safety.targetRequired");
  }

  const reportRef = doc(collection(currentDb, REPORTS_COLLECTION));
  const now = Date.now();
  const targetOwnerUid = String(input.targetOwnerUid ?? "").trim();
  const details = String(input.details ?? "").trim();

  await setDoc(reportRef, {
    id: reportRef.id,
    reporterUid,
    targetType: input.targetType,
    targetId,
    ...(targetOwnerUid ? { targetOwnerUid } : {}),
    reason: input.reason,
    ...(details ? { details } : {}),
    status: "open",
    createdAt: now,
    createdAtServer: serverTimestamp(),
  });

  return reportRef.id;
}

export async function blockUser(
  blockedUid: string,
  reason?: string,
  options: { database?: Firestore | null; uid?: string } = {}
) {
  const currentDb = requireSafetyDb(options.database ?? db);
  const currentUid = requireCurrentUid(options.uid);
  const targetUid = String(blockedUid ?? "").trim();
  if (!targetUid || targetUid === currentUid) {
    throw new Error("safety.invalidBlockedUser");
  }

  const now = Date.now();
  await setDoc(
    doc(currentDb, USERS_COLLECTION, currentUid, BLOCKED_USERS_COLLECTION, targetUid),
    {
      blockedUid: targetUid,
      ...(reason?.trim() ? { reason: reason.trim() } : {}),
      createdAt: now,
      createdAtServer: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function unblockUser(
  blockedUid: string,
  options: { database?: Firestore | null; uid?: string } = {}
) {
  const currentDb = requireSafetyDb(options.database ?? db);
  const currentUid = requireCurrentUid(options.uid);
  const targetUid = String(blockedUid ?? "").trim();
  if (!targetUid) return;

  await deleteDoc(
    doc(currentDb, USERS_COLLECTION, currentUid, BLOCKED_USERS_COLLECTION, targetUid)
  );
}

export async function getBlockedUserIds(
  uid?: string,
  options: { database?: Firestore | null } = {}
) {
  const currentDb = requireSafetyDb(options.database ?? db);
  const currentUid = requireCurrentUid(uid);
  const snapshot = await getDocs(
    collection(currentDb, USERS_COLLECTION, currentUid, BLOCKED_USERS_COLLECTION)
  );
  return snapshot.docs
    .map((item) => String(item.data().blockedUid ?? item.id).trim())
    .filter(Boolean);
}

export async function isUserBlocked(
  blockedUid: string,
  options: { database?: Firestore | null; uid?: string } = {}
) {
  const currentDb = requireSafetyDb(options.database ?? db);
  const currentUid = requireCurrentUid(options.uid);
  const targetUid = String(blockedUid ?? "").trim();
  if (!targetUid) return false;

  const snapshot = await getDoc(
    doc(currentDb, USERS_COLLECTION, currentUid, BLOCKED_USERS_COLLECTION, targetUid)
  );
  return snapshot.exists();
}
