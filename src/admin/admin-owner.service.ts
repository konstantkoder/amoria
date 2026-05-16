import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { AppError } from "../common/errors";
import {
  normalizeDisplayName,
  normalizeEmail,
  normalizePassword,
} from "../common/validators";
import * as authRepo from "../auth/auth.repo";
import { hashPassword } from "../auth/passwords";
import type { UserRow } from "../db/schema";
import { generateAmoriaId } from "../users/amoria-id";
import * as adminRepo from "./admin.repo";

const amoriaIdRetries = 8;

export type CreateOwnerAdminInput = {
  email?: string;
  password?: string;
  displayName?: string;
  credentialsDir?: string;
  now?: Date;
};

export type CreateOwnerAdminResult = {
  email: string;
  displayName: string;
  userId: string;
  amoriaId: string;
  adminUserId: string;
  createdUser: boolean;
  generatedPassword: boolean;
  generatedPasswordValue?: string;
  credentialsFile?: string;
};

type AdminOwnerDeps = {
  authRepo: Pick<typeof authRepo, "createUser" | "findUserByEmail" | "uniqueConstraint">;
  adminRepo: Pick<typeof adminRepo, "assignRole" | "ensureRequiredRoles" | "upsertActiveAdminUserForUser">;
  hashPassword: typeof hashPassword;
  generateAmoriaId: typeof generateAmoriaId;
  writeCredentialsFile: typeof writeCredentialsFile;
};

const defaultDeps: AdminOwnerDeps = {
  authRepo,
  adminRepo,
  hashPassword,
  generateAmoriaId,
  writeCredentialsFile,
};

let deps: AdminOwnerDeps = defaultDeps;

export function __setAdminOwnerDepsForTests(overrides: Partial<AdminOwnerDeps>): () => void {
  const previous = deps;
  deps = {
    ...deps,
    ...overrides,
  };

  return () => {
    deps = previous;
  };
}

export async function createOwnerAdminAccount(
  input: CreateOwnerAdminInput = {},
): Promise<CreateOwnerAdminResult> {
  const email = normalizeEmail(input.email || "owner@amoria.local");
  const displayName = normalizeDisplayName(input.displayName || "Amoria Owner");
  const providedPassword = input.password?.trim();
  const password = normalizePassword(providedPassword || generateStrongPassword());
  const generatedPassword = !providedPassword;

  await deps.adminRepo.ensureRequiredRoles();

  const existingUser = await deps.authRepo.findUserByEmail(email);
  const user = existingUser ?? await createRealOwnerUser(email, password, displayName);
  const adminUser = await deps.adminRepo.upsertActiveAdminUserForUser({
    id: user.id,
    email: user.email,
    displayName: user.displayName,
  });
  await deps.adminRepo.assignRole(adminUser.id, "owner");

  const result: CreateOwnerAdminResult = {
    email,
    displayName: user.displayName,
    userId: user.id,
    amoriaId: user.amoriaId,
    adminUserId: adminUser.id,
    createdUser: !existingUser,
    generatedPassword,
  };

  if (generatedPassword) {
    const credentialsFile = await deps.writeCredentialsFile({
      credentialsDir: input.credentialsDir ?? defaultCredentialsDir(),
      now: input.now ?? new Date(),
      email,
      password,
      displayName: user.displayName,
      userId: user.id,
      amoriaId: user.amoriaId,
      adminUserId: adminUser.id,
    });
    result.generatedPasswordValue = password;
    result.credentialsFile = credentialsFile;
  }

  return result;
}

async function createRealOwnerUser(
  email: string,
  password: string,
  displayName: string,
): Promise<UserRow> {
  const passwordHash = await deps.hashPassword(password);

  for (let attempt = 0; attempt < amoriaIdRetries; attempt += 1) {
    try {
      return await deps.authRepo.createUser({
        email,
        passwordHash,
        displayName,
        amoriaId: deps.generateAmoriaId(),
      });
    } catch (error) {
      const constraint = deps.authRepo.uniqueConstraint(error);
      if (constraint?.includes("amoria_id")) {
        continue;
      }
      if (constraint?.includes("email")) {
        const existing = await deps.authRepo.findUserByEmail(email);
        if (existing) {
          return existing;
        }
      }
      throw error;
    }
  }

  throw new AppError("internal_error", "Could not allocate owner Amoria ID", 500);
}

function generateStrongPassword(): string {
  return randomBytes(32).toString("base64url");
}

function defaultCredentialsDir(): string {
  if (process.env.AMORIA_ADMIN_SECRETS_DIR?.trim()) {
    return process.env.AMORIA_ADMIN_SECRETS_DIR.trim();
  }

  return process.platform === "win32"
    ? "F:\\Dev\\AmoriaAdminSecrets"
    : "/mnt/f/Dev/AmoriaAdminSecrets";
}

async function writeCredentialsFile(input: {
  credentialsDir: string;
  now: Date;
  email: string;
  password: string;
  displayName: string;
  userId: string;
  amoriaId: string;
  adminUserId: string;
}): Promise<string> {
  await mkdir(input.credentialsDir, { recursive: true });
  const timestamp = formatTimestamp(input.now);
  const filePath = path.join(input.credentialsDir, `owner-admin-${timestamp}.txt`);
  const body = [
    "Amoria owner admin account",
    `createdAt=${input.now.toISOString()}`,
    `email=${input.email}`,
    `password=${input.password}`,
    `displayName=${input.displayName}`,
    `userId=${input.userId}`,
    `amoriaId=${input.amoriaId}`,
    `adminUserId=${input.adminUserId}`,
    "",
    "This file is local only. Do not commit it or paste it into logs.",
  ].join("\n");

  await writeFile(filePath, body, { encoding: "utf8", flag: "wx" });
  return filePath;
}

function formatTimestamp(value: Date): string {
  const pad = (part: number) => String(part).padStart(2, "0");
  return [
    value.getFullYear(),
    pad(value.getMonth() + 1),
    pad(value.getDate()),
  ].join("-")
    + "_"
    + [
      pad(value.getHours()),
      pad(value.getMinutes()),
      pad(value.getSeconds()),
    ].join("-");
}
