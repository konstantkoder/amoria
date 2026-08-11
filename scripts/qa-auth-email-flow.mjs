import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const apiBase = process.env.QA_API_URL ?? "http://localhost:4000";
const mailpitBase = process.env.QA_MAILPIT_URL ?? "http://localhost:8025";
const databaseUrl = process.env.QA_DATABASE_URL;
if (!databaseUrl) throw new Error("QA_DATABASE_URL is required");

const client = new pg.Client({ connectionString: databaseUrl });
const results = new Map();
const capturedCodes = [];
const startedAt = Date.now();

function qaEmail(label) {
  // Use a domain with real MX records. SMTP is still routed exclusively to the
  // disposable Mailpit instance, so this never delivers external mail.
  return `amoria.qa.${label}.${Date.now()}.${randomBytes(3).toString("hex")}@gmail.com`;
}

function password() {
  return `${randomBytes(18).toString("base64url")}Aa1!`;
}

async function request(path, body, context = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-device-id": context.deviceId ?? `qa-${randomBytes(8).toString("hex")}`,
      ...(context.ip ? { "x-forwarded-for": context.ip } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => undefined);
  return { status: response.status, data, retryAfter: response.headers.get("retry-after") };
}

async function messages() {
  const response = await fetch(`${mailpitBase}/api/v1/messages`);
  if (!response.ok) throw new Error(`Mailpit returned ${response.status}`);
  return (await response.json()).messages ?? [];
}

async function waitForApi() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${apiBase}/health`);
      if (response.ok) return;
    } catch {
      // The container may still be applying migrations.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Timed out waiting for the API health endpoint");
}

async function waitForCode(email, subject, notBefore = 0, excludedIds = new Set()) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const matching = (await messages())
      .filter((message) =>
        !excludedIds.has(message.ID)
        && message.To?.some((recipient) => recipient.Address === email)
        && message.Subject === subject
        && Date.parse(message.Created) >= notBefore - 1000)
      .sort((left, right) => Date.parse(right.Created) - Date.parse(left.Created));
    for (const message of matching) {
      const match = String(message.Snippet ?? "").match(/\b([0-9]{6})\b/);
      if (match) {
        capturedCodes.push(match[1]);
        return { code: match[1], id: message.ID, created: Date.parse(message.Created) };
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out waiting for ${subject}`);
}

function requireStatus(response, expected, label) {
  if (response.status !== expected) {
    throw new Error(`${label}: expected HTTP ${expected}, received ${response.status}`);
  }
}

async function register(email, secret, context) {
  return request("/auth/register", {
    email,
    password: secret,
    displayName: "Amoria QA",
    locale: "en",
  }, context);
}

async function mainFlow() {
  const email = qaEmail("flow");
  const oldPassword = password();
  const newPassword = password();
  const context = { deviceId: `qa-flow-${randomBytes(6).toString("hex")}`, ip: "198.51.100.10" };
  const mailStart = Date.now();
  const registration = await register(email, oldPassword, context);
  requireStatus(registration, 201, "registration");
  results.set("VALID_REGISTRATION", registration.data?.verificationRequired === true);
  results.set("REGISTRATION_NO_TOKENS", !registration.data?.accessToken && !registration.data?.refreshToken);
  results.set("REGISTRATION_VERIFICATION_REQUIRED", registration.data?.verificationRequired === true);

  const userResult = await client.query("SELECT id, email_verified_at FROM users WHERE email = $1", [email]);
  const user = userResult.rows[0];
  results.set("NEW_USER_UNVERIFIED", Boolean(user) && user.email_verified_at === null);

  const duplicate = await register(email.toUpperCase(), oldPassword, context);
  const duplicateCount = await client.query("SELECT count(*)::int AS count FROM users WHERE email = $1", [email]);
  results.set("DUPLICATE_REGISTRATION_ONE_USER", duplicate.status === 201 && duplicateCount.rows[0].count === 1);

  const unverifiedLogin = await request("/auth/login", { email, password: oldPassword }, context);
  results.set(
    "UNVERIFIED_LOGIN_REJECTED",
    unverifiedLogin.status === 403
      && unverifiedLogin.data?.error?.code === "email_not_verified"
      && !unverifiedLogin.data?.accessToken
      && !unverifiedLogin.data?.refreshToken,
  );

  const verificationMail = await waitForCode(email, "Verify your Amoria email", mailStart);
  results.set("VERIFICATION_EMAIL_RECEIVED", true);
  const resend = await request("/auth/resend-verification", { email, locale: "en" }, context);
  results.set("RESEND_COOLDOWN", resend.status === 429 && Boolean(resend.retryAfter));

  const wrongVerificationCode = verificationMail.code === "000000" ? "999999" : "000000";
  const wrongVerification = await request(
    "/auth/verify-email",
    { email, code: wrongVerificationCode },
    context,
  );
  results.set("WRONG_VERIFICATION_CODE_REJECTED", wrongVerification.status === 400);

  const verification = await request("/auth/verify-email", { email, code: verificationMail.code }, context);
  requireStatus(verification, 200, "verification");
  results.set("EMAIL_VERIFICATION", Boolean(verification.data?.accessToken && verification.data?.refreshToken));
  const verified = await client.query("SELECT email_verified_at FROM users WHERE id = $1", [user.id]);
  results.set("VERIFIED_TIMESTAMP", Boolean(verified.rows[0]?.email_verified_at));

  const replay = await request("/auth/verify-email", { email, code: verificationMail.code }, context);
  results.set("VERIFICATION_REPLAY_REJECTED", replay.status === 400);

  const login = await request("/auth/login", { email, password: oldPassword }, context);
  requireStatus(login, 200, "login after verification");
  results.set("LOGIN_AFTER_VERIFICATION", true);
  const oldRefreshToken = login.data.refreshToken;

  const logout = await request("/auth/logout", { refreshToken: verification.data.refreshToken }, context);
  results.set("LOGOUT", logout.status === 200);

  const resetStart = Date.now();
  const resetRequest = await request("/auth/password-reset/request", { email, locale: "en" }, context);
  requireStatus(resetRequest, 200, "password reset request");
  results.set("RESET_REQUEST_GENERIC", JSON.stringify(resetRequest.data) === JSON.stringify({ ok: true }));
  const resetMail = await waitForCode(email, "Reset your Amoria password", resetStart);
  results.set("RESET_EMAIL_RECEIVED", true);

  const wrongCode = resetMail.code === "000000" ? "999999" : "000000";
  const wrongReset = await request("/auth/password-reset/confirm", {
    email,
    code: wrongCode,
    newPassword,
  }, context);
  results.set("WRONG_RESET_CODE_REJECTED", wrongReset.status === 400);

  const resetConfirm = await request("/auth/password-reset/confirm", {
    email,
    code: resetMail.code,
    newPassword,
  }, context);
  requireStatus(resetConfirm, 200, "password reset confirmation");
  results.set("PASSWORD_RESET", resetConfirm.data?.ok === true);

  const revoked = await request("/auth/refresh", { refreshToken: oldRefreshToken }, context);
  results.set("OLD_REFRESH_REVOKED", revoked.status === 401);
  const replayReset = await request("/auth/password-reset/confirm", {
    email,
    code: resetMail.code,
    newPassword,
  }, context);
  results.set("RESET_REPLAY_REJECTED", replayReset.status === 400);

  const oldLogin = await request("/auth/login", { email, password: oldPassword }, context);
  results.set("OLD_PASSWORD_REJECTED", oldLogin.status === 401);
  const newLogin = await request("/auth/login", { email, password: newPassword }, context);
  requireStatus(newLogin, 200, "new password login");
  results.set("NEW_PASSWORD_LOGIN", true);
  const finalLogout = await request("/auth/logout", { refreshToken: newLogin.data.refreshToken }, context);
  results.set("FINAL_LOGOUT", finalLogout.status === 200);

  const expireStart = Date.now();
  const expireRequest = await request("/auth/password-reset/request", { email, locale: "en" }, context);
  requireStatus(expireRequest, 200, "expiring reset request");
  const expireMail = await waitForCode(email, "Reset your Amoria password", expireStart, new Set([resetMail.id]));
  await client.query(
    "UPDATE auth_email_challenges SET expires_at = now() - interval '1 minute' WHERE user_id = $1 AND purpose = 'password_reset' AND consumed_at IS NULL",
    [user.id],
  );
  const expiredReset = await request("/auth/password-reset/confirm", {
    email,
    code: expireMail.code,
    newPassword: password(),
  }, context);
  results.set("EXPIRED_RESET_REJECTED", expiredReset.status === 400 && expiredReset.data?.error?.code === "password_reset_code_expired");
}

async function verificationMatrix() {
  const expiredEmail = qaEmail("expired");
  const expiredPassword = password();
  const expiredContext = { deviceId: "qa-expired-device", ip: "198.51.100.20" };
  const expiredStart = Date.now();
  requireStatus(await register(expiredEmail, expiredPassword, expiredContext), 201, "expired-code registration");
  const expiredMail = await waitForCode(expiredEmail, "Verify your Amoria email", expiredStart);
  const expiredUser = await client.query("SELECT id FROM users WHERE email = $1", [expiredEmail]);
  await client.query(
    "UPDATE auth_email_challenges SET expires_at = now() - interval '1 minute' WHERE user_id = $1 AND purpose = 'verify_email' AND consumed_at IS NULL",
    [expiredUser.rows[0].id],
  );
  const expired = await request("/auth/verify-email", { email: expiredEmail, code: expiredMail.code }, expiredContext);
  results.set("EXPIRED_VERIFICATION_REJECTED", expired.status === 400 && expired.data?.error?.code === "verification_code_expired");

  const maxEmail = qaEmail("max");
  const maxContext = { deviceId: "qa-max-device", ip: "198.51.100.21" };
  requireStatus(await register(maxEmail, password(), maxContext), 201, "max-attempt registration");
  for (let index = 0; index < 5; index += 1) {
    await request("/auth/verify-email", { email: maxEmail, code: "000000" }, maxContext);
  }
  const maxUser = await client.query("SELECT id FROM users WHERE email = $1", [maxEmail]);
  const exhausted = await client.query(
    "SELECT attempt_count, max_attempts, consumed_at FROM auth_email_challenges WHERE user_id = $1 AND purpose = 'verify_email' ORDER BY created_at DESC LIMIT 1",
    [maxUser.rows[0].id],
  );
  results.set("VERIFICATION_MAX_ATTEMPTS", exhausted.rows[0]?.attempt_count === exhausted.rows[0]?.max_attempts && Boolean(exhausted.rows[0]?.consumed_at));
}

async function concurrencyMatrix() {
  const email = qaEmail("parallel");
  const secret = password();
  const context = { deviceId: "qa-parallel-device", ip: "198.51.100.30" };
  const mailStart = Date.now();
  const parallel = await Promise.all([register(email, secret, context), register(email.toUpperCase(), secret, context)]);
  results.set("PARALLEL_REGISTRATION_RESPONSES", parallel.every((response) => response.status === 201));
  const count = await client.query("SELECT count(*)::int AS count FROM users WHERE email = $1", [email]);
  results.set("PARALLEL_REGISTRATION_ONE_USER", count.rows[0].count === 1);
  results.set("EMAIL_NORMALIZATION", count.rows[0].count === 1);
  const verificationMail = await waitForCode(email, "Verify your Amoria email", mailStart);
  const verifies = await Promise.all([
    request("/auth/verify-email", { email, code: verificationMail.code }, context),
    request("/auth/verify-email", { email, code: verificationMail.code }, context),
  ]);
  results.set("SIMULTANEOUS_VERIFY_SINGLE_SUCCESS", verifies.filter((response) => response.status === 200).length === 1);

  const resetStarts = Date.now();
  const resets = await Promise.all([
    request("/auth/password-reset/request", { email, locale: "en" }, context),
    request("/auth/password-reset/request", { email, locale: "en" }, context),
  ]);
  results.set("PARALLEL_RESET_REQUESTS_GENERIC", resets.every((response) => response.status === 200 && response.data?.ok === true));
  const user = await client.query("SELECT id FROM users WHERE email = $1", [email]);
  const active = await client.query(
    "SELECT count(*)::int AS count FROM auth_email_challenges WHERE user_id = $1 AND purpose = 'password_reset' AND consumed_at IS NULL",
    [user.rows[0].id],
  );
  results.set("PARALLEL_RESET_ONE_ACTIVE_CHALLENGE", active.rows[0].count === 1);
  await waitForCode(email, "Reset your Amoria password", resetStarts);

  const raceEmail = qaEmail("resend-race");
  const raceContext = { deviceId: "qa-resend-race", ip: "198.51.100.31" };
  const raceStart = Date.now();
  requireStatus(await register(raceEmail, password(), raceContext), 201, "resend-race registration");
  const originalMail = await waitForCode(raceEmail, "Verify your Amoria email", raceStart);
  const raceUser = await client.query("SELECT id FROM users WHERE email = $1", [raceEmail]);
  await client.query(
    "UPDATE auth_email_challenges SET sent_at = now() - interval '2 minutes' WHERE user_id = $1 AND purpose = 'verify_email' AND consumed_at IS NULL",
    [raceUser.rows[0].id],
  );
  const [resendRace, verifyRace] = await Promise.all([
    request("/auth/resend-verification", { email: raceEmail, locale: "en" }, raceContext),
    request("/auth/verify-email", { email: raceEmail, code: originalMail.code }, raceContext),
  ]);
  results.set("RESEND_VERIFY_RACE_CONSISTENT", resendRace.status === 200 && [200, 400].includes(verifyRace.status));
  let raceVerified = verifyRace.status === 200;
  if (!raceVerified) {
    const replacementMail = await waitForCode(
      raceEmail,
      "Verify your Amoria email",
      raceStart,
      new Set([originalMail.id]),
    );
    const replacementVerify = await request(
      "/auth/verify-email",
      { email: raceEmail, code: replacementMail.code },
      raceContext,
    );
    raceVerified = replacementVerify.status === 200;
  }
  const raceState = await client.query(
    `SELECT u.email_verified_at,
       (SELECT count(*)::int FROM auth_email_challenges c
        WHERE c.user_id = u.id AND c.purpose = 'verify_email' AND c.consumed_at IS NULL) AS active_count
     FROM users u WHERE u.id = $1`,
    [raceUser.rows[0].id],
  );
  results.set(
    "RESEND_VERIFY_RACE_FINAL_STATE",
    raceVerified && Boolean(raceState.rows[0]?.email_verified_at) && raceState.rows[0]?.active_count === 0,
  );
}

async function grandfatherMigrationMatrix() {
  const databaseName = `amoria_migration_qa_${Date.now()}_${randomBytes(2).toString("hex")}`;
  const adminUrl = new URL(databaseUrl);
  const tempUrl = new URL(databaseUrl);
  tempUrl.pathname = `/${databaseName}`;
  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  let temp;
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE ${databaseName}`);
    temp = new pg.Client({ connectionString: tempUrl.toString() });
    await temp.connect();
    const migrationsDir = path.resolve(process.cwd(), "src/db/migrations");
    const files = (await fs.readdir(migrationsDir))
      .filter((file) => /^[0-9]{4}_.+\.sql$/.test(file))
      .sort();
    for (const file of files.filter((name) => !name.startsWith("0029_"))) {
      await temp.query(await fs.readFile(path.join(migrationsDir, file), "utf8"));
    }
    const legacyEmail = qaEmail("legacy");
    await temp.query(
      "INSERT INTO users (email, password_hash, display_name, amoria_id) VALUES ($1, $2, $3, $4)",
      [legacyEmail, "migration-only-hash", "Legacy QA", "AM-LEGQ1"],
    );
    await temp.query(await fs.readFile(path.join(migrationsDir, "0029_auth_email_antiabuse.sql"), "utf8"));
    const legacy = await temp.query(
      "SELECT email_verified_at = created_at AS grandfathered FROM users WHERE email = $1",
      [legacyEmail],
    );
    const newEmail = qaEmail("post-migration");
    await temp.query(
      "INSERT INTO users (email, password_hash, display_name, amoria_id) VALUES ($1, $2, $3, $4)",
      [newEmail, "migration-only-hash", "New QA", "AM-NEWQ1"],
    );
    const created = await temp.query("SELECT email_verified_at FROM users WHERE email = $1", [newEmail]);
    results.set("EXISTING_USER_GRANDFATHERED", legacy.rows[0]?.grandfathered === true);
    results.set("POST_MIGRATION_USER_UNVERIFIED", created.rows[0]?.email_verified_at === null);
  } finally {
    if (temp) await temp.end();
    await admin.query(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
      [databaseName],
    );
    await admin.query(`DROP DATABASE IF EXISTS ${databaseName}`);
    await admin.end();
  }
}

async function abuseMatrix() {
  const badSyntax = await request("/auth/register", {
    email: "not-an-email",
    password: password(),
    displayName: "Amoria QA",
    locale: "en",
  });
  results.set("BAD_EMAIL_SYNTAX_REJECTED", badSyntax.status === 400);

  const invalidDomain = await register(
    `invalid.${randomBytes(4).toString("hex")}@example.invalid`,
    password(),
    { deviceId: "qa-invalid-domain", ip: "198.51.100.38" },
  );
  results.set(
    "NONEXISTENT_EMAIL_DOMAIN_REJECTED",
    invalidDomain.status === 422 && invalidDomain.data?.error?.code === "invalid_email_domain",
  );

  const emailKey = `blocked.${randomBytes(4).toString("hex")}@mailinator.com`;
  const emailResponses = [];
  for (let index = 0; index < 4; index += 1) {
    emailResponses.push(await register(emailKey, password(), {
      deviceId: `qa-register-email-${index}`,
      ip: `198.51.100.${40 + index}`,
    }));
  }
  results.set(
    "DISPOSABLE_EMAIL_DOMAIN_REJECTED",
    emailResponses[0]?.status === 422 && emailResponses[0]?.data?.error?.code === "disposable_email_domain",
  );
  results.set("REGISTRATION_EMAIL_RATE_LIMIT", emailResponses.at(-1)?.status === 429);

  const ipResponses = [];
  for (let index = 0; index < 11; index += 1) {
    ipResponses.push(await register(`blocked.${index}.${randomBytes(3).toString("hex")}@mailinator.com`, password(), {
      deviceId: `qa-register-ip-${index}`,
      ip: "198.51.100.99",
    }));
  }
  results.set("REGISTRATION_IP_RATE_LIMIT", ipResponses.at(-1)?.status === 429 && Boolean(ipResponses.at(-1)?.retryAfter));

  const resendEmail = qaEmail("resend-limit");
  const resendContext = { deviceId: "qa-resend-limit", ip: "198.51.100.109" };
  const resendResponses = [];
  for (let index = 0; index < 6; index += 1) {
    resendResponses.push(await request(
      "/auth/resend-verification",
      { email: resendEmail, locale: "en" },
      resendContext,
    ));
  }
  results.set(
    "RESEND_EMAIL_RATE_LIMIT",
    resendResponses.slice(0, 5).every((response) => response.status === 200)
      && resendResponses.at(-1)?.status === 429
      && Boolean(resendResponses.at(-1)?.retryAfter),
  );

  const bruteEmail = qaEmail("brute-unknown");
  const bruteContext = { deviceId: "qa-login-brute", ip: "198.51.100.110" };
  const failures = [];
  for (let index = 0; index < 5; index += 1) {
    failures.push(await request("/auth/login", { email: bruteEmail, password: password() }, bruteContext));
  }
  results.set("LOGIN_BRUTE_FORCE_LIMIT", failures.at(-1)?.status === 429 && Boolean(failures.at(-1)?.retryAfter));
  results.set("UNKNOWN_LOGIN_GENERIC", failures.slice(0, 4).every((response) => response.data?.error?.code === "invalid_credentials"));

  const successEmail = qaEmail("allowed-login");
  const successPassword = password();
  const successContext = { deviceId: "qa-login-allowed", ip: "198.51.100.111" };
  const mailStart = Date.now();
  requireStatus(await register(successEmail, successPassword, successContext), 201, "allowed-login registration");
  const mail = await waitForCode(successEmail, "Verify your Amoria email", mailStart);
  requireStatus(await request("/auth/verify-email", { email: successEmail, code: mail.code }, successContext), 200, "allowed-login verification");
  const wrongPassword = await request("/auth/login", { email: successEmail, password: password() }, successContext);
  results.set(
    "LOGIN_WRONG_PASSWORD_GENERIC",
    wrongPassword.status === 401 && wrongPassword.data?.error?.code === "invalid_credentials",
  );
  await request("/auth/login", { email: successEmail, password: password() }, successContext);
  const success = await request("/auth/login", { email: successEmail, password: successPassword }, successContext);
  results.set("SUCCESSFUL_LOGIN_AFTER_ALLOWED_FAILURES", success.status === 200);

  const unknownReset = await request("/auth/password-reset/request", {
    email: qaEmail("unknown-reset"),
    locale: "en",
  }, { deviceId: "qa-unknown-reset", ip: "198.51.100.112" });
  results.set("UNKNOWN_RESET_GENERIC", unknownReset.status === 200 && JSON.stringify(unknownReset.data) === JSON.stringify({ ok: true }));
}

async function storageSecurity() {
  const challenges = await client.query("SELECT code_hash FROM auth_email_challenges");
  results.set("NO_PLAINTEXT_CODE_IN_DB", challenges.rows.every((row) =>
    /^[0-9a-f]{64}$/.test(row.code_hash)
    && !capturedCodes.includes(row.code_hash)),
  );
  const columns = await client.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'auth_rate_limits'",
  );
  results.set("NO_RAW_IP_COLUMN", !columns.rows.some((row) => /(^|_)ip($|_)/i.test(row.column_name)));
  const rawIp = "198.51.100.99";
  const rawRows = await client.query("SELECT count(*)::int AS count FROM auth_rate_limits WHERE key_hash = $1 OR key_hash LIKE $2", [rawIp, `%${rawIp}%`]);
  results.set("NO_RAW_IP_RATE_KEY", rawRows.rows[0].count === 0);
}

await waitForApi();
await client.connect();
try {
  await grandfatherMigrationMatrix();
  await mainFlow();
  await verificationMatrix();
  await concurrencyMatrix();
  await abuseMatrix();
  await storageSecurity();
  results.set("QA_DURATION_BOUNDED", Date.now() - startedAt < 120_000);
  const failed = [...results].filter(([, passed]) => !passed);
  for (const [name, passed] of results) console.log(`${name}=${passed ? "YES" : "NO"}`);
  console.log(`QA_ASSERTIONS=${results.size}`);
  console.log(`QA_FAILURES=${failed.length}`);
  if (failed.length) process.exitCode = 1;
} finally {
  capturedCodes.fill("[redacted]");
  await client.end();
}
