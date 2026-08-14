import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import jwt from "jsonwebtoken";
import pg from "pg";

const connectionString = process.env.SCALE_DATABASE_URL;
if (!connectionString) throw new Error("SCALE_DATABASE_URL is required");
guardScaleDatabase(connectionString);
const secret = process.env.SCALE_JWT_SECRET || "";
if (secret.length < 32) throw new Error("SCALE_JWT_SECRET must be at least 32 characters");
const scenario = (process.env.SCALE_FIXTURE_SCENARIO || "http_reads").toLowerCase();
const supported = new Set([
  "http_reads", "websocket_steady", "chat", "realtime_e2e", "nearby", "together",
  "together_match", "turn_based", "notifications", "mixed", "reconnect_storm", "worker_recovery",
]);
if (!supported.has(scenario)) throw new Error(`Unsupported SCALE_FIXTURE_SCENARIO ${scenario}`);
const count = integer("SCALE_FIXTURE_COUNT", "100", 1, 50_000);
const offset = integer("SCALE_FIXTURE_OFFSET", "0", 0, 5_000_000);
const ttlSeconds = integer("SCALE_TOKEN_TTL_SECONDS", "7200", 300, 86_400);
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const fixtureDirectory = path.resolve(scriptDirectory, "fixtures");
const requestedOutput = process.env.SCALE_FIXTURE_OUTPUT
  ? path.resolve(process.env.SCALE_FIXTURE_OUTPUT)
  : path.join(fixtureDirectory, `${scenario}-${offset}-${count}.json`);
if (path.dirname(requestedOutput) !== fixtureDirectory || path.extname(requestedOutput) !== ".json") {
  throw new Error(`SCALE_FIXTURE_OUTPUT must be a JSON file directly inside ${fixtureDirectory}`);
}

const pool = new pg.Pool({ connectionString, max: 1 });
try {
  const fixtures = scenario === "chat" || scenario === "realtime_e2e" || scenario === "mixed"
    ? await chatFixtures()
    : scenario === "together_match" || scenario === "turn_based"
      ? await pairFixtures()
      : await userFixtures();
  if (fixtures.length !== count) {
    throw new Error(`Requested ${count} fixtures but only ${fixtures.length} scale rows were available`);
  }
  await mkdir(fixtureDirectory, { recursive: true });
  await writeFile(requestedOutput, `${JSON.stringify(fixtures, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  process.stdout.write(`${JSON.stringify({ scenario, count: fixtures.length, offset, output: requestedOutput })}\n`);
} finally {
  await pool.end();
}

async function userFixtures() {
  const result = await pool.query(`
    SELECT id::text,auth_version
    FROM users WHERE email LIKE 'scale-%@load.invalid' AND account_status='active'
    ORDER BY amoria_id OFFSET $1 LIMIT $2`, [offset, count]);
  return result.rows.map((row) => ({ userId: row.id, token: token(row) }));
}

async function chatFixtures() {
  const result = await pool.query(`
    SELECT p.user_a_id::text sender_id,sender.auth_version sender_version,
      p.user_b_id::text receiver_id,receiver.auth_version receiver_version,p.thread_id::text
    FROM direct_thread_pairs p
    JOIN users sender ON sender.id=p.user_a_id AND sender.email LIKE 'scale-%@load.invalid'
    JOIN users receiver ON receiver.id=p.user_b_id AND receiver.email LIKE 'scale-%@load.invalid'
    WHERE p.thread_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    ORDER BY p.thread_id OFFSET $1 LIMIT $2`, [offset, count]);
  return result.rows.map((row) => ({
    userId: row.receiver_id,
    token: token({ id: row.receiver_id, auth_version: row.receiver_version }),
    senderToken: token({ id: row.sender_id, auth_version: row.sender_version }),
    threadId: row.thread_id,
  }));
}

async function pairFixtures() {
  const result = await pool.query(`
    SELECT id::text,auth_version
    FROM users WHERE email LIKE 'scale-%@load.invalid' AND account_status='active'
    ORDER BY amoria_id OFFSET $1 LIMIT $2`, [offset * 2, count * 2]);
  const fixtures = [];
  for (let index = 0; index + 1 < result.rows.length; index += 2) {
    const fixtureIndex = offset + index / 2;
    fixtures.push({
      userId: result.rows[index].id,
      token: token(result.rows[index]),
      partnerToken: token(result.rows[index + 1]),
      togetherActivity: fixtureIndex % 2 === 0 ? "draw" : "story_sparks",
      togetherLocation: {
        latitude: -60 + (fixtureIndex % 1_200) * 0.1,
        longitude: -170 + Math.floor(fixtureIndex / 1_200) * 0.1,
        radiusKm: 5,
      },
    });
  }
  return fixtures;
}

function token(row) {
  return jwt.sign(
    { sub: row.id, typ: "access", ver: Number(row.auth_version) },
    secret,
    {
      algorithm: "HS256",
      issuer: "amoria-api",
      audience: "amoria-mobile",
      expiresIn: ttlSeconds,
    },
  );
}

function integer(name, fallback, min, max) {
  const value = Number.parseInt(process.env[name] || fallback, 10);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${name} must be ${min}..${max}`);
  return value;
}

function guardScaleDatabase(value) {
  const url = new URL(value);
  if (
    !/(test|scale|bench|dev)/i.test(url.pathname) ||
    /prod|production/i.test(`${url.hostname}${url.pathname}`) ||
    process.env.NODE_ENV === "production" ||
    process.env.CONFIRM_SCALE_FIXTURES !== "I_CONFIRM_TEST_DATABASE"
  ) {
    throw new Error("Refusing fixture generation outside a confirmed test/scale/bench/dev database");
  }
}
