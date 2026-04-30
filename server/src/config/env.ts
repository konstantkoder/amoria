import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

const envPaths = [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "..", ".env"),
];

for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: false, quiet: true });
  }
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  return value ? value : fallback;
}

function parsePort(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }
  return parsed;
}

const nodeEnv = optional("NODE_ENV", "development");
const publicApiUrl = optional("PUBLIC_API_URL", "http://localhost:4000").replace(/\/+$/, "");
const publicMediaUrl = optional("PUBLIC_MEDIA_URL", `${publicApiUrl}/media`).replace(/\/+$/, "");
const uploadsDir = optional("UPLOADS_DIR", "./uploads");
const jwtSecret = required("JWT_SECRET");

if (jwtSecret.length < 16) {
  throw new Error("JWT_SECRET must be at least 16 characters long");
}

if (nodeEnv === "production" && jwtSecret.startsWith("change-me")) {
  throw new Error("JWT_SECRET must be changed for production");
}

export const env = {
  NODE_ENV: nodeEnv,
  PORT: parsePort(optional("PORT", "4000")),
  DATABASE_URL: required("DATABASE_URL"),
  JWT_SECRET: jwtSecret,
  PUBLIC_API_URL: publicApiUrl,
  PUBLIC_MEDIA_URL: publicMediaUrl,
  UPLOADS_DIR: uploadsDir,
  UPLOADS_ROOT: path.resolve(process.cwd(), uploadsDir),
  isProduction: nodeEnv === "production",
  isTest: nodeEnv === "test",
};
